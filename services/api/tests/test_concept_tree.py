from types import SimpleNamespace
import pytest
from pydantic import ValidationError

from formazione_api.generation.chunks import Chunk, SourcePiece
from formazione_api.generation.concept import (
    ConceptBranchDraft,
    ConceptNodeDraft,
    ConceptTreeDraft,
    ISTRUZIONI_CONCEPT_TREE,
)
from formazione_api.generation.concept_provider import (
    AnthropicConceptProvider,
    ConceptProvider,
    OpenAICompatConceptProvider,
    OpenAIConceptProvider,
    extract_concept_tree,
)
from formazione_api.generation.errors import GenerationError


def sample_tree_data():
    return {
        "rootTitle": "Analisi Matematica 1",
        "branches": [
            {
                "title": "Funzioni Reali",
                "nodes": [
                    {
                        "title": "Funzione iniettiva",
                        "summary": "Elementi distinti hanno immagini distinte.",
                        "sourceRefs": ["page-1:10-50"],
                    },
                    {
                        "title": "Funzione suriettiva",
                        "summary": "Ogni elemento del codominio è raggiunto.",
                        "sourceRefs": ["page-1:55-100"],
                    },
                ],
            },
            {
                "title": "Limiti e Continuità",
                "nodes": [
                    {
                        "title": "Definizione di limite",
                        "summary": "Per ogni epsilon maggiore di zero esiste un delta...",
                        "sourceRefs": ["page-2:0-80"],
                    }
                ],
            },
        ],
    }


def make_chunk():
    piece = SourcePiece(source_id="page-1", start=0, end=100, text="Testo di prova per estrazione albero.")
    return Chunk(id="chunk-1", pieces=(piece,))


class MockConceptProvider:
    def __init__(self, tree_to_return=None):
        self.calls = []
        self.tree_to_return = tree_to_return or ConceptTreeDraft.model_validate(sample_tree_data())

    def concept_tree(self, chunk: Chunk) -> ConceptTreeDraft:
        self.calls.append(chunk)
        return self.tree_to_return


def test_validazione_e_serializzazione_pydantic():
    data = sample_tree_data()
    tree = ConceptTreeDraft.model_validate(data)

    assert tree.rootTitle == "Analisi Matematica 1"
    assert len(tree.branches) == 2
    assert tree.branches[0].title == "Funzioni Reali"
    assert len(tree.branches[0].nodes) == 2
    assert tree.branches[0].nodes[0].title == "Funzione iniettiva"
    assert tree.branches[0].nodes[0].sourceRefs == ["page-1:10-50"]

    # Serializzazione dict e json
    dumped = tree.model_dump()
    assert dumped["rootTitle"] == "Analisi Matematica 1"
    assert len(dumped["branches"]) == 2

    json_str = tree.model_dump_json()
    assert "Analisi Matematica 1" in json_str

    # Roundtrip json -> model
    roundtrip = ConceptTreeDraft.model_validate_json(json_str)
    assert roundtrip == tree


def test_rifiuto_nodi_con_titoli_vuoti():
    with pytest.raises(ValidationError):
        ConceptNodeDraft(
            title="",
            summary="Sintesi valida",
            sourceRefs=["page-1:10-20"],
        )


def test_rifiuto_nodi_con_summary_vuoto():
    with pytest.raises(ValidationError):
        ConceptNodeDraft(
            title="Titolo valido",
            summary="",
            sourceRefs=["page-1:10-20"],
        )


def test_rifiuto_nodi_con_sourcerefs_vuoti():
    with pytest.raises(ValidationError):
        ConceptNodeDraft(
            title="Titolo valido",
            summary="Sintesi valida",
            sourceRefs=[],
        )


def test_rifiuto_rami_con_titoli_o_nodi_vuoti():
    with pytest.raises(ValidationError):
        ConceptBranchDraft(
            title="",
            nodes=[
                ConceptNodeDraft(title="N", summary="S", sourceRefs=["ref"])
            ],
        )

    with pytest.raises(ValidationError):
        ConceptBranchDraft(
            title="Ramo vuoto",
            nodes=[],
        )


def test_rifiuto_albero_con_titolo_o_rami_vuoti():
    with pytest.raises(ValidationError):
        ConceptTreeDraft(
            rootTitle="",
            branches=[
                ConceptBranchDraft(
                    title="Ramo",
                    nodes=[ConceptNodeDraft(title="N", summary="S", sourceRefs=["ref"])],
                )
            ],
        )

    with pytest.raises(ValidationError):
        ConceptTreeDraft(
            rootTitle="Radice",
            branches=[],
        )


def test_rifiuto_campi_extra_forbid():
    with pytest.raises(ValidationError):
        ConceptNodeDraft(
            title="Titolo",
            summary="Sintesi",
            sourceRefs=["ref"],
            campoExtraInatteso="valore",
        )


def test_istruzioni_concept_tree_definite():
    assert len(ISTRUZIONI_CONCEPT_TREE) > 50
    assert "rootTitle" in ISTRUZIONI_CONCEPT_TREE
    assert "branches" in ISTRUZIONI_CONCEPT_TREE
    assert "nodes" in ISTRUZIONI_CONCEPT_TREE
    assert "sourceRefs" in ISTRUZIONI_CONCEPT_TREE


def test_extract_concept_tree_con_mock_provider():
    chunk = make_chunk()
    mock_provider = MockConceptProvider()

    tree = extract_concept_tree(chunk, provider=mock_provider)

    assert len(mock_provider.calls) == 1
    assert mock_provider.calls[0] == chunk
    assert isinstance(tree, ConceptTreeDraft)
    assert tree.rootTitle == "Analisi Matematica 1"
    assert len(tree.branches) == 2


