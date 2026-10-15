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
