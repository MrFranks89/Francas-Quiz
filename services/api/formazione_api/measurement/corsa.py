"""Selezioni della campagna: verifica, estrazione, preventivo e corsa reale.

La corsa reale passa da generation.generate() con il fornitore creato da selection.create_provider(),
avvolto da FornitoreSorvegliato. Il fornitore si crea solo dopo che la guardia ha autorizzato la corsa:
con budget zero non viene mai creato.
"""
import json
import os
import time
import uuid
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

from ..documents import KINDS
from ..extractors import native_extract
from ..generation import GenerationError, generate
from ..generation.selection import create_provider
from ..pagine_non_lette import messaggio_blocco, pagine_bianche, pagine_non_lette
from . import preventivo as pv
from .guardia import FornitoreSorvegliato, GuardiaRifiuto, Registro, adesso, verifica_avvio
from .integrita import verifica_file, verifica_membro_zip
from .prezzi import PrezzoMancante, modelli, prezzo
from .risposte import analizza_risposte

SCHEDA_REVISIONE = {'minutiRevisione': None, 'erroriFattuali': None, 'erroriDidattici': None,
                    'domandeDaRiscrivere': None, 'approvato': None, 'note': ''}


def leggi_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_float=Decimal)


def scrivi_json(path: Path, dati) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dati, ensure_ascii=False, indent=2, default=lambda v: str(v) if isinstance(v, Decimal) else repr(v)),
                    encoding='utf-8')


def documento(manifest: dict, identificativo: str) -> dict:
    for voce in manifest['documenti']:
        if voce['id'] == identificativo:
            return voce
    raise ValueError(f'Documento assente dal manifest: {identificativo}')


def verifica_selezione(selezione: dict, manifest: dict, cartella_file: Path) -> tuple[Path, str]:
    """Restituisce il file da estrarre e il suo sha256 verificato; rifiuta se non coincide col manifest."""
    voce = documento(manifest, selezione['documento'])
    cartella = Path(cartella_file) / voce['id']
    if selezione.get('membro'):
        estratto = cartella / 'estratto' / selezione['membro']
        return estratto, verifica_membro_zip(cartella / voce['file'], voce['sha256'], selezione['membro'], estratto)
    path = cartella / voce['file']
    return path, verifica_file(path, voce['sha256'])


def estrai(selezione: dict, path: Path) -> dict:
    kind = KINDS[path.suffix.lower()]
    inizio, fine = selezione.get('pagine', [None, None])
    if kind == 'pdf' and inizio is None:
        from pypdf import PdfReader
        inizio, fine = 1, len(PdfReader(path).pages)
    if selezione.get('motore', 'native') == 'docling':
        from ..docling_adapter import docling_extract
        blocks, warnings, status = docling_extract(path, kind, inizio, fine)
    else:
        blocks, warnings, status = native_extract(path, kind, inizio, fine)
    return dict(documentId=selezione['documento'], selezione=selezione['id'], kind=kind, inizio=inizio, fine=fine,
                engine=selezione.get('motore', 'native'), blocks=blocks, warnings=warnings, status=status)


def estrai_con_cache(selezione: dict, path: Path, sha: str, cartella_cache: Path) -> dict:
    motore = selezione.get('motore', 'native')
    # La versione dichiarata dall'estrattore invalida le estrazioni salvate con una versione
    # precedente: senza, un OCR corretto rileggerebbe dalla cache l'estrazione vuota di prima.
    if motore == 'docling':
        from ..docling_adapter import VERSIONE
    else:
        from ..extractors import VERSIONE
    chiave = f"{selezione['id']}-{motore}-{sha[:16]}-{VERSIONE}.json"
    cache = Path(cartella_cache) / chiave
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    estrazione = estrai(selezione, path)
    scrivi_json(cache, estrazione)
    return estrazione


def _pagine_troncate(estrazione: dict) -> list[int]:
    """Pagine senza blocchi, escluse le pagine bianche segnalate dall'estrattore: quelle non hanno
    blocchi perché non c'è niente da leggere (02 pp. 2 e 47), non perché l'OCR si è interrotto."""
    bianche = set(pagine_bianche(estrazione['warnings']))
    return [p for p in pv.pagine_senza_testo(estrazione) if p not in bianche]


