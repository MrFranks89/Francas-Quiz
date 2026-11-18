import json
from pathlib import Path
from types import SimpleNamespace
from copy import deepcopy
import pytest
from formazione_api.generation import GenerationError, generate
from formazione_api.generation.models import Course, ModuleDraft
from pydantic import ValidationError
from formazione_api.generation.provider import OpenAIProvider, config_status
from bozze_di_prova import bozza


def extraction(pages=1, text='Testo di formazione.\n\nSecondo paragrafo.'):
    return dict(id='extraction-1', documentId='document-1', status='ready', warnings=[],
                blocks=[dict(id=f'page-{p}', page=p, label=f'Pagina {p}', text=text) for p in range(201, 201+pages)])


class FakeProvider:
    def __init__(self):
        self.calls = []

    def module(self, chunk):
        self.calls.append(chunk)
        refs = list(dict.fromkeys(p.source_id for p in chunk.pieces))
        return ModuleDraft(title='Modulo di prova', objectives=['Comprendere la procedura'],
                           slides=[dict(heading='Procedura', body='Contenuto di prova', highlight='', sourceRefs=refs)],
                           questions=domande_di_prova(refs))


def domande_di_prova(refs):
    """Una bozza per ogni tipo di domanda, come le restituirebbe un fornitore (forma di QuestionDraft)."""
    comuni = dict(explanation='Spiegazione di prova', sourceRefs=refs, difficulty='base')
    return [
        bozza(kind='single', prompt='Quale risposta?', options=['Prima', 'Seconda'], correctIndex=0, rationales=['', ''], **comuni),
        bozza(kind='truefalse', prompt='Il testo ha un secondo paragrafo.', correct=True, **comuni),
        bozza(kind='fillblank', prompt='Il ___ paragrafo segue il testo di formazione.', options=['secondo', 'terzo'],
             correctIndex=0, rationales=['', ''], **comuni),
        bozza(kind='scenario', situation="Un collega legge il materiale dall'inizio.",
             prompt='Che cosa trova dopo il testo di formazione?', options=['Il secondo paragrafo', 'Una tabella riassuntiva'],
             correctIndex=0, rationales=['', 'Il materiale non contiene tabelle.'], **{**comuni, 'difficulty': 'medio'}),
        bozza(kind='oddOneOut', prompt='Quale elemento non compare nel materiale?',
             options=['Testo di formazione', 'Secondo paragrafo', 'Tabella'], correctIndex=2, rationales=['', '', ''], **comuni),
        bozza(kind='correctStatement', prompt='Quale parola sostituisce quella sbagliata?',
             sentence='Il terzo paragrafo segue il testo di formazione.', wrong='terzo', options=['secondo', 'quarto'],
             correctIndex=0, rationales=['', ''], **{**comuni, 'difficulty': 'avanzato'}),
        bozza(kind='multiple', prompt='Che cosa contiene il materiale?',
             options=['Testo di formazione', 'Secondo paragrafo', 'Una tabella', 'Un grafico'], correctIndexes=[0, 1],
             rationales=['', '', '', 'Il materiale è solo testo.'], **comuni),
        bozza(kind='matching', prompt='Accoppia ogni elemento alla sua descrizione.',
              pairTerms=['Testo di formazione', 'Secondo paragrafo', 'Glossario'],
              options=['Il contenuto principale', 'La parte che segue il testo', 'L\'elenco dei termini'],
              rationales=['', '', ''], **comuni),
    ]


def test_pipeline_100_pages_lossless_original_numbers():
    original = extraction(100, text=('Sezione\n\n' + 'x'*200 + '\n')*3)
    provider = FakeProvider()
    result = generate(original, provider, max_chars=1000, max_chunks=100)
    assert result['status'] == 'draft'
    assert result['coverage']['processedChunks'] == len(provider.calls)
    assert result['coverage']['processedCharacters'] == sum(len(b['text']) for b in original['blocks'])
    assert result['coverage']['semanticCompleteness'] == 'not_verified'
    for block in original['blocks']:
        pieces = [p for chunk in provider.calls for p in chunk.pieces if p.source_id == block['id']]
        assert ''.join(p.text for p in pieces) == block['text']
        assert pieces[0].start == 0 and pieces[-1].end == len(block['text'])
        assert all(a.end == b.start for a, b in zip(pieces, pieces[1:]))
    assert [s['page'] for s in result['course']['sources']] == list(range(201, 301))
    assert [s['excerpt'] for s in result['course']['sources']] == [b['text'] for b in original['blocks']]


def test_single_long_block_split_without_loss():
    provider = FakeProvider()
    result = generate(extraction(text='A'*12345), provider, max_chars=1000, max_chunks=20)
    assert len(provider.calls) == 13
    assert all(sum(len(p.text) for p in c.pieces) <= 1000 for c in provider.calls)
    assert result['coverage']['processedCharacters'] == 12345


def test_budget_checked_before_any_provider_calls():
    provider = FakeProvider()
    with pytest.raises(GenerationError, match='limite') as error:
        generate(extraction(100), provider, max_chars=10, max_chunks=2)
    assert error.value.code == 'budget_exceeded'
    assert not provider.calls


