"""Limite superiore di token e costo, senza alcuna chiamata a fornitori.

Perché i byte sono un maggiorante dei token: i tokenizzatori dei fornitori lavorano su byte UTF-8
e un token del testo non rappresenta mai meno di un byte, quindi un testo di N byte produce al più
N token. Questo vale per il TESTO inviato. Non copre i token che il fornitore aggiunge da sé:
marcatori di ruolo e, con gli output strutturati, un prompt di sistema iniettato. Anthropic lo
dichiara («Claude automatically receives an additional system prompt», pagina structured-outputs)
senza pubblicarne la dimensione; OpenAI non pubblica nulla al riguardo. Quella quota è il campo
`sovraccaricoIngressoPerChiamata` di prezzi.json: finché è null il limite è dichiarato incompleto e
la guardia rifiuta ogni corsa reale (vedi guardia.verifica_avvio).

Si contano: istruzioni + materiale (stesse funzioni di generation/instructions.py usate dai
fornitori) + schema JSON dell'output, prodotto con la stessa funzione che usa ciascun fornitore.
"""
import inspect
import json
from dataclasses import dataclass
from decimal import Decimal

from ..generation import generate
from ..generation.chunks import Chunk, plan_chunks
from ..generation.instructions import ISTRUZIONI_DIDATTICHE, MAX_OUTPUT_TOKENS, MAX_RETRIES, materiale
from ..generation.models import ModuleDraft
from .prezzi import MILIONE, Prezzo

# Valori predefiniti letti dalla firma di generate(), non copiati: se la pipeline cambia, cambia anche qui.
_PARAMETRI = inspect.signature(generate).parameters
MAX_CHARS = _PARAMETRI['max_chars'].default
MAX_CHUNKS = _PARAMETRI['max_chunks'].default

# Ogni tentativo può essere fatturato: la chiamata più i retry dello SDK (max_retries=MAX_RETRIES).
TENTATIVI_PER_CHIAMATA = 1 + MAX_RETRIES


def schema_inviato(fornitore: str) -> dict:
    """Lo schema dell'output come lo costruisce lo SDK del fornitore, con la stessa funzione."""
    if fornitore == 'openai':
        # OpenAIProvider chiama responses.parse(text_format=ModuleDraft); parse() costruisce
        # text.format con type_to_text_format_param (openai/resources/responses/responses.py 3.31.0).
        from openai.lib._parsing._responses import type_to_text_format_param
        return type_to_text_format_param(ModuleDraft)
    if fornitore == 'anthropic':
        from ..generation.anthropic_provider import _schema
        return {'type': 'json_schema', 'schema': _schema()}
    raise ValueError(f'Fornitore sconosciuto: {fornitore}')


def byte_utf8(testo: str) -> int:
    return len(testo.encode('utf-8'))


@dataclass(frozen=True)
class LimiteBlocco:
    chunk_id: str
    byte_istruzioni: int
    byte_materiale: int
    byte_schema: int
    sovraccarico: int | None   # None: quota del fornitore non pubblicata, limite incompleto
    uscita_massima: int
    tentativi: int

    @property
    def ingresso_massimo_per_tentativo(self) -> int:
        return self.byte_istruzioni + self.byte_materiale + self.byte_schema + (self.sovraccarico or 0)

    @property
    def completo(self) -> bool:
        return self.sovraccarico is not None


def limite_blocco(chunk: Chunk, fornitore: str, sovraccarico: int | None, schema_byte: int | None = None) -> LimiteBlocco:
    if schema_byte is None:
        schema_byte = byte_utf8(json.dumps(schema_inviato(fornitore), ensure_ascii=False))
    return LimiteBlocco(chunk.id, byte_utf8(ISTRUZIONI_DIDATTICHE), byte_utf8(materiale(chunk)), schema_byte,
                        sovraccarico, MAX_OUTPUT_TOKENS, TENTATIVI_PER_CHIAMATA)


def costo_tentativo(token_ingresso: int, token_uscita: int, prezzo: Prezzo) -> Decimal:
    """Costo massimo di un tentativo: tariffa d'ingresso più alta e maggiorazione massima."""
    return (Decimal(token_ingresso) * prezzo.ingresso_massimo + Decimal(token_uscita) * prezzo.uscita) \
        / MILIONE * prezzo.moltiplicatore_massimo


def costo_limite_blocco(limite: LimiteBlocco, prezzo: Prezzo) -> Decimal:
    return costo_tentativo(limite.ingresso_massimo_per_tentativo, limite.uscita_massima, prezzo) * limite.tentativi


def oltre_soglia(limite: LimiteBlocco, prezzo: Prezzo) -> bool:
    """Oltre la soglia del contesto lungo la tariffa è diversa da quella registrata: si rifiuta."""
    return prezzo.soglia_contesto_lungo is not None and limite.ingresso_massimo_per_tentativo > prezzo.soglia_contesto_lungo


def pianifica(blocks: list[dict]) -> list[Chunk]:
    """Stessa pianificazione e stessi limiti di generate(); solleva GenerationError come la pipeline."""
    return plan_chunks(blocks, MAX_CHARS, MAX_CHUNKS)


def preventivo_corsa(chunks: list[Chunk], prezzo: Prezzo) -> dict:
    schema = byte_utf8(json.dumps(schema_inviato(prezzo.fornitore), ensure_ascii=False))
    limiti = [limite_blocco(c, prezzo.fornitore, prezzo.sovraccarico_ingresso, schema) for c in chunks]
    return dict(
        fornitore=prezzo.fornitore, modello=prezzo.modello, blocchi=len(chunks),
        chiamateMassime=len(chunks) * TENTATIVI_PER_CHIAMATA,
        tokenIngressoMassimi=sum(l.ingresso_massimo_per_tentativo * l.tentativi for l in limiti),
        tokenUscitaMassimi=sum(l.uscita_massima * l.tentativi for l in limiti),
        limiteSuperioreUSD=sum((costo_limite_blocco(l, prezzo) for l in limiti), Decimal(0)),
        limiteCompleto=all(l.completo for l in limiti),
        oltreSogliaContestoLungo=any(oltre_soglia(l, prezzo) for l in limiti),
        limiti=limiti)


def pagine_poco_testo(blocks: list[dict], inizio: int, fine: int, soglia: int = 400) -> list[int]:
    """Pagine con meno di `soglia` caratteri di testo nativo: probabile scansione.
    extractors.py segnala solo le pagine vuote; una scansione con intestazione testuale passa
    inosservata (difetto noto, da correggere a parte): qui la si rende solo visibile."""
    per_pagina = {}
    for block in blocks:
        if block.get('page') is not None:
            per_pagina[block['page']] = per_pagina.get(block['page'], 0) + len(block['text'].strip())
    return [p for p in range(inizio, fine + 1) if per_pagina.get(p, 0) < soglia]
