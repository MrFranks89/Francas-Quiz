"""Prova gratuita dello schema della bozza su Anthropic: vecchio (sette varianti) contro nuovo (forma piatta).

Chiama soltanto messages.count_tokens, con la STESSA richiesta che AnthropicProvider invierebbe
(generation.anthropic_provider.richiesta, senza max_tokens), una volta con lo schema rifiutato il
9 novembre 2026 (tests/fixtures/schema-anthropic-rifiutato-2026-11-09.json, l'istantanea al tag git
prima-schema-semplice) e una volta con quello di oggi. Per ciascuno stampa se è accettato o rifiutato, con
la causa letta da generation/causa.py. Il materiale è un blocco sintetico di un carattere: conta lo schema.

Spesa zero. Fonte https://platform.claude.com/docs/en/build-with-claude/token-counting (letta il
2026-11-09): «Token counting is free to use but subject to requests per minute rate limits». Il client è
avvolto da SoloConteggio (tools/misura_sovraccarico_anthropic.py), che non espone nient'altro.

ATTENZIONE, il risultato è un indizio, non una prova. La pagina degli output strutturati
(https://platform.claude.com/docs/en/build-with-claude/structured-outputs, «Feature compatibility», letta
il 2026-11-09) dice di token counting: «Count tokens without compilation». Quindi count_tokens con ogni
probabilità NON compila la grammatica, e uno schema troppo grande per la generazione può risultare
accettato. Per questo la prova manda anche lo schema vecchio, come controllo: se il vecchio, rifiutato in
generazione, qui risulta accettato, la prova non distingue e lo dice. Solo una generazione vera dice se il
nuovo schema passa.

Variabili: ANTHROPIC_API_KEY e ANTHROPIC_MODEL, dall'ambiente o da services/api/.env (caricato con
formazione_api/ambiente.py, che non sovrascrive l'ambiente). I valori non vengono mai stampati.

  .venv\\Scripts\\python.exe services\\api\\tools\\prova_schema_anthropic.py [--modello ID]
"""
import argparse
import json
import os
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from formazione_api import ambiente  # noqa: E402
from formazione_api.generation.anthropic_provider import richiesta  # noqa: E402
from formazione_api.generation.causa import causa_errore, messaggio  # noqa: E402
from misura_sovraccarico_anthropic import (MetodoVietato, SoloConteggio, blocco_minimo,  # noqa: E402,F401
                                           parametri_count_tokens)

SCHEMA_RIFIUTATO = API / 'tests' / 'fixtures' / 'schema-anthropic-rifiutato-2026-11-09.json'


def richieste(modello: str) -> list[tuple[str, dict]]:
    """(nome, argomenti di count_tokens): la richiesta del provider senza max_tokens, con lo schema vecchio e
    con il nuovo. Il vecchio cambia solo output_config; tutto il resto è identico."""
    nuova = richiesta(modello, blocco_minimo())
    nuova.pop('max_tokens')
    estranei = set(nuova) - parametri_count_tokens()
    if estranei:
        raise ValueError(f'La richiesta del provider ha campi che count_tokens non accetta: {sorted(estranei)}')
    vecchia = {**nuova, 'output_config': json.loads(SCHEMA_RIFIUTATO.read_text(encoding='utf-8'))}
    return [('vecchio (sette varianti, rifiutato il 2026-11-09)', vecchia), ('nuovo (forma piatta)', nuova)]


def prova(contatore: SoloConteggio, nome: str, kwargs: dict) -> dict:
    import anthropic
    try:
        contati = contatore.count_tokens(**kwargs).input_tokens
    except anthropic.APIError as error:   # errori del fornitore e di rete; un errore di programmazione risale
        causa = causa_errore(error)
        return dict(schema=nome, accettato=False, messaggio=messaggio(causa, {c.__name__ for c in type(error).__mro__}),
                    causa=causa)
    return dict(schema=nome, accettato=True, contati=contati)


def giudizio(vecchio: dict, nuovo: dict) -> str:
    if not nuovo['accettato'] and nuovo['causa']['statoHttp'] != 400:
        return f"Prova non riuscita, lo schema non c'entra: {nuovo['messaggio']}"
    if not nuovo['accettato']:
        return 'Il nuovo schema è RIFIUTATO già da count_tokens: va semplificato ancora prima di generare.'
    if vecchio['accettato']:
        return ('Entrambi accettati: count_tokens non ha compilato la grammatica (la documentazione dice «Count '
                'tokens without compilation»), quindi questa prova NON dice se il nuovo schema passa in generazione. '
                'Solo una generazione vera lo dice.')
    return ('Il vecchio è rifiutato e il nuovo accettato: count_tokens ha controllato lo schema e distingue i due. '
            'Resta un indizio: la generazione vera è la prova.')


def main(argv=None, crea_client=None) -> int:
    for flusso in (sys.stdout, sys.stderr):
        if hasattr(flusso, 'reconfigure'):
            flusso.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--modello', help='ID del modello (predefinito: ANTHROPIC_MODEL)')
    args = parser.parse_args(argv)
    ambiente.carica(ambiente.percorso())
    chiave = os.getenv('ANTHROPIC_API_KEY', '').strip()
    modello = (args.modello or os.getenv('ANTHROPIC_MODEL', '')).strip()
    if not chiave or not modello:
        mancanti = [n for n, v in (('ANTHROPIC_API_KEY', chiave), ('ANTHROPIC_MODEL o --modello', modello)) if not v]
        print(f'Manca {", ".join(mancanti)}: nessun client creato, nessuna richiesta.', file=sys.stderr)
        return 1
    if crea_client is None:
        def crea_client():
            from anthropic import Anthropic
            return Anthropic(api_key=chiave, timeout=60.0, max_retries=1)
    contatore = SoloConteggio(crea_client())
    print(f'Modello: {modello}. Solo messages.count_tokens (gratuito), due richieste.')
    esiti = [prova(contatore, nome, kwargs) for nome, kwargs in richieste(modello)]
    for esito in esiti:
        if esito['accettato']:
            print(f"- {esito['schema']}: ACCETTATO ({esito['contati']} token d'ingresso)")
        else:
            print(f"- {esito['schema']}: RIFIUTATO — {esito['messaggio']}")
    print(giudizio(*esiti))
    return 0 if esiti[1]['accettato'] else 2


if __name__ == '__main__':
    sys.exit(main())
