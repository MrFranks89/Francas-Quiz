import os
from dataclasses import dataclass
from .errors import GenerationError

GENERATION_MAX_TOKENS_PER_CALL = int(os.getenv('GENERATION_MAX_TOKENS_PER_CALL', '6000'))


def stima_token_richiesta(testo_chars: int, output_tokens: int = 2000, overhead_tokens: int = 1200) -> int:
    """Stima prudenziale dei token totali (prompt + output) per caratteri di materiale in italiano."""
    return int(overhead_tokens + output_tokens + (testo_chars / 2.8))


def max_chars_per_tetto_token(max_tokens: int = GENERATION_MAX_TOKENS_PER_CALL,
                              output_tokens: int = 2000, overhead_tokens: int = 1200) -> int:
    """Caratteri massimi per chunk per non superare il tetto token per chiamata."""
    rimanenti = max(500, max_tokens - output_tokens - overhead_tokens)
    return int(rimanenti * 2.8)


@dataclass(frozen=True)
class SourcePiece:
    source_id: str
    start: int
    end: int
    text: str


@dataclass(frozen=True)
class Chunk:
    id: str
    pieces: tuple[SourcePiece, ...]


def plan_chunks(blocks: list[dict], max_chars: int = 8000, max_chunks: int = 40) -> list[Chunk]:
    """Bounded, lossless partition. Prefer paragraph boundaries; retain whitespace."""
    if max_chars < 1 or max_chunks < 1:
        raise GenerationError('invalid_budget', 'Limiti generazione non validi')
    chunks, current, size = [], [], 0
    for block in blocks:
        text = block['text']
        offset = 0
        while offset < len(text):
            room = max_chars - size
            end = min(len(text), offset + room)
            if end < len(text):
                boundary = text.rfind('\n\n', offset, end)
                if boundary > offset:
                    end = boundary + 2
            piece = SourcePiece(block['id'], offset, end, text[offset:end])
            current.append(piece)
            size += end - offset
            offset = end
            if size == max_chars or offset < len(text):
                chunks.append(Chunk(f'chunk-{len(chunks)+1}', tuple(current)))
                current, size = [], 0
                if len(chunks) > max_chunks:
                    raise GenerationError('budget_exceeded', 'Documento oltre il limite: ridurre le pagine o aumentare il budget configurato')
    if current:
        chunks.append(Chunk(f'chunk-{len(chunks)+1}', tuple(current)))
    if len(chunks) > max_chunks:
        raise GenerationError('budget_exceeded', 'Numero massimo di blocchi superato')
    if not chunks:
        raise GenerationError('empty_extraction', 'Nessun testo da trasformare in corso')
    return chunks


def dimezza_chunk(chunk: Chunk) -> tuple[Chunk, Chunk]:
    """Dimezza un chunk in due sotto-chunk preservando la lossless partition dei SourcePiece."""
    all_pieces = list(chunk.pieces)
    if len(all_pieces) > 1:
        meta = len(all_pieces) // 2
        p1 = tuple(all_pieces[:meta])
        p2 = tuple(all_pieces[meta:])
        return Chunk(f'{chunk.id}a', p1), Chunk(f'{chunk.id}b', p2)
    # Singolo pezzo: spezza il testo del pezzo
    p = all_pieces[0]
    mid = len(p.text) // 2
    # Cerca confine di paragrafo o spazio vicino al centro
    split_pos = p.text.rfind('\n\n', 0, mid + 200)
    if split_pos == -1 or split_pos < mid - 200:
        split_pos = p.text.rfind('\n', 0, mid + 100)
    if split_pos == -1 or split_pos < mid - 200:
        split_pos = p.text.rfind(' ', 0, mid + 50)
    if split_pos == -1 or split_pos <= 0:
        split_pos = max(1, mid)
    p1 = SourcePiece(p.source_id, p.start, p.start + split_pos, p.text[:split_pos])
    p2 = SourcePiece(p.source_id, p.start + split_pos, p.end, p.text[split_pos:])
    return Chunk(f'{chunk.id}a', (p1,)), Chunk(f'{chunk.id}b', (p2,))
