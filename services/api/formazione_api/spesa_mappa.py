"""Tetto di spesa e gestione del budget per l'estrazione della mappa concettuale."""
import hashlib
import json
from decimal import Decimal
from types import SimpleNamespace

from .generation.causa import oscura
from .generation.chunks import Chunk, plan_chunks
from .generation.concept import (
    ConceptMergePlan,
    ConceptTreeDraft,
    ISTRUZIONI_CONCEPT_MERGE,
    ISTRUZIONI_CONCEPT_TREE,
)
from .generation.instructions import materiale
from .generation.concept_multiblock import (
    albero_multiblocco,
    impronta_chunk,
    leggi_cache,
)
from .generation.concept_provider import create_concept_provider
from .generation.errors import GenerationError
from .generation.selection import config_status
from .measurement import preventivo as pv
from .measurement.guardia import adesso, costo_limite_blocco
from .measurement.prezzi import PREZZI, PrezzoMancante, carica, prezzo
from .esclusione_pagine import applica_esclusione
from .spesa_generazione import (
    GENERAZIONE_IN_CORSO,
    FornitoreRegolato,
    SpesaRifiuto,
    _non_configurato,
    decidi,
    fornitore_e_modello,
    registro,
)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def sha256_json(valore) -> str:
    testo = json.dumps(valore, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(testo.encode('utf-8')).hexdigest()


def stima_chiamate_fusione(n: int, fan_in: int = 8) -> int:
    """Calcola il numero esatto di chiamate di fusione per n alberi parziali con fan-in specificato."""
    if n <= 1:
        return 0
    conteggio = 0
    correnti = n
    while correnti > 1:
        gruppi = []
        for i in range(0, correnti, fan_in):
            dim = min(fan_in, correnti - i)
            if dim > 1:
                conteggio += 1
            gruppi.append(1)
        correnti = len(gruppi)
    return conteggio


def calcola_impronta_mappa(fornitore: str, modello: str, chunks: list[Chunk], escluse=()) -> str:
    """Calcola l'impronta complessiva della richiesta di mappa concettuale."""
    payload = {
        'versione': 1,
        'fornitore': fornitore,
        'modello': modello,
        'istruzioni': sha256_text(ISTRUZIONI_CONCEPT_TREE),
        'istruzioni_fusione': sha256_text(ISTRUZIONI_CONCEPT_MERGE),
        'pagineEscluse': sorted(escluse),
        'chunk_materiali': [sha256_text(materiale(c)) for c in chunks],
    }
    return sha256_json(payload)


def valuta_mappa(extraction: dict, provider, store, escluse=()) -> dict:
    """Stima di spesa per la mappa concettuale senza chiamare fornitori esterni."""
    if provider is None and not config_status()['configured']:
        raise _non_configurato()
    fornitore, modello = fornitore_e_modello(provider)
    if fornitore is None or modello is None:
        if provider is not None:
            fornitore = fornitore or getattr(provider, 'provider_name', None) or 'anthropic'
            modello = modello or getattr(provider, 'model', None) or 'claude-haiku-5-5'
        else:
            raise SpesaRifiuto(
                'estimate_unavailable',
                'Preventivo non disponibile: fornitore o modello non dichiarati.',
            )

    try:
        listino = prezzo(carica(PREZZI), fornitore, modello)
    except PrezzoMancante as error:
        raise SpesaRifiuto('estimate_unavailable', f'Preventivo non disponibile: {error}.') from error

    try:
        da_generare_blocks = applica_esclusione(extraction, escluse).get('blocks', [])
        chunks = pv.pianifica(da_generare_blocks)
    except GenerationError as error:
        raise SpesaRifiuto(error.code, str(error)) from error

    cache = leggi_cache(store.root, extraction.get('id', ''))
    chunks_da_generare = []
    for c in chunks:
        imp = impronta_chunk(fornitore, modello, c)
        cached_entry = cache.get('chunks', {}).get(c.id)
        if not (cached_entry and cached_entry.get('impronta') == imp):
            chunks_da_generare.append(c)

    schema_byte_map = pv.byte_utf8(json.dumps(pv.schema_inviato(fornitore, modello_bozza=ConceptTreeDraft), ensure_ascii=False))
    limiti = {}
    for c in chunks_da_generare:
        limiti[c.id] = pv.limite_blocco(
            c,
            fornitore,
            listino.sovraccarico_ingresso,
            schema_byte=schema_byte_map,
            istruzioni=ISTRUZIONI_CONCEPT_TREE,
        )

    n_fusioni = stima_chiamate_fusione(len(chunks))
    schema_byte_merge = pv.byte_utf8(json.dumps(pv.schema_inviato(fornitore, modello_bozza=ConceptMergePlan), ensure_ascii=False))
    for i in range(1, n_fusioni + 1):
        c_syn = SimpleNamespace(id=f'merge-{i}', byte_materiale=12800)
        limiti[c_syn.id] = pv.limite_blocco(
            c_syn,
            fornitore,
            listino.sovraccarico_ingresso,
            schema_byte=schema_byte_merge,
            istruzioni=ISTRUZIONI_CONCEPT_MERGE,
        )

    totale_usd = sum((costo_limite_blocco(l, listino) for l in limiti.values()), Decimal(0))
    # Come preventivo_corsa: con prezzo 0 dichiarato (piano gratuito) il limite e' completo
    # anche se il sovraccarico per chiamata non e' pubblicato (0 x qualsiasi token = 0).
    limite_completo = listino.gratuito or listino.sovraccarico_ingresso is not None
    imp_mappa = calcola_impronta_mappa(fornitore, modello, chunks, escluse=escluse)

    return {
        'chunks': chunks,
        'chunks_da_generare': chunks_da_generare,
        'limiti': limiti,
        'limiteSuperioreUSD': totale_usd,
        'limiteCompleto': limite_completo,
        'fornitore': fornitore,
        'modello': modello,
        'listino': listino,
        'cache': cache,
        'impronta': imp_mappa,
        'da_generare_blocks': da_generare_blocks,
    }


def genera_mappa_con_tetto(extraction: dict, provider, store, corsa_id: str, escluse=()) -> dict:
    """Generazione della mappa concettuale con preventivo, limiti e registro."""
    stima = valuta_mappa(extraction, provider, store, escluse=escluse)
    decidi(stima, store)

    if not GENERAZIONE_IN_CORSO.acquire(blocking=False):
        raise SpesaRifiuto('generation_in_progress', "Un'altra generazione è in corso: attendere che finisca.", 409)

    try:
        limiti_decisi = decidi(stima, store)
        reg = registro(store)
        corsa = dict(
            id=corsa_id,
            inizio=adesso(),
            documento=extraction.get('documentId'),
            fornitore=stima['fornitore'],
            modello=stima['modello'],
            budgetUSD=limiti_decisi['budgetUsd'],
            limitePerCorsoUSD=limiti_decisi['maxUsdPerCourse'],
            limiteSuperioreUSD=stima['limiteSuperioreUSD'],
            blocchi=len(stima['chunks_da_generare']),
            blocchiRiusati=len(stima['chunks']) - len(stima['chunks_da_generare']),
            blocchiTotali=len(stima['chunks']),
            addebitatoUSD=Decimal(0),
            chiamate=[],
            esito='in_corso',
        )
        reg.aggiorna_corsa(corsa)

        provider_reale = provider if provider is not None else create_concept_provider()
        sorvegliato = FornitoreRegolato(
            provider_reale,
            stima['limiti'],
            stima['listino'],
            limiti_decisi['budgetUsd'],
            reg,
            corsa,
        )

        def chiama_mappa(chunk):
            prima = len(corsa['chiamate'])
            try:
                return sorvegliato._sorvegliato(chunk, lambda: provider_reale.concept_tree(chunk), voce=dict(ruolo='mappa'))
            finally:
                sorvegliato._regola(chunk, prima)

        merge_idx = 0

        def chiama_fusione(payload: str):
            nonlocal merge_idx
            merge_idx += 1
            chunk_syn = SimpleNamespace(id=f'merge-{merge_idx}', byte_materiale=12800)
            prima = len(corsa['chiamate'])
            try:
                return sorvegliato._sorvegliato(chunk_syn, lambda: provider_reale.concept_merge(payload), voce=dict(ruolo='fusione'))
            finally:
                sorvegliato._regola(chunk_syn, prima)

        try:
            risultato = albero_multiblocco(
                stima['da_generare_blocks'],
                provider_reale,
                chiama_mappa=chiama_mappa,
                chiama_fusione=chiama_fusione,
                cache=stima['cache'],
                impronta_comune=stima['impronta'],
                store_root=store.root,
                extraction_id=extraction.get('id', ''),
            )
            corsa['esito'] = 'completata'
        except GenerationError as error:
            corsa['esito'] = 'arrestata' if error.code == 'budget_guard' else 'fallita'
            corsa['errore'] = dict(code=error.code, message=oscura(str(error)))
            raise
        except Exception as error:
            corsa['esito'] = 'fallita'
            corsa['errore'] = dict(code=type(error).__name__, message=oscura(str(error)))
            raise
        finally:
            effettivi = [c.get('effettivoUSD') for c in corsa['chiamate']]
            corsa.update(
                fine=adesso(),
                effettivoUSD=sum(effettivi, Decimal(0)) if all(e is not None for e in effettivi) else None,
            )
            reg.aggiorna_corsa(corsa)

        salvato = {
            'impronta': stima['impronta'],
            'tree': risultato['tree'],
            'treeHash': risultato['treeHash'],
            'complete': risultato['complete'],
            'warnings': risultato['warnings'],
            'createdAt': adesso(),
        }
        store.save(extraction.get('id', ''), 'concept-tree.json', salvato)

        return {
            'tree': risultato['tree'],
            'treeHash': risultato['treeHash'],
            'complete': risultato['complete'],
            'warnings': risultato['warnings'],
        }
    finally:
        GENERAZIONE_IN_CORSO.release()