@pytest.mark.parametrize('status,text,code', [('needs_review','testo','needs_review'),('ready','','empty_extraction'),('ready','  ','empty_extraction')])
def test_reject_unusable_extraction(status, text, code):
    data = extraction(text=text)
    data['status'] = status
    with pytest.raises(GenerationError) as error:
        generate(data, FakeProvider())
    assert error.value.code == code


def test_needs_review_requires_explicit_acknowledgement():
    data = extraction()
    data.update(status='needs_review', warnings=['Immagini non interpretate'])
    with pytest.raises(GenerationError):
        generate(data, FakeProvider())
    result = generate(data, FakeProvider(), acknowledge_warnings=True)
    assert data['status'] == 'needs_review'
    assert result['warnings'][0] == 'Immagini non interpretate'
    data['blocks'][0]['text'] = ''
    with pytest.raises(GenerationError) as error:
        generate(data, FakeProvider(), acknowledge_warnings=True)
    assert error.value.code == 'empty_extraction'


def test_invented_sources_rejected():
    class Bad(FakeProvider):
        def module(self, chunk):
            draft = super().module(chunk)
            draft.slides[0].sourceRefs = ['invented']
            return draft
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Bad())
    assert error.value.code == 'invented_source'


def test_bad_answer_and_modified_excerpt_rejected():
    class Bad(FakeProvider):
        def module(self, chunk):
            draft = super().module(chunk).model_dump()
            draft['questions'][6]['correctIndexes'] = [0, 9]
            return draft
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Bad())
    assert error.value.code == 'invalid_generated_content'
    class Extra(FakeProvider):
        def module(self, chunk):
            return {**super().module(chunk).model_dump(), 'excerpt': 'Alterato'}
    with pytest.raises(GenerationError):
        generate(extraction(), Extra())


def test_validation_error_retries_once_and_recovers(caplog):
    class Flaky(FakeProvider):
        def __init__(self):
            super().__init__()
            self.chunk2_attempts = 0

        def module(self, chunk):
            draft = super().module(chunk)
            if chunk.id == 'chunk-2':
                self.chunk2_attempts += 1
                if self.chunk2_attempts == 1:
                    raw = draft.model_dump()
                    raw['title'] = ''
                    return raw
            return draft

    provider = Flaky()
    with caplog.at_level('WARNING'):
        result = generate(extraction(2), provider, max_chars=45)
    assert result['status'] == 'draft'
    assert provider.chunk2_attempts == 2
    assert len(result['course']['modules']) == 2
    assert any('chunk-2' in rec.message for rec in caplog.records)


def test_validation_error_after_retry_names_chunk_and_reason(caplog):
    class AlwaysInvalidChunk2(FakeProvider):
        def module(self, chunk):
            draft = super().module(chunk)
            if chunk.id == 'chunk-2':
                raw = draft.model_dump()
                raw['title'] = ''
                return raw
            return draft

    provider = AlwaysInvalidChunk2()
    with caplog.at_level('WARNING'):
        with pytest.raises(GenerationError) as error:
            generate(extraction(2), provider, max_chars=45)
    assert error.value.code == 'invalid_generated_content'
    assert 'Contenuto AI non valido nel blocco chunk-2:' in str(error.value)
    assert [c.id for c in provider.calls] == ['chunk-1', 'chunk-2', 'chunk-2']


def stub_provider(response):
    class Responses:
        def parse(self, **kwargs):
            assert kwargs['store'] is False
            assert kwargs['text_format'] is ModuleDraft
            assert kwargs['truncation'] == 'disabled'
            assert kwargs['model'] == 'explicit-test-model'
            return response
    return OpenAIProvider(client=SimpleNamespace(responses=Responses()), model='explicit-test-model')


@pytest.mark.parametrize('response,code', [
    (SimpleNamespace(output=[SimpleNamespace(content=[SimpleNamespace(type='refusal')])], status='completed',output_parsed=None),'provider_refusal'),
    (SimpleNamespace(output=[],status='incomplete',output_parsed=None),'provider_incomplete'),
    (SimpleNamespace(output=[],status='completed',output_parsed=None),'provider_empty'),
])
def test_provider_errors_through_pipeline(response, code):
    with pytest.raises(GenerationError) as error:
        generate(extraction(), stub_provider(response))
    assert error.value.code == code


