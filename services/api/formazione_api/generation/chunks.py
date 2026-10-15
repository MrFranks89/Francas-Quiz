from dataclasses import dataclass
from .errors import GenerationError


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


def plan_chunks(blocks: list[dict], max_chars=12000, max_chunks=40) -> list[Chunk]:
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
