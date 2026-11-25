"""Rotte HTTP per il Coach Orale (Voice Recall - TASK-12/13)."""
from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from .account.spesa_scope import scope_spesa
from .generation.causa import errore_fornitore
from .generation.validazione import crea_valutatore_orale
from .measurement.guardia import adesso
from .routes import read_record
from .spesa_generazione import (
    GENERAZIONE_IN_CORSO,
    SpesaRifiuto,
    _usd,
    importo_regolato,
    registro,
)
from .spesa_trascrizione import trascrivi_con_tetto
from .spesa_voice_recall import decidi_voice, valuta_voice
from .trascrizione import ESTENSIONI_AUDIO, trascrivi
from .voice_recall import (
    VoiceRecallEstimate,
    VoiceRecallPreviewRequest,
    VoiceRecallResponse,
    VoiceRecallScope,
    ValutazioneDettaglio,
    clamp_risposta_llm,
    componi_valutazione,
    copertura,
    prompt_valutazione_orale,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=['voice-recall'])

ESTENSIONI_VALIDE = {'.webm', '.wav', '.mp3', '.m4a', '.ogg'}


def _risolvi_scope_e_dati(tree: dict, branch_id: str | None, node_id: str | None, estrazione: dict):
    """Risolve branchId, nodeId, titolo, summary, keyTerms e blocchi di testo."""
    branches = tree.get('branches', [])
    nodo_trovato = None
    branch_trovato = None

    if node_id:
        for b in branches:
            for n in b.get('nodes', []):
                if n.get('id') == node_id:
                    nodo_trovato = n
                    branch_trovato = b
                    break
            if nodo_trovato:
                break
        if not nodo_trovato:
            raise HTTPException(404, detail={'code': 'NODE_NOT_FOUND', 'message': f'Nodo {node_id} non trovato.'})
        if branch_id and branch_trovato.get('id') != branch_id:
            raise HTTPException(404, detail={'code': 'NODE_NOT_FOUND', 'message': f'Nodo {node_id} non appartiene al ramo {branch_id}.'})
        branch_id_effettivo = branch_trovato.get('id')
        titolo = nodo_trovato.get('title', '')
        summary = nodo_trovato.get('summary', '')
        key_terms = list(nodo_trovato.get('keyTerms', []))
        origin_blocks = list(nodo_trovato.get('originBlocks', []))
    else:
        for b in branches:
            if b.get('id') == branch_id:
                branch_trovato = b
                break
        if not branch_trovato:
            raise HTTPException(404, detail={'code': 'BRANCH_NOT_FOUND', 'message': f'Ramo {branch_id} non trovato.'})
        branch_id_effettivo = branch_id
        titolo = branch_trovato.get('title', '')
        nodi_ramo = branch_trovato.get('nodes', [])
        summary = '\n\n'.join(n.get('summary', '') for n in nodi_ramo if n.get('summary'))
        visti = set()
        key_terms = []
        for n in nodi_ramo:
            for kt in n.get('keyTerms', []):
                if kt not in visti:
                    visti.add(kt)
                    key_terms.append(kt)
        origin_blocks = []
        for n in nodi_ramo:
            origin_blocks.extend(n.get('originBlocks', []))

    # Risoluzione blocchi sorgente
    blocchi_estrazione = estrazione.get('blocks', [])
    blocchi_sel = []
    if origin_blocks:
        ids_origin = {b_id for b_id in origin_blocks if isinstance(b_id, str)}
        blocchi_sel = [b for b in blocchi_estrazione if b.get('id') in ids_origin][:3]
    if not blocchi_sel and blocchi_estrazione:
        blocchi_sel = blocchi_estrazione[:3]

    return branch_id_effettivo, node_id, titolo, summary, key_terms, blocchi_sel


