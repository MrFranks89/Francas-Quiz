"""Verifica del selettore domande di controllo (Ordine 15, Blocco C.1)."""
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from formazione_api.generation.pipeline import generate
from formazione_api.generation_routes import GenerationRequest
from test_generation import FakeProvider, extraction


def test_questions_per_check_pipeline():
    ext = extraction()
    for count in (1, 2, 3):
        res = generate(ext, FakeProvider(), questions_per_check=count)
        mod = res['course']['modules'][0]
        assert len(mod['lessons'][0]['questionIds']) == count
        assert len(mod['exam']['questionIds']) == count
        assert len(res['course']['questions']) == count


def test_generation_request_validation():
    # Validi: 1, 2, 3
    for v in (1, 2, 3):
        req = GenerationRequest(title="Test", questionsPerCheck=v)
        assert req.questionsPerCheck == v

    # Non validi: 0, 4, -1
    for v in (0, 4, -1):
        with pytest.raises(ValidationError):
            GenerationRequest(title="Test", questionsPerCheck=v)
