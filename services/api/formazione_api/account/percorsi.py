import os
import re
from pathlib import Path

UUID_CANONICO_REGEX = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


def default_base_dir() -> Path:
    env_dir = os.environ.get('FORMAZIONE_DATA_DIR')
    if env_dir:
        return Path(env_dir)
    return Path(__file__).resolve().parents[4] / 'var' / 'api'


def radice_utente(user_id: str, base_dir: Path | str | None = None) -> Path:
    """Risoluzione dei percorsi dati isolati per utente.
    - user_id == "local" -> radice legacy esatta
    - UUID canonico -> <radice>/utenti/<user_id>/
    - altro -> ValueError (anti path traversal)
    """
    if base_dir is None:
        radice = default_base_dir()
    else:
        radice = Path(base_dir)

    if user_id == 'local':
        return radice

    if not isinstance(user_id, str) or not UUID_CANONICO_REGEX.match(user_id):
        raise ValueError(
            f"user_id non valido o non consentito (atteso 'local' o UUID canonico): {user_id!r}"
        )

    return radice / 'utenti' / user_id.lower()