@router.post('/extractions/{identifier}/voice-recall/preview', response_model=VoiceRecallEstimate)
async def preview_voice_recall(identifier: str, body: VoiceRecallPreviewRequest, request: Request):
    """Calcola la stima preventiva di spesa per la sessione di voice recall."""
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    try:
        tree_record = store.read(identifier, 'concept-tree.json')
    except FileNotFoundError:
        raise HTTPException(409, detail={'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non ancora generata.'})
    tree = tree_record.get('tree', {})
    if not body.branchId and not body.nodeId:
        raise HTTPException(422, detail={'code': 'SCOPE_MANCANTE', 'message': 'Specificare almeno branchId o nodeId.'})

    branch_id, node_id, titolo, summary, key_terms, blocchi_sel = _risolvi_scope_e_dati(
        tree, body.branchId, body.nodeId, extraction
    )

    warnings: list[str] = []
    if not blocchi_sel:
        warnings.append('NO_SOURCE_BLOCKS')

    valutatore_override = getattr(request.app.state, 'voice_evaluator', None)
    scope = scope_spesa(getattr(request.state, 'utente', None))
    try:
        stima = valuta_voice(
            extraction=extraction,
            blocchi=blocchi_sel,
            summary=summary,
            key_terms=key_terms,
            input_tipo=body.inputTipo,
            durata_secondi=float(body.durationSeconds or 300),
            store=store,
            valutatore_override=valutatore_override,
            scope=scope,
        )
    except SpesaRifiuto as rifiuto:
        detail = {'code': rifiuto.code, 'message': str(rifiuto)}
        if getattr(rifiuto, 'scope', None):
            detail['scope'] = rifiuto.scope
        raise HTTPException(rifiuto.status, detail=detail)

    return VoiceRecallEstimate(
        blockIds=[b['id'] for b in blocchi_sel],
        costoTrascrizioneUsd=stima['costoTrascrizioneUsd'],
        costoValutazioneMaxUsd=stima['costoValutazioneMaxUsd'],
        maxCostUsd=stima['maxCostUsd'],
        fitsBudget=stima['fitsBudget'],
        remainingBudgetUsd=stima['remainingBudgetUsd'],
        valutatore={'enabled': stima['valutatore']['enabled'], 'provider': stima['valutatore']['provider']},
        warnings=warnings,
    )


