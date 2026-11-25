"""Test unitari per la normalizzazione, copertura keyTerms e composizione del punteggio (D.5)."""
import pytest
from fastapi import HTTPException

from formazione_api.voice_recall import (
    ValutazioneOraleLLM,
    clamp_risposta_llm,
    componi_valutazione,
    copertura,
    forma_base,
    normalizza,
)


def test_normalizza():
    assert normalizza("È un'attività d'ESEMPIO, con accenti: à, è, ì, ò, ù!!") == "e un attivita d esempio con accenti a e i o u"
    assert normalizza("   spazi    multipli   e \n a capo \t ") == "spazi multipli e a capo"


def test_forma_base_plurale():
    assert forma_base("mercato") == "mercat"
    assert forma_base("mercati") == "mercat"
    assert forma_base("azione") == "azion"
    assert forma_base("azioni") == "azion"
    assert forma_base("regola") == "regol"
    assert forma_base("regole") == "regol"
    # Parole brevi (<= 3 lettere) non vengono modificate
    assert forma_base("che") == "che"
    assert forma_base("via") == "via"
    assert forma_base("oro") == "oro"


def test_keyterm_multiparola():
    kts = ["costo opportunità"]
    # Coperto anche se le parole compaiono in ordine diverso e con stopword
    tr_ok = "Spiegando l'opportunità reale del costo nella decisione economica."
    cop, miss, sc = copertura(kts, tr_ok)
    assert cop == ["costo opportunità"]
    assert miss == []
    assert sc == 100

    # Non coperto se manca una parola significativa
    tr_parziale = "Abbiamo valutato solo il costo senza considerare l'alternativa."
    cop_p, miss_p, sc_p = copertura(kts, tr_parziale)
    assert cop_p == []
    assert miss_p == ["costo opportunità"]
    assert sc_p == 0


def test_stopword_ignorate():
    kts = ["valore di mercato"]
    tr = "Il mercato ha espresso un valore elevato per questo bene."
    cop, miss, sc = copertura(kts, tr)
    assert cop == ["valore di mercato"]
    assert miss == []
    assert sc == 100


def test_keyterms_vuoti_score_none():
    cop, miss, sc = copertura([], "Trascrizione ricca di concetti.")
    assert cop == []
    assert miss == []
    assert sc is None


def test_keyterms_duplicati_normalizzati():
    # Due termini identici dopo normalizzazione contano una sola volta
    kts = ["Mercato", "mercati"]
    cop, miss, sc = copertura(kts, "I mercati finanziari sono aperti.")
    assert len(cop) == 1
    assert sc == 100


def test_componi_ibrida():
    # LLM 80, Copertura 50 -> 0.7*80 + 0.3*50 = 56 + 15 = 71
    llm = ValutazioneOraleLLM(score=80, covered=["concetto a"], missing=["concetto b"], advice="Bravo.")
    score, cov, miss, advice, mod, w = componi_valutazione(
        score_llm=80,
        score_copertura=50,
        covered_det=["chiave 1"],
        missing_det=["chiave 2"],
        llm_risultato=llm,
        key_terms_presenti=True,
        valutatore_presente=True,
    )
    assert score == 71
    assert mod == "ibrida"
    assert "chiave 1" in cov
    assert "concetto a" in cov
    assert "chiave 2" in miss
    assert "concetto b" in miss
    assert advice == "Bravo."
    assert w == []

    # Solo LLM
    score_llm, _, _, _, mod_llm, _ = componi_valutazione(
        score_llm=85,
        score_copertura=None,
        covered_det=[],
        missing_det=[],
        llm_risultato=ValutazioneOraleLLM(score=85, covered=[], missing=[], advice="Ok"),
        key_terms_presenti=False,
        valutatore_presente=True,
    )
    assert score_llm == 85
    assert mod_llm == "solo_llm"

    # Solo Copertura
    score_cop, _, _, _, mod_cop, _ = componi_valutazione(
        score_llm=None,
        score_copertura=60,
        covered_det=["kt1"],
        missing_det=["kt2"],
        llm_risultato=None,
        key_terms_presenti=True,
        valutatore_presente=False,
    )
    assert score_cop == 60
    assert mod_cop == "solo_copertura"


def test_componi_divergenza():
    # LLM 90, Copertura 10 -> diff 80 > 50 -> warning VALUTAZIONE_DIVERGENTE
    llm = ValutazioneOraleLLM(score=90, covered=[], missing=[], advice="Ok.")
    score, _, _, _, _, warnings = componi_valutazione(
        score_llm=90,
        score_copertura=10,
        covered_det=[],
        missing_det=["kt1"],
        llm_risultato=llm,
        key_terms_presenti=True,
        valutatore_presente=True,
    )
    assert "VALUTAZIONE_DIVERGENTE" in warnings


def test_lessicale_ha_precedenza():
    # Se il termine "costo opportunità" è stato coperto lessicalmente,
    # anche se l'LLM erroneamente dichiara "costo opportunità" in missing,
    # deve vincere il lessicale e NON apparire in missing.
    llm = ValutazioneOraleLLM(score=70, covered=[], missing=["costo opportunità"], advice="Approfondisci.")
    _, cov, miss, _, _, _ = componi_valutazione(
        score_llm=70,
        score_copertura=100,
        covered_det=["costo opportunità"],
        missing_det=[],
        llm_risultato=llm,
        key_terms_presenti=True,
        valutatore_presente=True,
    )
    assert "costo opportunità" in cov
    assert "costo opportunità" not in miss


def test_clamp_risposta_llm():
    bad_llm = ValutazioneOraleLLM(
        score=140,
        covered=[f"item-{i}" for i in range(30)],
        missing=[f"miss-{i}" for i in range(25)],
        advice="X" * 2000,
    )
    clamped = clamp_risposta_llm(bad_llm)
    assert clamped.score == 100
    assert len(clamped.covered) == 12
    assert len(clamped.missing) == 12
    assert len(clamped.advice) == 600

    low_llm = ValutazioneOraleLLM(score=-10, covered=[], missing=[], advice="Ok")
    assert clamp_risposta_llm(low_llm).score == 0


def test_niente_riferimento():
    with pytest.raises(HTTPException) as exc:
        componi_valutazione(
            score_llm=None,
            score_copertura=None,
            covered_det=[],
            missing_det=[],
            llm_risultato=None,
            key_terms_presenti=False,
            valutatore_presente=False,
        )
    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "NO_REFERENCE"
