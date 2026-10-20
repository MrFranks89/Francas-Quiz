"""Misura della generazione sul corpus di prova, con tetto di spesa (docs/MISURE.md).

  preventivo (predefinito)  verifica hash, estrae, pianifica i blocchi, stampa il limite superiore in USD
  esegui --budget-usd X --provider P --model M [--selezione ID]   corsa reale attraverso generate()
  riepilogo                 costo per corso approvato dal registro e dalle schede di revisione
"""
import argparse
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services' / 'api'))
# OCR solo con modelli già scaricati: nessun download durante la misura (come tools/smoke_ocr.py).
os.environ.setdefault('DOCLING_ARTIFACTS_PATH', str(ROOT / '.cache' / 'docling'))
os.environ.setdefault('HF_HOME', str(ROOT / '.cache' / 'huggingface'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'

from formazione_api.measurement import corsa as misura  # noqa: E402
from formazione_api.measurement.guardia import GuardiaRifiuto, Registro, adesso  # noqa: E402
from formazione_api.measurement.integrita import FileNonConforme  # noqa: E402
from formazione_api.measurement.prezzi import PrezzoMancante, carica  # noqa: E402

CORPUS = ROOT / 'tests' / 'corpus'
USCITA = ROOT / 'var' / 'misure'


def selezioni(campagna, scelta):
    elenco = [s for s in campagna['selezioni'] if not scelta or s['id'] in scelta]
    mancanti = set(scelta or []) - {s['id'] for s in elenco}
    if mancanti:
        raise SystemExit(f'Selezioni assenti dalla campagna: {sorted(mancanti)}')
    return elenco


def prepara(selezione, manifest):
    path, sha = misura.verifica_selezione(selezione, manifest, CORPUS / 'files')
    return misura.estrai_con_cache(selezione, path, sha, USCITA / 'estrazioni'), sha


def comando_preventivo(args, manifest, campagna, prezzi):
    righe, rapporto = [], dict(creatoIl=adesso(), valuta='USD', selezioni=[])
    for selezione in selezioni(campagna, args.selezione):
        print(f"- {selezione['id']}", file=sys.stderr, flush=True)
        try:
            estrazione, sha = prepara(selezione, manifest)
        except FileNonConforme as error:
            rapporto['selezioni'].append(dict(selezione=selezione['id'], rifiutata=str(error)))
            righe.append((selezione['id'], 'RIFIUTATA: hash', '', '', '', ''))
            continue
        except RuntimeError as error:   # OCR non disponibile in locale
            rapporto['selezioni'].append(dict(selezione=selezione['id'], nonStimata=str(error)))
            righe.append((selezione['id'], 'NON STIMATA: ' + str(error)[:40], '', '', '', ''))
            continue
        except Exception as error:      # l'estrattore del prodotto fallisce: la rotta risponderebbe 422
            motivo = f'{type(error).__name__}: {error}'
            rapporto['selezioni'].append(dict(selezione=selezione['id'], nonStimata='estrazione fallita: ' + motivo))
            righe.append((selezione['id'], 'NON STIMATA: estrazione fallita (' + type(error).__name__ + ')', '', '', '', ''))
            continue
        voce = misura.preventivo_selezione(selezione, estrazione, prezzi)
        voce['sha256'] = sha
        rapporto['selezioni'].append(voce)
        if 'nonStimata' in voce:
            righe.append((selezione['id'], 'NON STIMATA: ' + voce['nonStimata'], '', '', '', ''))
        if 'rifiutataDallaPipeline' in voce:
            righe.append((selezione['id'], 'RIFIUTATA dalla pipeline: ' + voce['rifiutataDallaPipeline']['code'], '', '', '', ''))
        for m in voce['modelli']:
            righe.append((selezione['id'], f"{m['fornitore']}/{m['modello']}", m['blocchi'], m['chiamateMassime'],
                          f"{m['limiteSuperioreUSD']:.4f}", 'sì' if m['limiteCompleto'] else 'NO'))
    USCITA.mkdir(parents=True, exist_ok=True)
    destinazione = USCITA / f"preventivo-{rapporto['creatoIl'].replace(':', '')}.json"
    misura.scrivi_json(destinazione, rapporto)
    intestazione = ('selezione', 'modello', 'blocchi', 'chiamate max', 'limite USD', 'completo')
    larghezze = [max(len(str(r[i])) for r in [intestazione, *righe]) for i in range(6)]
    for riga in [intestazione, *righe]:
        print('  '.join(str(v).ljust(larghezze[i]) for i, v in enumerate(riga)))
    for voce in rapporto['selezioni']:
        if voce.get('probabileScansione'):
            pagine = voce['probabileScansione']
            print(f"{voce['selezione']}: {len(pagine)} pagine con meno di 400 caratteri nativi (probabile scansione): {pagine}")
    print('Limite «completo = NO»: esclude i token che il fornitore aggiunge da sé (non pubblicati); '
          'nessuna corsa reale è ammessa finché non sono registrati in prezzi.json.')
    print(f'Rapporto: {destinazione}')


def comando_esegui(args, manifest, campagna, prezzi):
    try:
        budget = Decimal(args.budget_usd)
    except InvalidOperation:
        raise SystemExit('--budget-usd deve essere un numero')
    registro = Registro(USCITA / 'registro-spesa.json')
    for selezione in selezioni(campagna, args.selezione):
        estrazione, sha = prepara(selezione, manifest)
        try:
            corsa = misura.esegui_selezione(selezione, estrazione, sha, prezzi, args.provider, args.model,
                                            budget, registro, USCITA / 'corse')
        except (GuardiaRifiuto, PrezzoMancante) as error:
            print(f"{selezione['id']}: corsa rifiutata dalla guardia: {error}")
            return 2
        print(json.dumps({k: corsa.get(k) for k in ('id', 'selezione', 'esito', 'errore', 'addebitatoUSD', 'effettivoUSD', 'durataMs')},
                         ensure_ascii=False, default=str))
        for avviso in corsa.get('risposte', {}).get('avvisi', []):
            print(f"{selezione['id']}: {avviso}")
        if corsa['esito'] == 'arrestata':
            return 3
    return 0


def comando_riepilogo(args, *_):
    for riga in misura.riepilogo(Registro(USCITA / 'registro-spesa.json')):
        print(json.dumps(riga, ensure_ascii=False, default=str))


def main(argv=None):
    for flusso in (sys.stdout, sys.stderr):
        flusso.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='comando')
    for nome in ('preventivo', 'esegui', 'riepilogo'):
        p = sub.add_parser(nome)
        p.add_argument('--selezione', action='append', help='ID di selezione della campagna (ripetibile)')
        if nome == 'esegui':
            p.add_argument('--budget-usd', required=True)
            p.add_argument('--provider', required=True, choices=['openai', 'anthropic'])
            p.add_argument('--model', required=True)
    args = parser.parse_args(argv)
    comando = args.comando or 'preventivo'
    if comando == 'preventivo' and args.comando is None:
        args.selezione = None
    manifest = json.loads((CORPUS / 'manifest.json').read_text(encoding='utf-8'))
    campagna = json.loads((CORPUS / 'campagna.json').read_text(encoding='utf-8'))
    prezzi = carica(CORPUS / 'prezzi.json')
    return {'preventivo': comando_preventivo, 'esegui': comando_esegui, 'riepilogo': comando_riepilogo}[comando](
        args, manifest, campagna, prezzi) or 0


if __name__ == '__main__':
    sys.exit(main())