@router.post('/extractions/{identifier}/voice-recall', response_model=VoiceRecallResponse)
async def esegui_voice_recall(
    identifier: str,
    request: Request,
    audio: UploadFile = File(None),
    text: str = Form(None),
    branchId: str = Form(None),
    nodeId: str = Form(None),
    language: str = Form('it'),
):
    """Valuta l'esposizione orale dello studente su un nodo o ramo concettuale."""
    # 1. Validazione input primari
    if audio is None and (text is None or not text.strip()):
        raise HTTPException(422, detail={'code': 'INPUT_MANCANTE', 'message': 'Fornire esattamente uno tra audio e text.'})
    if audio is not None and (text is not None and text.strip()):
        raise HTTPException(422, detail={'code': 'INPUT_AMBIGUO', 'message': 'Fornire solo uno tra audio e text, non entrambi.'})
    if not branchId and not nodeId:
        raise HTTPException(422, detail={'code': 'SCOPE_MANCANTE', 'message': 'Specificare almeno branchId o nodeId.'})

    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    try:
        tree_record = store.read(identifier, 'concept-tree.json')
    except FileNotFoundError:
        raise HTTPException(409, detail={'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non ancora generata.'})
    tree = tree_record.get('tree', {})
    branch_id, node_id, titolo, summary, key_terms, blocchi_sel = _risolvi_scope_e_dati(
        tree, branchId, nodeId, extraction
    )

    warnings: list[str] = []
    if not blocchi_sel:
        warnings.append('NO_SOURCE_BLOCKS')

    input_tipo = 'audio' if audio is not None else 'testo'
    temp_audio_path = None
    durata_misurata = None
    costo_trascrizione_reale = Decimal(0)

    try:
        # 2. Gestione Audio
        if audio is not None:
            ext = Path(audio.filename or '').suffix.lower()
            if ext not in ESTENSIONI_VALIDE:
                raise HTTPException(422, detail={'code': 'AUDIO_FORMAT_NON_SUPPORTATO', 'message': f'Formato audio non supportato ({ext}).'})
            audio_bytes = await audio.read()
            if len(audio_bytes) > 25 * 1024 * 1024:
                raise HTTPException(413, detail={'code': 'AUDIO_TOO_LARGE', 'message': 'File audio superiore a 25 MB.'})

            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tf:
                tf.write(audio_bytes)
                temp_audio_path = Path(tf.name)

            import mutagen
            try:
                audio_info = mutagen.File(temp_audio_path)
                durata_misurata = float(getattr(audio_info.info, 'length', 0) if audio_info and audio_info.info else 0)
            except Exception:
                durata_misurata = 0.0

            if durata_misurata > 300.0:
                raise HTTPException(422, detail={'code': 'AUDIO_TOO_LONG', 'message': 'Durata audio superiore a 300 secondi.'})

        # 3. Guardia di spesa preventiva
        valutatore_override = getattr(request.app.state, 'voice_evaluator', None)
        scope = scope_spesa(getattr(request.state, 'utente', None))
        try:
            stima = valuta_voice(
                extraction=extraction,
                blocchi=blocchi_sel,
                summary=summary,
                key_terms=key_terms,
                input_tipo=input_tipo,
                durata_secondi=durata_misurata,
                store=store,
                valutatore_override=valutatore_override,
                scope=scope,
            )
            decidi_voice(stima, store, scope=scope)
        except SpesaRifiuto as rifiuto:
            detail = {'code': rifiuto.code, 'message': str(rifiuto)}
            if getattr(rifiuto, 'scope', None):
                detail['scope'] = rifiuto.scope
            raise HTTPException(rifiuto.status, detail=detail)

        # 4. Trascrizione (E.2-1: la rotta NON tiene GENERAZIONE_IN_CORSO qui)
        if audio is not None:
            client_audio = getattr(request.app.state, 'groq_client', None)
            provider_audio = getattr(request.app.state, 'transcription_provider', None)
            try:
                blocks_tr, _, _, durata_reale = trascrivi_con_tetto(
                    store,
                    durata_misurata or 1.0,
                    lambda: trascrivi(temp_audio_path, client=client_audio, provider=provider_audio, nome=audio.filename),
                    scope=scope,
                )
                durata_misurata = durata_reale
                trascrizione = ' '.join(b.get('text', '') for b in blocks_tr).strip()
            except SpesaRifiuto as sr:
                detail = {'code': sr.code, 'message': str(sr)}
                if getattr(sr, 'scope', None):
                    detail['scope'] = sr.scope
                raise HTTPException(sr.status, detail=detail)
            except Exception as e:
                logger.exception("Errore durante la trascrizione audio")
                raise HTTPException(503, detail={'code': 'not_configured', 'message': str(e)})

            # Controllo parole parlate
            if len(trascrizione.split()) < 5:
                raise HTTPException(422, detail={'code': 'NO_SPEECH_DETECTED', 'message': 'Meno di 5 parole rilevate nell’audio.'})
        else:
            trascrizione = text.strip()
            if len(trascrizione.split()) < 5 or len(trascrizione) < 5:
                raise HTTPException(422, detail={'code': 'TEXT_TOO_SHORT', 'message': 'Testo troppo breve: inserire almeno 5 parole.'})

        # 5. Copertura keyTerms deterministica
        coperti_det, mancanti_det, score_copertura = copertura(key_terms, trascrizione)

        # 6. Valutatore LLM
        valutatore = getattr(request.app.state, 'voice_evaluator', None) or crea_valutatore_orale()
        costo_valutazione_reale = Decimal(0)
        llm_risposta = None
        provider_usato = None

        if valutatore is None:
            warnings.append('LLM_NON_CONFIGURATO')
        else:
            # Controllo chiave / configurazione
            provider_usato = valutatore.provider_name
            # Il lock di generazione si acquisisce solo qui
            if not GENERAZIONE_IN_CORSO.acquire(blocking=False):
                raise HTTPException(409, detail={'code': 'generation_in_progress', 'message': "Un'altra generazione è in corso."})
            try:
                # Ricontrollo budget dentro lock
                decidi_voice(stima, store)
                prompt_llm = prompt_valutazione_orale(
                    titolo=titolo,
                    summary=summary,
                    key_terms=key_terms,
                    blocchi_testo=[b.get('text', '') for b in blocchi_sel],
                    trascrizione=trascrizione,
                )
                reg = registro(store)
                corsa_id = str(uuid.uuid4())
                corsa = dict(
                    id=corsa_id,
                    avviata=adesso(),
                    chiusa=None,
                    limiteMassimoUSD=stima['costoValutazioneMaxUsd'],
                    addebitatoUSD=Decimal(0),
                    chiamate=[],
                    tipo='valutazione_orale',
                )
                reg.aggiorna_corsa(corsa)
                try:
                    risp_grezza = valutatore.valuta(prompt_llm)
                    llm_risposta = clamp_risposta_llm(risp_grezza)
                    # Calcolo spesa reale regolata
                    info_v = stima['valutatore']
                    if info_v.get('limite') and info_v.get('listino'):
                        imp = importo_regolato(valutatore.last_usage, info_v['limite'], info_v['listino'])
                        costo_valutazione_reale = imp if imp is not None else Decimal(stima['costoValutazioneMaxUsd'])
                    else:
                        costo_valutazione_reale = Decimal(0)
                    corsa['chiamate'].append(dict(
                        ruolo='valutazione_orale',
                        fornitore=valutatore.provider_name,
                        modello=valutatore.model,
                        usage=valutatore.last_usage,
                        costoUSD=_usd(costo_valutazione_reale),
                    ))
                    corsa['addebitatoUSD'] = costo_valutazione_reale
                    corsa['chiusa'] = adesso()
                    reg.aggiorna_corsa(corsa)
                except Exception as exc:
                    logger.warning(f"Chiamata LLM fallita: {exc}")
                    warnings.append('LLM_FALLITO')
                    corsa['chiusa'] = adesso()
                    corsa['addebitatoUSD'] = Decimal(stima['costoValutazioneMaxUsd'])
                    reg.aggiorna_corsa(corsa)
            finally:
                GENERAZIONE_IN_CORSO.release()

        # 7. Composizione del punteggio
        score_llm = llm_risposta.score if llm_risposta else None
        score_f, covered_f, missing_f, advice_f, modalita_f, warnings_comp = componi_valutazione(
            score_llm,
            score_copertura,
            coperti_det,
            mancanti_det,
            llm_risposta,
            key_terms_presenti=bool(key_terms),
            valutatore_presente=(valutatore is not None),
        )
        for w in warnings_comp:
            if w not in warnings:
                warnings.append(w)

        # Calcolo spesa totale dichiarata
        costo_totale = Decimal(stima['costoTrascrizioneUsd']) + costo_valutazione_reale

        return VoiceRecallResponse(
            transcript=trascrizione,
            score=score_f,
            covered=covered_f,
            missing=missing_f,
            advice=advice_f,
            warnings=warnings,
            costUsd=_usd(costo_totale),
            inputTipo=input_tipo,
            durataSecondi=durata_misurata,
            scope=VoiceRecallScope(branchId=branch_id, nodeId=node_id),
            valutazione=ValutazioneDettaglio(
                modalita=modalita_f,
                scoreCopertura=score_copertura,
                scoreLLM=score_llm,
                provider=provider_usato if llm_risposta else None,
            ),
            fonti=[b['id'] for b in blocchi_sel],
        )

    finally:
        if temp_audio_path and temp_audio_path.exists():
            try:
                temp_audio_path.unlink()
            except Exception:
                pass