def preventivo_selezione(selezione: dict, estrazione: dict, prezzi: dict) -> dict:
    """Nessuna chiamata a fornitori: estrazione, piano dei blocchi e limite per ogni modello con prezzo."""
    risultato = dict(selezione=selezione['id'], documento=selezione['documento'], motore=estrazione['engine'],
                     caratteri=sum(len(b['text']) for b in estrazione['blocks']), stato=estrazione['status'])
    # Le scansioni sono quelle segnalate dall'estrattore (extractors.py, docling_adapter.py), non
    # una soglia di caratteri ricalcolata qui.
    if non_lette := pagine_non_lette(estrazione['warnings']):
        # Come generation_routes.py: la rotta rifiuterebbe la generazione prima del fornitore.
        risultato.update(pagineNonLette=non_lette, modelli=[],
                         rifiutataDallaPipeline=dict(code='unread_pages', message=messaggio_blocco(non_lette)))
        return risultato
    if estrazione['engine'] == 'docling' and (scoperte := _pagine_troncate(estrazione)):
        # Un preventivo su un'estrazione OCR troncata sarebbe un numero senza significato.
        risultato.update(nonStimata=f"estrazione OCR incompleta: {len(scoperte)} pagine su "
                                    f"{estrazione['fine'] - estrazione['inizio'] + 1} senza testo", modelli=[])
        return risultato
    try:
        chunks = pv.pianifica(estrazione['blocks'])
    except GenerationError as error:
        # La pipeline rifiuterebbe prima di creare il fornitore: costo zero, ma nessun corso.
        risultato.update(rifiutataDallaPipeline=dict(code=error.code, message=str(error)), modelli=[])
        return risultato
    risultato['blocchi'] = len(chunks)
    risultato['modelli'] = []
    for fornitore, modello in modelli(prezzi):
        voce = pv.preventivo_corsa(chunks, prezzo(prezzi, fornitore, modello))
        voce.pop('limiti')
        risultato['modelli'].append(voce)
    return risultato


def rapporto_scarti(scarti: list[dict]) -> dict:
    """Domande scartate dai controlli di qualità della pipeline (`scarti` del risultato di generate()).

    L'elenco completo resta in bozza.json; qui numero, regola e domanda per leggerli dal registro.
    """
    return dict(numero=len(scarti), voci=[dict(regola=s['rule'], domanda=s['prompt'], tipo=s['kind'],
                                               modulo=s['moduleId'], blocco=s['chunkId']) for s in scarti])


