"""Test sintetici per Blocco D (Ordine 15, D.1 e D.2).

D.1: Retry adattivo con dimezzamento su 413 / TPM rate-limit e rispetto del tetto token.
D.2: Riparazione automatica dei sourceRefs e retry riparatore con istruzioni esplicite.
"""
from types import SimpleNamespace
import pytest

from bozze_di_prova import bozza
from formazione_api.generation.chunks import (
    Chunk, SourcePiece, GENERATION_MAX_TOKENS_PER_CALL,
    plan_chunks, dimezza_chunk, stima_token_richiesta
)
from formazione_api.generation.errors import GenerationError
from formazione_api.generation.models import ModuleDraft, SlideDraft
from formazione_api.generation.pipeline import generate
from formazione_api.generation.source_refs import ripara_source_ref, ripara_lista_refs
from test_generation import extraction


class Mock413Provider:
    """Simula un provider che fallisce con 413 sul chunk grande e ha successo quando dimezzato."""
    def __init__(self, soglia_lunghezza: int = 30):
        self.soglia = soglia_lunghezza
        self.chiamate = []

    def module(self, chunk: Chunk):
        self.chiamate.append(chunk)
        totale_chars = sum(len(p.text) for p in chunk.pieces)
        if totale_chars > self.soglia:
            # Simula errore 413 / TPM
            err = GenerationError('provider_error', 'Request too large: TPM limit 8000')
            err.causa = {'statoHttp': 413, 'messaggio': 'TPM limit exceeded'}
            raise err
        # Quando sotto soglia ha successo
        ref = chunk.pieces[0].source_id
        q = bozza(kind="single", prompt="Domanda test?", options=["A", "B"], correctIndex=0,
                  rationales=["", ""], explanation="Spiegazione", sourceRefs=[ref], difficulty="base")
        return ModuleDraft(
            title="Modulo Sotto-blocco",
            objectives=["Obiettivo test"],
            slides=[SlideDraft(heading="Titolo", body="Contenuto slide", highlight="", sourceRefs=[ref])],
            questions=[q]
        )


def test_d1_tetto_token_e_budget():
    """Verifica che il tetto token predefinito sia 6000 e che plan_chunks rispetti il budget."""
    assert GENERATION_MAX_TOKENS_PER_CALL == 6000
    # Verifica stima token
    assert stima_token_richiesta(3000) <= 6000
    # Verifica che con materiale grande i chunk non superino il limite stimato
    blocks = [{'id': f'b-{i}', 'page': i, 'label': f'P.{i}', 'text': 'Testo didattico. ' * 300} for i in range(1, 5)]
    chunks = plan_chunks(blocks)
    for c in chunks:
        chars = sum(len(p.text) for p in c.pieces)
        assert stima_token_richiesta(chars) <= 6000 + 500


def test_d1_dimezzamento_chunk():
    """Verifica che dimezza_chunk divida correttamente pezzi multipli o singoli."""
    p1 = SourcePiece("s1", 0, 100, "A" * 100)
    p2 = SourcePiece("s2", 0, 100, "B" * 100)
    c_multi = Chunk("c1", (p1, p2))
    c_a, c_b = dimezza_chunk(c_multi)
    assert len(c_a.pieces) == 1 and c_a.pieces[0].source_id == "s1"
    assert len(c_b.pieces) == 1 and c_b.pieces[0].source_id == "s2"

    c_single = Chunk("c2", (SourcePiece("s1", 0, 100, "Paragrafo 1.\n\nParagrafo 2."),))
    c_sa, c_sb = dimezza_chunk(c_single)
    assert len(c_sa.pieces[0].text) > 0
    assert len(c_sb.pieces[0].text) > 0
    assert c_sa.pieces[0].text + c_sb.pieces[0].text == "Paragrafo 1.\n\nParagrafo 2."


def test_d1_retry_adattivo_su_413():
    """Verifica che l'errore 413 inneschi il dimezzamento e porti al completamento del corso."""
    ext = extraction()
    prov = Mock413Provider(soglia_lunghezza=25)
    res = generate(ext, prov)
    assert res['status'] == 'draft'
    assert len(prov.chiamate) >= 2  # ha subito almeno un dimezzamento


def test_d2_riparazione_source_refs():
    """Verifica la riparazione automatica di ref errati o disallineati."""
    allowed = {'page-201', 'page-202'}
    # Match numerico o normalizzato
    assert ripara_source_ref('page 201', allowed) == 'page-201'
    assert ripara_source_ref('201', allowed) == 'page-201'
    assert ripara_source_ref('p.202', allowed) == 'page-202'

    # Se c'è un solo ref consentito
    assert ripara_source_ref('fonte-principale', {'page-10'}) == 'page-10'

    # Riparazione lista
    refs = ['page 201', 'inventata-999']
    riparati = ripara_lista_refs(refs, allowed)
    assert riparati == ['page-201']  # quella inventata rimossa senza errore


class MockRefRetryProvider:
    """Al primo giro restituisce ref totalmente inventato; al retry guidato usa il ref corretto."""
    def __init__(self):
        self.chiamate = 0

    def module(self, chunk: Chunk):
        self.chiamate += 1
        valid_ref = chunk.pieces[0].source_id
        # Se nel pezzo c'è l'avviso di retry con le fonti valide
        ha_guida = any('[ID FONTI VALIDI' in p.text for p in chunk.pieces)
        used_ref = valid_ref if ha_guida else 'inventata-senza-speranza-999'
        q = bozza(kind="single", prompt="Domanda test?", options=["A", "B"], correctIndex=0,
                  rationales=["", ""], explanation="Spiegazione", sourceRefs=[used_ref], difficulty="base")
        return ModuleDraft(
            title="Modulo Test Refs",
            objectives=["Obiettivo test"],
            slides=[SlideDraft(heading="Titolo", body="Contenuto slide", highlight="", sourceRefs=[used_ref])],
            questions=[q]
        )


def test_d2_retry_riparatore_su_ref_inventato():
    """Verifica che un ref inventato inneschi il retry riparatore con istruzioni esplicite."""
    ext = extraction()
    prov = MockRefRetryProvider()
    res = generate(ext, prov)
    assert res['status'] == 'draft'
    assert prov.chiamate == 2  # primo giro fallito -> retry riparatore riuscito


class MockRefFailTwiceProvider:
    """Fallisce sempre i refs anche al retry."""
    def __init__(self):
        self.chiamate = 0

    def module(self, chunk: Chunk):
        self.chiamate += 1
        q = bozza(kind="single", prompt="Domanda test?", options=["A", "B"], correctIndex=0,
                  rationales=["", ""], explanation="Spiegazione", sourceRefs=['inventata-fissa'], difficulty="base")
        return ModuleDraft(
            title="Modulo Test Refs",
            objectives=["Obiettivo test"],
            slides=[SlideDraft(heading="Titolo", body="Contenuto slide", highlight="", sourceRefs=['inventata-fissa'])],
            questions=[q]
        )


def test_d2_fallimento_al_secondo_giro_errore_gestito():
    """Verifica che se anche il retry fallisce, venga sollevato GenerationError('invented_source')."""
    ext = extraction()
    prov = MockRefFailTwiceProvider()
    with pytest.raises(GenerationError) as exc_info:
        generate(ext, prov)
    assert exc_info.value.code == 'invented_source'
    assert prov.chiamate == 2  # ha provato il retry prima di arrendersi
