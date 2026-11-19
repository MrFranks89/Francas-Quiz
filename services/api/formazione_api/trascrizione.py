"""Adattatore di trascrizione audio con Groq Whisper (free tier)."""
import os
from pathlib import Path

from .generation.causa import errore_fornitore
from .generation.errors import GenerationError
from .generation.instructions import MAX_RETRIES, TIMEOUT_SECONDS

VERSIONE = '2026-11-18-audio'
DURATA_MASSIMA_SECOND = 7200          # 2 ore: limite orario del free tier Groq
BLOCCO_TARGET_SECOND = 120            # un blocco di testo ogni ~2 minuti di audio
MODELLO_PREDEFINITO = 'whisper-large-v3-turbo'

# Estensioni che l'API Groq riconosce: il file salvato nello storage si chiama
# «<id>.source» senza estensione, quindi il nome va ricostruito prima dell'invio.
ESTENSIONI_AUDIO = {'.wav', '.mp3', '.m4a', '.ogg', '.webm', '.flac', '.mp4', '.mpeg', '.mpga', '.opus'}


def _estensione_dai_magic_bytes(dati: bytes) -> str:
    """Deduce l'estensione dal contenuto quando il nome del file non la dichiara."""
    if len(dati) >= 12 and dati[:4] == b'RIFF' and dati[8:12] == b'WAVE':
        return '.wav'
    if dati[:3] == b'ID3' or (len(dati) >= 2 and dati[0] == 0xFF and (dati[1] & 0xE0) == 0xE0):
        return '.mp3'
    if len(dati) >= 8 and dati[4:8] == b'ftyp':
        return '.m4a'
    if dati[:4] == b'OggS':
        return '.ogg'
    if dati[:4] == b'\x1a\x45\xdf\xa3':
        return '.webm'
    if dati[:4] == b'fLaC':
        return '.flac'
    return '.mp3'  # ultima risorsa: l'estensione più comunemente accettata


def formatta_tempo(secondi: float) -> str:
    """Formatta i secondi in mm:ss."""
    s = int(round(secondi))
    m = s // 60
    sec = s % 60
    return f'{m:02d}:{sec:02d}'


class GroqTrascrizione:
    """Provider per la trascrizione audio tramite Groq Whisper (compatibile OpenAI)."""

    def __init__(self, client=None, model=None):
        self.provider_name = 'groq'
        self.model = model or os.getenv('GROQ_TRANSCRIPTION_MODEL', MODELLO_PREDEFINITO).strip()
        if client is None:
            key = os.getenv('GROQ_API_KEY', '').strip()
            if not key:
                raise GenerationError('not_configured', 'Configurare GROQ_API_KEY nel processo server')
            from openai import OpenAI
            client = OpenAI(
                api_key=key,
                base_url='https://api.groq.com/openai/v1',
                timeout=TIMEOUT_SECONDS,
                max_retries=MAX_RETRIES,
            )
        self.client = client
        self.last_usage = None

    def trascrivi(self, file_path: Path | str, nome: str | None = None) -> tuple[list[dict], list[str], str, float]:
        path = Path(file_path)
        durata = self._rileva_durata(path)
        if durata > DURATA_MASSIMA_SECOND:
            minuti = int(durata // 60)
            raise GenerationError(
                'audio_troppo_lungo',
                f'Il file audio dura {minuti} minuti: il limite consentito è di 2 ore (7200 secondi). '
                'Si consiglia di suddividere il file in parti più brevi.',
            )

        file_name = nome or path.name
        dati = path.read_bytes()
        if Path(file_name).suffix.lower() not in ESTENSIONI_AUDIO:
            file_name = f'{Path(file_name).stem}{_estensione_dai_magic_bytes(dati)}'
        language = os.getenv('TRANSCRIPTION_LANGUAGE', 'it').strip() or None

        kwargs = {
            'model': self.model,
            'file': (file_name, dati),
            'response_format': 'verbose_json',
            'timestamp_granularities': ['segment'],
        }
        if language:
            kwargs['language'] = language

        try:
            response = self.client.audio.transcriptions.create(**kwargs)
        except GenerationError:
            raise
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        self.last_usage = dict(durata_secondi=durata, model=self.model)

        segments = getattr(response, 'segments', None)
        if segments is None and isinstance(response, dict):
            segments = response.get('segments')
        if segments is None:
            segments = []

        blocks = []
        warnings = ['Trascrizione automatica: verificare nomi propri, numeri e termini tecnici prima di generare.']
        status = 'needs_review'

        curr_texts = []
        curr_start = None
        last_end = 0.0

        for seg in segments:
            s_start = getattr(seg, 'start', None) if not isinstance(seg, dict) else seg.get('start')
            s_end = getattr(seg, 'end', None) if not isinstance(seg, dict) else seg.get('end')
            s_text = getattr(seg, 'text', '') if not isinstance(seg, dict) else seg.get('text', '')
            if not s_text or not s_text.strip():
                continue
            if curr_start is None:
                curr_start = float(s_start if s_start is not None else 0.0)
            curr_texts.append(s_text.strip())
            last_end = float(s_end if s_end is not None else (curr_start + 1.0))

            if last_end - curr_start >= BLOCCO_TARGET_SECOND:
                b_id = f'b{len(blocks) + 1}'
                label = f'{formatta_tempo(curr_start)}–{formatta_tempo(last_end)}'
                blocks.append({
                    'id': b_id,
                    'text': ' '.join(curr_texts).strip(),
                    'page': None,
                    'label': label,
                    'kind': 'text',
                })
                curr_texts = []
                curr_start = None

        if curr_texts and curr_start is not None:
            b_id = f'b{len(blocks) + 1}'
            label = f'{formatta_tempo(curr_start)}–{formatta_tempo(last_end)}'
            blocks.append({
                'id': b_id,
                'text': ' '.join(curr_texts).strip(),
                'page': None,
                'label': label,
                'kind': 'text',
            })

        if not blocks:
            # Fallback se non ci sono segmenti ma c'è testo globale non vuoto
            full_text = getattr(response, 'text', '') if not isinstance(response, dict) else response.get('text', '')
            if full_text and full_text.strip():
                label = f'00:00–{formatta_tempo(durata)}'
                blocks.append({
                    'id': 'b1',
                    'text': full_text.strip(),
                    'page': None,
                    'label': label,
                    'kind': 'text',
                })
            else:
                warnings.append('Nessun parlato rilevato nel file audio.')

        return blocks, warnings, status, durata

    def _rileva_durata(self, path: Path) -> float:
        import mutagen
        try:
            info = mutagen.File(path)
            if info is None or info.info is None:
                raise ValueError('Il file audio non è leggibile.')
            durata = getattr(info.info, 'length', 0)
            if not durata or durata <= 0:
                raise ValueError('Il file audio non è leggibile.')
            return float(durata)
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            raise ValueError('Il file audio non è leggibile.') from error


def trascrivi(file_path: Path | str, client=None, provider=None, nome: str | None = None) -> tuple[list[dict], list[str], str, float]:
    """Funzione di alto livello per la trascrizione audio."""
    p = provider or GroqTrascrizione(client=client)
    return p.trascrivi(file_path, nome=nome)
