"""Risoluzione di riferimenti alle fonti (sourceRefs) verso blocchi di estrazione."""
import re

_BLOCK_RE = re.compile(r'^(b\d+)(?::\d+(?:-\d+)?)?$')
_PAGE_OFFSET_RE = re.compile(r'^(?:p\.?|pag\.?|pagina|page)[-\s]*(\d+):(?:\d+(?:-\d+)?)?$')
_PAGE_INTERVAL_RE = re.compile(r'^(?:pp\.?|p\.?|pag\.?|pagine|pages|page)[-\s]*(\d+)\s*(?:\.\.|-)\s*(\d+)$')
_PAGE_SINGLE_RE = re.compile(r'^(?:p\.?|pag\.?|pagina|page)[-\s]*(\d+)$')


def _normalizza(ref: str) -> str:
    s = ref.strip().lower()
    s = s.replace('–', '-').replace('—', '-').replace('−', '-')
    return re.sub(r'\s+', ' ', s)


def resolve_source_refs(refs: list[str], blocks: list[dict]) -> dict:
    """Risolve una lista di riferimenti testuali (sourceRefs) nei blocchi dell'estrazione."""
    if not refs:
        return {'blockIds': [], 'unresolved': [], 'levels': {}}
    if not blocks:
        return {'blockIds': [], 'unresolved': list(refs), 'levels': {}}

    valid_block_ids = {b['id'] for b in blocks if 'id' in b}
    pages_to_ids: dict[int, list[str]] = {}
    for b in blocks:
        page = b.get('page')
        bid = b.get('id')
        if page is not None and bid is not None:
            pages_to_ids.setdefault(page, []).append(bid)

    matched_ids: set[str] = set()
    unresolved: list[str] = []
    levels: dict[str, str] = {}

    for ref in refs:
        if not isinstance(ref, str):
            unresolved.append(str(ref))
            continue
        norm = _normalizza(ref)
        if not norm:
            unresolved.append(ref)
            continue

        # 1. Id di blocco o id + offset
        m_block = _BLOCK_RE.match(norm)
        if m_block:
            bid = m_block.group(1)
            if bid in valid_block_ids:
                matched_ids.add(bid)
                levels[ref] = 'block'
            else:
                unresolved.append(ref)
            continue

        # 2. Pagina + offset
        m_page_off = _PAGE_OFFSET_RE.match(norm)
        if m_page_off:
            page_num = int(m_page_off.group(1))
            bids = pages_to_ids.get(page_num, [])
            if bids:
                matched_ids.update(bids)
                levels[ref] = 'page'
            else:
                unresolved.append(ref)
            continue

        # 3. Intervallo di pagine
        m_page_int = _PAGE_INTERVAL_RE.match(norm)
        if m_page_int:
            p_start = int(m_page_int.group(1))
            p_end = int(m_page_int.group(2))
            if p_start > p_end:
                p_start, p_end = p_end, p_start
            found = False
            for p in range(p_start, p_end + 1):
                bids = pages_to_ids.get(p, [])
                if bids:
                    matched_ids.update(bids)
                    found = True
            if found:
                levels[ref] = 'page'
            else:
                unresolved.append(ref)
            continue

        # 4. Pagina singola
        m_page_sin = _PAGE_SINGLE_RE.match(norm)
        if m_page_sin:
            page_num = int(m_page_sin.group(1))
            bids = pages_to_ids.get(page_num, [])
            if bids:
                matched_ids.update(bids)
                levels[ref] = 'page'
            else:
                unresolved.append(ref)
            continue

        unresolved.append(ref)

    block_ids = [b['id'] for b in blocks if b.get('id') in matched_ids]
    return {
        'blockIds': block_ids,
        'unresolved': unresolved,
        'levels': levels,
    }
