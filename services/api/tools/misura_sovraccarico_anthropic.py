"""Misura della quota d'ingresso che Anthropic aggiunge da sé a ogni chiamata (docs/MISURE.md).

Il preventivo maggiora i token d'ingresso con i byte UTF-8 di istruzioni + materiale + schema; restano
fuori i token aggiunti dal fornitore (marcatori, prompt di sistema degli output strutturati). Questo
script li misura con l'endpoint di conteggio token, sulla STESSA richiesta che AnthropicProvider invia
(generation.anthropic_provider.richiesta), per un campione di blocchi reali del corpus.

Spesa zero: si chiama soltanto messages.count_tokens. Fonte
https://platform.claude.com/docs/en/build-with-claude/token-counting (letta il 2026-10-20):
«Token counting is free to use but subject to requests per minute rate limits».
Il client è avvolto da SoloConteggio, che non espone nient'altro (create, parse, stream, batches).

Non scrive in formazione_api/config/prezzi.json: stampa la quota proposta e scrive il rapporto in var/misure/.

  python services/api/tools/misura_sovraccarico_anthropic.py [--selezione ID ...]
"""
import argparse
import inspect
import json
import math
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services' / 'api'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from formazione_api.generation.anthropic_provider import richiesta  # noqa: E402
from formazione_api.generation.chunks import Chunk, SourcePiece  # noqa: E402
from formazione_api.measurement import preventivo as pv  # noqa: E402

FORNITORE = 'anthropic'

# Margine per la natura di stima del conteggio. Fonte (pagina token-counting, letta il 2026-10-20):
# «The token count is an estimate. In some cases, the actual number of input tokens used when
# creating a message might differ by a small amount.»
# La pagina non quantifica «a small amount». Si sceglie il 5% del conteggio più alto del campione,
# arrotondato per eccesso: un errore di stima è proporzionale alla richiesta, e il 5% del blocco più
# lungo copre anche i blocchi più corti. Lo stesso paragrafo dice che il conteggio «may include tokens
# added automatically by Anthropic for system optimizations. You are not billed for system-added
# tokens»: questi gonfiano il conteggio rispetto al fatturato, quindi spostano la misura dalla parte
# prudente e non riducono il margine.
MARGINE_RELATIVO = 0.05

# Limite di richieste: tier più basso 5.000 RPM (tabella «Pricing and rate limits» della stessa pagina),
# limite separato da quello della creazione dei messaggi. Una richiesta al secondo resta lontanissima.
INTERVALLO_SECONDI = 1.0


class MetodoVietato(AttributeError):
    pass


class SoloConteggio:
    """Client avvolto: espone soltanto count_tokens. Qualunque altro attributo (messages, create, parse,
    stream, batches, beta, ...) solleva MetodoVietato, così un errore di programmazione non può spendere."""
    __slots__ = ('_conta',)

    def __init__(self, client):
        object.__setattr__(self, '_conta', client.messages.count_tokens)

    def count_tokens(self, **kwargs):
        return self._conta(**kwargs)

    def __getattr__(self, nome):
        raise MetodoVietato(f'Solo count_tokens è ammesso nella misura del sovraccarico, non {nome!r}')

    def __setattr__(self, nome, valore):
        raise MetodoVietato('SoloConteggio non si modifica')


def parametri_count_tokens() -> set[str]:
    """Parametri accettati da messages.count_tokens nell'SDK installato (letti dalla firma, non ricordati)."""
    from anthropic.resources.messages.messages import Messages
    return set(inspect.signature(Messages.count_tokens).parameters) - {'self'}


def richiesta_conteggio(modello: str, chunk: Chunk) -> dict:
    """La richiesta di AnthropicProvider senza max_tokens: count_tokens non lo accetta (firma in
    anthropic/resources/messages/messages.py 1.15.0) e non è un token d'ingresso. Ogni altro campo è
    passato com'è; se il provider ne aggiungesse uno che count_tokens non accetta, si rifiuta invece
    di misurare una richiesta diversa."""
    kwargs = richiesta(modello, chunk)
    kwargs.pop('max_tokens')
    estranei = set(kwargs) - parametri_count_tokens()
    if estranei:
        raise ValueError(f'La richiesta del provider ha campi che count_tokens non accetta: {sorted(estranei)}')
    return kwargs


def maggiorante_byte(chunk: Chunk) -> int:
    """Lo stesso limite per tentativo del preventivo, senza sovraccarico (è ciò che si misura)."""
    return pv.limite_blocco(chunk, FORNITORE, None).ingresso_massimo_per_tentativo