def test_extract_concept_tree_con_mock_provider_restituente_dict():
    chunk = make_chunk()
    data = sample_tree_data()

    class DictProvider:
        def concept_tree(self, c):
            return data

    tree = extract_concept_tree(chunk, provider=DictProvider())
    assert isinstance(tree, ConceptTreeDraft)
    assert tree.rootTitle == "Analisi Matematica 1"


def test_extract_concept_tree_provider_invalido():
    chunk = make_chunk()
    invalid_provider = SimpleNamespace()  # no concept_tree method

    with pytest.raises(GenerationError) as exc_info:
        extract_concept_tree(chunk, provider=invalid_provider)
    assert exc_info.value.code == "invalid_provider"


def test_openai_concept_provider_mock():
    chunk = make_chunk()
    tree_data = sample_tree_data()
    parsed_tree = ConceptTreeDraft.model_validate(tree_data)

    class MockResponses:
        def parse(self, **kwargs):
            return SimpleNamespace(
                status='completed',
                output_parsed=parsed_tree,
                output=[SimpleNamespace(content=[])],
                usage=SimpleNamespace(input_tokens=100, output_tokens=50, input_tokens_details=SimpleNamespace(cached_tokens=10)),
                model='mock-openai',
            )

    client = SimpleNamespace(responses=MockResponses())
    provider = OpenAIConceptProvider(client=client, model='gpt-4o')
    result = provider.concept_tree(chunk)
    assert result.rootTitle == "Analisi Matematica 1"
    assert provider.last_usage['inputTokens'] == 100
    assert provider.last_usage['outputTokens'] == 50


def test_openai_concept_provider_incomplete():
    chunk = make_chunk()

    class MockResponsesIncomplete:
        def parse(self, **kwargs):
            return SimpleNamespace(
                status='incomplete',
                incomplete_details=SimpleNamespace(reason='max_output_tokens'),
                output_parsed=None,
                output=[SimpleNamespace(content=[])],
                usage=SimpleNamespace(input_tokens=100, output_tokens=50, input_tokens_details=SimpleNamespace(cached_tokens=0)),
                model='mock-openai',
            )

    client = SimpleNamespace(responses=MockResponsesIncomplete())
    provider = OpenAIConceptProvider(client=client, model='gpt-4o')
    with pytest.raises(GenerationError) as exc:
        provider.concept_tree(chunk)
    assert exc.value.code == 'provider_incomplete'


def test_anthropic_concept_provider_mock():
    chunk = make_chunk()
    tree_data = sample_tree_data()
    tree_json = ConceptTreeDraft.model_validate(tree_data).model_dump_json()

    class MockMessages:
        def create(self, **kwargs):
            return SimpleNamespace(
                stop_reason='end_turn',
                content=[SimpleNamespace(type='text', text=tree_json)],
                usage=SimpleNamespace(
                    input_tokens=80,
                    output_tokens=40,
                    cache_creation_input_tokens=0,
                    cache_read_input_tokens=20,
                    output_tokens_details=SimpleNamespace(thinking_tokens=10),
                ),
                model='claude-3-5-haiku',
            )

    client = SimpleNamespace(messages=MockMessages())
    provider = AnthropicConceptProvider(client=client, model='claude-3-5-haiku')
    result = provider.concept_tree(chunk)
    assert result.rootTitle == "Analisi Matematica 1"
    assert provider.last_usage['inputTokens'] == 100
    assert provider.last_usage['outputTokens'] == 40
    assert provider.last_usage['thinkingTokens'] == 10


def test_anthropic_concept_provider_max_tokens_truncated():
    chunk = make_chunk()

    class MockMessagesTruncated:
        def create(self, **kwargs):
            return SimpleNamespace(
                stop_reason='max_tokens',
                content=[SimpleNamespace(type='text', text='{"rootTitle": "Inco')],
                usage=SimpleNamespace(
                    input_tokens=80,
                    output_tokens=6000,
                    cache_creation_input_tokens=0,
                    cache_read_input_tokens=0,
                    output_tokens_details=None,
                ),
                model='claude-3-5-haiku',
            )

    client = SimpleNamespace(messages=MockMessagesTruncated())
    provider = AnthropicConceptProvider(client=client, model='claude-3-5-haiku')
    with pytest.raises(GenerationError) as exc:
        provider.concept_tree(chunk)
    assert exc.value.code == 'provider_incomplete'


def test_openai_compat_concept_provider_mock():
    chunk = make_chunk()
    tree_data = sample_tree_data()
    tree_json = ConceptTreeDraft.model_validate(tree_data).model_dump_json()

    class MockCompletions:
        def create(self, **kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        finish_reason='stop',
                        message=SimpleNamespace(content=tree_json, refusal=None),
                    )
                ],
                usage=SimpleNamespace(
                    prompt_tokens=120,
                    completion_tokens=45,
                    prompt_tokens_details=SimpleNamespace(cached_tokens=30),
                    completion_tokens_details=SimpleNamespace(reasoning_tokens=5),
                ),
                model='gemini-2.0-flash',
            )

    client = SimpleNamespace(chat=SimpleNamespace(completions=MockCompletions()))
    provider = OpenAICompatConceptProvider('gemini', client=client, model='gemini-2.0-flash')
    result = provider.concept_tree(chunk)
    assert result.rootTitle == "Analisi Matematica 1"
    assert provider.last_usage['inputTokens'] == 120
    assert provider.last_usage['cachedInputTokens'] == 30

