import json
import re
from pathlib import Path
from uuid import uuid4

from .account.percorsi import radice_utente


class Store:
    def __init__(self, root, user_id: str = 'local'):
        self.base_root = Path(root)
        self.user_id = user_id
        self.root = radice_utente(user_id, self.base_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def per_utente(self, user_id: str) -> 'Store':
        return Store(self.base_root, user_id=user_id)

    def new_id(self):
        return uuid4().hex

    def path(self, identifier, suffix):
        if not re.fullmatch(r'[a-f0-9]{32}', identifier):
            raise FileNotFoundError(identifier)
        return self.root / f'{identifier}.{suffix}'

    def save(self, identifier, suffix, data):
        path = self.path(identifier, suffix)
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        temporary.replace(path)

    def read(self, identifier, suffix):
        return json.loads(self.path(identifier, suffix).read_text(encoding='utf-8'))