def test_no_config_no_false_generation(monkeypatch):
    monkeypatch.delenv('GENERATION_PROVIDER', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_MODEL', raising=False)
    assert not config_status()['configured']
    with pytest.raises(GenerationError) as error:
        generate(extraction())
    assert error.value.code == 'not_configured'


def test_course_fixture_cross_contract():
    fixture = Path(__file__).parent / 'fixtures' / 'generated-course.json'
    result = generate(extraction(2), FakeProvider(), max_chars=45)
    course = result['course']
    expected = json.loads(fixture.read_text(encoding='utf-8'))
    course['id'] = expected['id']
    assert course == expected


def test_provider_success_uses_actual_adapter_and_preserves_sources():
    draft = FakeProvider().module(SimpleNamespace(pieces=[SimpleNamespace(source_id='page-201')]))
    response = SimpleNamespace(output=[], status='completed', output_parsed=draft)
    result = generate(extraction(), stub_provider(response))
    assert result['course']['questions'][0]['correctOptionId'] == 'option-0'
    assert result['course']['sources'][0]['excerpt'] == extraction()['blocks'][0]['text']


def test_later_chunk_failure_does_not_return_partial_draft():
    class LaterFailure(FakeProvider):
        def module(self, chunk):
            draft = super().module(chunk)
            if len(self.calls) == 2:
                raise GenerationError('provider_error', 'Errore secondo blocco')
            return draft
    provider = LaterFailure()
    with pytest.raises(GenerationError) as error:
        generate(extraction(3), provider, max_chars=40)
    assert error.value.code == 'provider_error'
    assert len(provider.calls) == 2


def test_whitespace_ai_content_rejected_before_return():
    class Whitespace(FakeProvider):
        def module(self, chunk):
            draft = super().module(chunk)
            draft.slides[0].body = '   '
            return draft
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Whitespace())
    assert error.value.code == 'invalid_course'


def test_sdk_usage_aggregated_for_two_chunks():
    from openai.types.responses.response_usage import ResponseUsage
    usage = ResponseUsage(input_tokens=120, output_tokens=35, total_tokens=155,
                          input_tokens_details={'cached_tokens': 80, 'cache_write_tokens': 0},
                          output_tokens_details={'reasoning_tokens': 0})
    draft = FakeProvider().module(SimpleNamespace(pieces=[SimpleNamespace(source_id='page-201')]))
    response = SimpleNamespace(output=[], status='completed', output_parsed=draft,
                               model='resolved-test-model', usage=usage)
    result = generate(extraction(text='A'*20), stub_provider(response), max_chars=10)
    telemetry = result['usage']
    assert telemetry['callCount'] == 2
    assert telemetry['inputTokens'] == 240
    assert telemetry['outputTokens'] == 70
    assert telemetry['cachedInputTokens'] == 160
    assert telemetry['provider'] == 'openai'
    assert telemetry['model'] == 'resolved-test-model'
    assert [call['chunkId'] for call in telemetry['calls']] == ['chunk-1', 'chunk-2']
    assert telemetry['durationMs'] == sum(call['durationMs'] for call in telemetry['calls'])
    assert telemetry['durationMs'] >= 0


def test_missing_provider_usage_is_unknown_not_zero():
    draft = FakeProvider().module(SimpleNamespace(pieces=[SimpleNamespace(source_id='page-201')]))
    response = SimpleNamespace(output=[], status='completed', output_parsed=draft, usage=None)
    telemetry = generate(extraction(), stub_provider(response))['usage']
    assert telemetry['inputTokens'] is None
    assert telemetry['outputTokens'] is None
    assert telemetry['cachedInputTokens'] is None
    assert telemetry['provider'] == 'openai'
    assert telemetry['model'] == 'explicit-test-model'
    assert telemetry['durationMs'] >= 0
    unknown = generate(extraction(), FakeProvider())['usage']
    assert unknown['provider'] is None and unknown['model'] is None
    assert unknown['inputTokens'] is None


def test_partial_usage_does_not_report_partial_sum_as_total():
    class Partial(FakeProvider):
        last_usage = None
        def module(self, chunk):
            draft = super().module(chunk)
            self.last_usage = dict(inputTokens=4, outputTokens=2, cachedInputTokens=0) if len(self.calls) == 1 else None
            return draft
    usage = generate(extraction(text='A'*20), Partial(), max_chars=10)['usage']
    assert usage['inputTokens'] is None
    assert usage['outputTokens'] is None
    assert usage['cachedInputTokens'] is None
    assert usage['calls'][0]['inputTokens'] == 4
    assert usage['calls'][1]['inputTokens'] is None


def test_shared_negative_contract_cases():
    folder = Path(__file__).parent / 'fixtures'
    course = json.loads((folder / 'generated-course.json').read_text(encoding='utf-8'))
    cases = json.loads((folder / 'invalid-course-cases.json').read_text(encoding='utf-8'))
    for case in cases:
        invalid = deepcopy(course)
        # Un caso è una modifica singola ({path, value}) o più modifiche insieme ({changes: [...]}).
        for change in case.get('changes', [case]):
            target = invalid
            for key in change['path'][:-1]:
                target = target[key]
            target[change['path'][-1]] = change['value']
        with pytest.raises(ValidationError):
            Course.model_validate(invalid)


@pytest.mark.parametrize('details,atteso', [
    (SimpleNamespace(reason='max_output_tokens'), 'max_output_tokens'),
    (None, 'incomplete'),
])
def test_incomplete_error_names_the_reason(details, atteso):
    response = SimpleNamespace(output=[], status='incomplete', incomplete_details=details, output_parsed=None)
    with pytest.raises(GenerationError) as error:
        generate(extraction(), stub_provider(response))
    assert error.value.code == 'provider_incomplete'
    assert atteso in str(error.value)