@contextmanager
def ambiente_fornitore(fornitore: str, modello: str):
    """selection.create_provider() legge GENERATION_PROVIDER e <FORNITORE>_MODEL: si impostano per la corsa."""
    nomi = {'GENERATION_PROVIDER': fornitore, f'{fornitore.upper()}_MODEL': modello}
    precedenti = {k: os.environ.get(k) for k in nomi}
    os.environ.update(nomi)
    try:
        yield
    finally:
        for k, v in precedenti.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def esegui_selezione(selezione: dict, estrazione: dict, sha: str, prezzi: dict, fornitore: str, modello: str,
                     budget: Decimal, registro: Registro, cartella_corse: Path) -> dict:
    """Corsa reale su una selezione. Solleva GuardiaRifiuto/PrezzoMancante prima di creare il fornitore."""
    if non_lette := pagine_non_lette(estrazione['warnings']):
        raise GuardiaRifiuto(messaggio_blocco(non_lette))   # come generation_routes.py
    listino = prezzo(prezzi, fornitore, modello)            # modello senza prezzo: rifiutato qui
    if estrazione['engine'] == 'docling' and _pagine_troncate(estrazione):
        raise GuardiaRifiuto('Estrazione OCR incompleta: nessuna spesa su materiale troncato')
    chunks = pv.pianifica(estrazione['blocks'])
    stima = pv.preventivo_corsa(chunks, listino)
    if stima['oltreSogliaContestoLungo']:
        raise GuardiaRifiuto('Un blocco supera la soglia del contesto lungo: prezzo registrato non applicabile')
    verifica_avvio(budget, registro.speso(), stima['limiteSuperioreUSD'], stima['limiteCompleto'])
    corsa_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    cartella = Path(cartella_corse) / corsa_id
    corsa = dict(id=corsa_id, inizio=adesso(), selezione=selezione['id'], documento=selezione['documento'], sha256=sha,
                 fornitore=fornitore, modello=modello, budgetUSD=budget, limiteSuperioreUSD=stima['limiteSuperioreUSD'],
                 blocchi=len(chunks), addebitatoUSD=Decimal(0), chiamate=[], esito='in_corso', cartella=str(cartella))
    registro.aggiorna_corsa(corsa)
    iniziata = time.perf_counter()
    try:
        with ambiente_fornitore(fornitore, modello):
            reale = create_provider()
        sorvegliato = FornitoreSorvegliato(reale, {l.chunk_id: l for l in stima['limiti']}, listino, budget, registro, corsa)
        risultato = generate(estrazione, sorvegliato, title=f"Misura {selezione['id']}", acknowledge_warnings=True)
        corsa['esito'] = 'completata'
        scrivi_json(cartella / 'bozza.json', risultato)
        scrivi_json(cartella / 'revisione.json', dict(corsaId=corsa_id, selezione=selezione['id'], **SCHEDA_REVISIONE))
        corsa['risposte'] = analizza_risposte(risultato['course'])
        corsa['scarti'] = rapporto_scarti(risultato['scarti'])
    except GenerationError as error:
        corsa['esito'] = 'arrestata' if error.code == 'budget_guard' else 'fallita'
        corsa['errore'] = dict(code=error.code, message=str(error))
    except Exception as error:  # registrata comunque: anche le corse fallite costano
        corsa['esito'] = 'fallita'
        corsa['errore'] = dict(code=type(error).__name__, message=str(error))
    finally:
        effettivi = [c.get('effettivoUSD') for c in corsa['chiamate']]
        corsa.update(fine=adesso(), durataMs=round((time.perf_counter() - iniziata) * 1000),
                     effettivoUSD=sum(effettivi, Decimal(0)) if all(e is not None for e in effettivi) else None)
        registro.aggiorna_corsa(corsa)
    return corsa


def riepilogo(registro: Registro) -> list[dict]:
    """Costo per corso approvato per selezione × modello: tutte le corse (anche fallite) al numeratore."""
    gruppi = {}
    for corsa in registro.leggi()['corse']:
        g = gruppi.setdefault((corsa['selezione'], corsa['fornitore'], corsa['modello']),
                              dict(selezione=corsa['selezione'], fornitore=corsa['fornitore'], modello=corsa['modello'],
                                   corse=0, fallite=0, approvati=0, daRevisionare=0,
                                   effettivoUSD=Decimal(0), effettivoCompleto=True, addebitatoUSD=Decimal(0)))
        g['corse'] += 1
        g['addebitatoUSD'] += Decimal(str(corsa.get('addebitatoUSD', 0)))
        if corsa.get('effettivoUSD') is None:
            g['effettivoCompleto'] = False
        else:
            g['effettivoUSD'] += Decimal(str(corsa['effettivoUSD']))
        if corsa['esito'] != 'completata':
            g['fallite'] += 1
            continue
        scheda = Path(corsa['cartella']) / 'revisione.json'
        approvato = json.loads(scheda.read_text(encoding='utf-8')).get('approvato') if scheda.exists() else None
        if approvato is True:
            g['approvati'] += 1
        elif approvato is None:
            g['daRevisionare'] += 1
    for g in gruppi.values():
        g['costoPerCorsoApprovatoUSD'] = (g['effettivoUSD'] / g['approvati']
                                          if g['approvati'] and g['effettivoCompleto'] else None)
    return list(gruppi.values())


__all__ = ['GuardiaRifiuto', 'PrezzoMancante', 'esegui_selezione', 'preventivo_selezione', 'riepilogo',
           'verifica_selezione', 'estrai_con_cache']
