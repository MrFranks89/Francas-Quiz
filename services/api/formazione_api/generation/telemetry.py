"""Optional provider telemetry; absent counters stay unknown rather than zero."""


def call_usage(provider, chunk_id, duration_ms):
    metadata = getattr(provider, 'last_usage', None) or {}
    return dict(chunkId=chunk_id, provider=getattr(provider, 'provider_name', None),
                model=metadata.get('model', getattr(provider, 'model', None)), durationMs=duration_ms,
                inputTokens=metadata.get('inputTokens'), outputTokens=metadata.get('outputTokens'),
                cachedInputTokens=metadata.get('cachedInputTokens'))


def aggregate_usage(calls):
    def total(field):
        values = [call[field] for call in calls]
        return sum(values) if values and all(v is not None for v in values) else None
    def consistent(field):
        values = {call[field] for call in calls}
        return next(iter(values)) if len(values) == 1 else None
    return dict(provider=consistent('provider'), model=consistent('model'), calls=calls,
                callCount=len(calls), durationMs=total('durationMs'), inputTokens=total('inputTokens'),
                outputTokens=total('outputTokens'), cachedInputTokens=total('cachedInputTokens'))


def chiama_con_tentativi(risorsa, metodo: str, **argomenti):
    """(risposta, tentativi ripetuti dallo SDK) per `risorsa.<metodo>(**argomenti)`.

    I tentativi si leggono dalla risposta grezza: `with_raw_response.<metodo>` restituisce un oggetto
    con `retries_taken` («The number of retries made. If no retries happened this will be `0`»,
    anthropic/_response.py 1.15.0 e openai/_legacy_response.py 3.31.0) e `parse()`, che dà la stessa
    risposta della chiamata diretta. La richiesta inviata è la stessa: cambia solo l'intestazione
    X-Stainless-Raw-Response. Un client senza `with_raw_response` (i finti dei test) → None, non zero.
    """
    grezza = getattr(risorsa, 'with_raw_response', None)
    if grezza is None:
        return getattr(risorsa, metodo)(**argomenti), None
    risposta = getattr(grezza, metodo)(**argomenti)
    return risposta.parse(), getattr(risposta, 'retries_taken', None)
