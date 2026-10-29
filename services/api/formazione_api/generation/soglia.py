"""Soglia di superamento: predefinita dei quiz generati e minima ammessa dal contratto."""


# Soglia predefinita dei quiz generati, in percentuale. Deve coincidere con
# packages/contracts/fixtures/grading-scale.json (sogliaSuperamentoPercento), letto dal
# motore TypeScript: lo controlla services/api/tests/test_grading_scale.py.
SOGLIA_SUPERAMENTO_PERCENTO = 60


def soglia_predefinita(n: int) -> int:
    """Risposte corrette minime su n domande: il più piccolo k con k/n >= 60%, in aritmetica intera."""
    return (SOGLIA_SUPERAMENTO_PERCENTO * n + 99) // 100


def soglia_minima(n: int) -> int:
    """Risposte corrette minime ammesse su n domande: la soglia predefinita della pipeline, ⌈60%·n⌉."""
    # Il percento è SOGLIA_SUPERAMENTO_PERCENTO, confrontato con packages/contracts/fixtures/grading-scale.json
    # da tests/test_grading_scale.py.
    return soglia_predefinita(n)


def errore_soglia_minima(passing_score: int, n: int) -> str | None:
    """Messaggio per una soglia sotto il minimo, oppure None. Stesso testo del contratto TypeScript."""
    minimo = soglia_minima(n)
    if passing_score >= minimo:
        return None
    return f"La soglia minima è {minimo} {'risposta' if minimo == 1 else 'risposte'} su {n} ({SOGLIA_SUPERAMENTO_PERCENTO}%)"