def campione(chunks: list[Chunk]) -> list[Chunk]:
    """Il più corto, il mediano e il più lungo per maggiorante; tutti se sono meno di tre."""
    ordinati = sorted(chunks, key=maggiorante_byte)
    scelti = [ordinati[0], ordinati[len(ordinati) // 2], ordinati[-1]]
    return list({c.id: c for c in scelti}.values())


def blocco_minimo() -> Chunk:
    """Blocco sintetico di un carattere: lo scarto fra byte e token viene quasi tutto da istruzioni e
    schema, quindi il blocco più corto possibile è il caso peggiore per un sovraccarico costante."""
    return Chunk('chunk-minimo', (SourcePiece('sintetico', 0, 1, 'a'),))


def conta(contatore: SoloConteggio, modelli: list[str], gruppi: list[tuple[str, list[Chunk]]],
          intervallo=INTERVALLO_SECONDI, orologio=time.monotonic, dormi=time.sleep, avanzamento=None) -> list[dict]:
    misure, ultima = [], None
    for modello in modelli:
        for selezione, chunks in gruppi:
            for chunk in chunks:
                if ultima is not None and (attesa := intervallo - (orologio() - ultima)) > 0:
                    dormi(attesa)
                ultima = orologio()
                contati = contatore.count_tokens(**richiesta_conteggio(modello, chunk)).input_tokens
                limite = pv.limite_blocco(chunk, FORNITORE, None)
                maggiorante = limite.ingresso_massimo_per_tentativo
                misure.append(dict(modello=modello, selezione=selezione, chunkId=chunk.id,
                                   byteIstruzioni=limite.byte_istruzioni, byteMateriale=limite.byte_materiale,
                                   byteSchema=limite.byte_schema, maggioranteByte=maggiorante, contati=contati,
                                   differenza=contati - maggiorante, rapporto=round(contati / maggiorante, 4)))
                if avanzamento:
                    avanzamento(misure[-1])
    return misure


def quota(misure: list[dict], margine_relativo=MARGINE_RELATIVO) -> dict:
    """quota = max(0, max(contati − maggiorante)) + margine, margine = ⌈margine_relativo × max(contati)⌉."""
    if not misure:
        raise ValueError('Nessuna misura: quota non calcolabile')
    scarto = max(m['differenza'] for m in misure)
    margine = math.ceil(margine_relativo * max(m['contati'] for m in misure))
    risultato = dict(misure=len(misure), scartoMassimo=scarto, margine=margine, margineRelativo=margine_relativo,
                     quotaProposta=max(0, scarto) + margine, rapportoMassimo=max(m['rapporto'] for m in misure),
                     copertoDalMaggiorante=scarto + margine <= 0)
    if risultato['copertoDalMaggiorante']:
        risultato['giudizio'] = (f'Il maggiorante in byte copre già tutti i conteggi: il conteggio più vicino resta '
                                 f'{-scarto} token sotto il maggiorante (rapporto massimo {risultato["rapportoMassimo"]}), '
                                 f'più del margine di stima ({margine}). Quota strettamente necessaria: 0; '
                                 f'{risultato["quotaProposta"]} è il valore prudente con il margine.')
    else:
        risultato['giudizio'] = (f'Il maggiorante in byte NON copre i conteggi: scarto massimo {scarto} token; '
                                 f'quota da registrare {risultato["quotaProposta"]} (scarto + margine {margine}).')
    return risultato


def prepara_gruppi(scelta) -> tuple[list[tuple[str, list[Chunk]]], list[dict], list[str]]:
    """Hash, estrazione e piano dei blocchi con le stesse funzioni del preventivo (measure_generation.prepara,
    corsa.preventivo_selezione, preventivo.pianifica). Import qui: imposta l'ambiente dell'OCR."""
    import measure_generation as mg
    from formazione_api.measurement import corsa as misura
    from formazione_api.measurement.integrita import FileNonConforme
    from formazione_api.measurement.prezzi import PREZZI, carica, modelli
    manifest = json.loads((mg.CORPUS / 'manifest.json').read_text(encoding='utf-8'))
    campagna = json.loads((mg.CORPUS / 'campagna.json').read_text(encoding='utf-8'))
    prezzi = carica(PREZZI)
    nomi = [m for f, m in modelli(prezzi) if f == FORNITORE]
    gruppi, escluse = [], []
    for selezione in mg.selezioni(campagna, scelta):
        print(f"- {selezione['id']}", file=sys.stderr, flush=True)
        try:
            estrazione, _sha = mg.prepara(selezione, manifest)
        except FileNonConforme as error:
            escluse.append(dict(selezione=selezione['id'], motivo=f'hash: {error}'))
            continue
        except Exception as error:   # stessa resa del preventivo: estrazione o OCR non disponibili
            escluse.append(dict(selezione=selezione['id'], motivo=f'estrazione fallita: {type(error).__name__}: {error}'))
            continue
        voce = misura.preventivo_selezione(selezione, estrazione, prezzi)
        if 'nonStimata' in voce or 'rifiutataDallaPipeline' in voce:
            escluse.append(dict(selezione=selezione['id'],
                                motivo=voce.get('nonStimata') or voce['rifiutataDallaPipeline']['code']))
            continue
        gruppi.append((selezione['id'], campione(pv.pianifica(estrazione['blocks']))))
    gruppi.append(('sintetico-minimo', [blocco_minimo()]))
    return gruppi, escluse, nomi


def errore_leggibile(error) -> str | None:
    """Classi tipizzate dell'SDK anthropic 1.15.0 (anthropic/_exceptions.py, mappa degli stati in
    _client.py _make_status_error). 402 billing_error non ha una classe propria: arriva come
    APIStatusError con status_code 402 (codici da https://platform.claude.com/docs/en/api/errors)."""
    import anthropic
    if isinstance(error, anthropic.AuthenticationError):
        return 'Chiave rifiutata (401 authentication_error): controllare ANTHROPIC_API_KEY.'
    if isinstance(error, anthropic.PermissionDeniedError):
        return 'Permesso negato (403 permission_error): la chiave non può usare questo modello o questa risorsa.'
    if isinstance(error, anthropic.RateLimitError):
        return 'Limite di richieste raggiunto (429 rate_limit_error): riprovare fra qualche minuto.'
    if isinstance(error, anthropic.NotFoundError):
        return 'Risorsa non trovata (404 not_found_error): il modello di prezzi.json potrebbe non esistere per questa chiave.'
    if isinstance(error, anthropic.BadRequestError):
        return f'Richiesta rifiutata (400 invalid_request_error, anche per limite di spesa impostato): {error.message}'
    if isinstance(error, anthropic.APIStatusError):
        if error.status_code == 402:
            return 'Problema di fatturazione (402 billing_error): controllare il saldo e i dati di pagamento nella Console.'
        return f'Errore del fornitore ({error.status_code}): {error.message}'
    if isinstance(error, anthropic.APIConnectionError):
        return 'Connessione ad Anthropic non riuscita: controllare la rete.'
    return None


def stampa_tabella(misure: list[dict]) -> None:
    intestazione = ('modello', 'selezione', 'blocco', 'contati', 'maggiorante', 'differenza', 'rapporto')
    righe = [(m['modello'], m['selezione'], m['chunkId'], m['contati'], m['maggioranteByte'], m['differenza'],
              m['rapporto']) for m in misure]
    larghezze = [max(len(str(r[i])) for r in [intestazione, *righe]) for i in range(len(intestazione))]
    for riga in [intestazione, *righe]:
        print('  '.join(str(v).ljust(larghezze[i]) for i, v in enumerate(riga)))


def main(argv=None, crea_client=None) -> int:
    for flusso in (sys.stdout, sys.stderr):
        if hasattr(flusso, 'reconfigure'):
            flusso.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--selezione', action='append', help='ID di selezione della campagna (ripetibile)')
    args = parser.parse_args(argv)
    chiave = os.getenv('ANTHROPIC_API_KEY', '').strip()
    if not chiave:
        print('ANTHROPIC_API_KEY non impostata nel processo: nessun client creato, nessuna richiesta.\n'
              'In PowerShell: $env:ANTHROPIC_API_KEY = "..." e rilanciare.', file=sys.stderr)
        return 1
    gruppi, escluse, modelli = prepara_gruppi(args.selezione)
    if crea_client is None:
        def crea_client():
            from anthropic import Anthropic
            return Anthropic(api_key=chiave, timeout=30.0, max_retries=2)
    contatore = SoloConteggio(crea_client())
    totale = len(modelli) * sum(len(c) for _, c in gruppi)
    print(f'{totale} conteggi ({len(modelli)} modelli), uno al secondo al massimo.', file=sys.stderr, flush=True)
    from formazione_api.measurement.guardia import adesso
    from formazione_api.measurement.corsa import scrivi_json
    rapporto = dict(creatoIl=adesso(), fornitore=FORNITORE, endpoint='messages.count_tokens',
                    fonte='https://platform.claude.com/docs/en/build-with-claude/token-counting',
                    escluse=escluse, misure=[])
    destinazione = ROOT / 'var' / 'misure' / f"sovraccarico-anthropic-{rapporto['creatoIl'].replace(':', '')}.json"
    try:
        rapporto['misure'] = conta(contatore, modelli, gruppi, intervallo=INTERVALLO_SECONDI,
                                   avanzamento=lambda m: print(f"  {m['modello']} {m['selezione']} {m['chunkId']}: "
                                                               f"{m['contati']}", file=sys.stderr, flush=True))
    except Exception as error:
        messaggio = errore_leggibile(error)
        if messaggio is None:
            raise
        rapporto['errore'] = messaggio
        scrivi_json(destinazione, rapporto)
        print(f'Misura interrotta. {messaggio}\nRapporto parziale: {destinazione}', file=sys.stderr)
        return 2
    rapporto['quotaPerModello'] = {m: quota([x for x in rapporto['misure'] if x['modello'] == m]) for m in modelli}
    rapporto['quota'] = quota(rapporto['misure'])
    scrivi_json(destinazione, rapporto)
    stampa_tabella(rapporto['misure'])
    for voce in escluse:
        print(f"Esclusa {voce['selezione']}: {voce['motivo']}")
    for modello, q in rapporto['quotaPerModello'].items():
        print(f"{modello}: scarto massimo {q['scartoMassimo']}, margine {q['margine']}, quota {q['quotaProposta']}")
    print(rapporto['quota']['giudizio'])
    print(f"Valore proposto per sovraccaricoIngressoPerChiamata.token (anthropic): {rapporto['quota']['quotaProposta']} "
          '(da registrare a mano in prezzi.json, con la fonte).')
    print(f'Rapporto: {destinazione}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
