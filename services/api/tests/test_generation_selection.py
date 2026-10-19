"""Selezione del fornitore con GENERATION_PROVIDER, attraverso generate() senza fornitore iniettato."""
import pytest

from formazione_api.generation import GenerationError, config_status, generate
from formazione_api.generation.anthropic_provider import AnthropicProvider
from formazione_api.generation.provider import OpenAIProvider
from formazione_api.generation.selection import create_provider
from test_generation import extraction


@pytest.fixture
def env(monkeypatch):
    for name in ('GENERATION_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


@pytest.mark.parametrize('value', [None, '', '  ', 'openai', ' OpenAI '])
def test_absent_or_openai_keeps_openai(env, value):
    if value is not None:
        env.setenv('GENERATION_PROVIDER', value)
    assert config_status() == {'configured': False, 'provider': 'openai', 'missing': ['OPENAI_API_KEY', 'OPENAI_MODEL']}
    env.setenv('OPENAI_API_KEY', 'test-key-not-real')
    env.setenv('OPENAI_MODEL', 'modello-openai-di-prova')
    assert isinstance(create_provider(), OpenAIProvider)


def test_anthropic_selected_and_missing_variables_named_not_shown(env):
    env.setenv('GENERATION_PROVIDER', 'anthropic')
    env.setenv('OPENAI_API_KEY', 'openai-key-not-real')
    env.setenv('OPENAI_MODEL', 'modello-openai')
    assert config_status() == {'configured': False, 'provider': 'anthropic',
                               'missing': ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']}
    with pytest.raises(GenerationError) as error:
        generate(extraction())
    assert error.value.code == 'not_configured'
    env.setenv('ANTHROPIC_API_KEY', 'anthropic-key-not-real')
    env.setenv('ANTHROPIC_MODEL', 'modello-anthropic')
    status = config_status()
    assert status == {'configured': True, 'provider': 'anthropic', 'missing': []}
    provider = create_provider()
    assert isinstance(provider, AnthropicProvider)
    assert provider.model == 'modello-anthropic'


def test_no_implicit_model(env):
    env.setenv('GENERATION_PROVIDER', 'anthropic')
    env.setenv('ANTHROPIC_API_KEY', 'anthropic-key-not-real')
    with pytest.raises(GenerationError) as error:
        create_provider()
    assert error.value.code == 'not_configured'


def test_unknown_provider_rejected_without_echoing_value(env):
    env.setenv('GENERATION_PROVIDER', 'sk-segreto-per-errore')
    status = config_status()
    assert status['configured'] is False
    assert status['invalid'] == ['GENERATION_PROVIDER']
    assert 'sk-segreto' not in str(status)
    with pytest.raises(GenerationError) as error:
        generate(extraction())
    assert error.value.code == 'not_configured'
