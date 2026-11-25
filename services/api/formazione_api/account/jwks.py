"""Cache in memoria per le chiavi JWKS (RS256/ES256) con refresh forzato su kid ignoto."""
from __future__ import annotations

import json
import time
import urllib.request
from typing import Any, Callable
import jwt

from .config import get_supabase_jwks_url


class JWKSCache:
    def __init__(
        self,
        jwks_url: str | None = None,
        ttl_seconds: int = 3600,
        fetcher: Callable[[str], dict[str, Any]] | None = None,
    ):
        self.jwks_url = jwks_url
        self.ttl_seconds = ttl_seconds
        self.fetcher = fetcher or self._default_fetcher
        self._keys: dict[str, Any] = {}
        self._last_fetch: float = 0.0
        self.refresh_count: int = 0

    def _default_fetcher(self, url: str) -> dict[str, Any]:
        req = urllib.request.Request(url, headers={"User-Agent": "FormazioneAPI/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def fetch_keys(self) -> None:
        url = self.jwks_url or get_supabase_jwks_url()
        if not url:
            raise RuntimeError("URL JWKS non configurato.")
        data = self.fetcher(url)
        keys_list = data.get("keys", [])
        new_keys: dict[str, Any] = {}
        for k in keys_list:
            kid = k.get("kid")
            if kid:
                pyjwk = jwt.PyJWK(k)
                new_keys[kid] = pyjwk.key
        self._keys = new_keys
        self._last_fetch = time.time()
        self.refresh_count += 1

    def get_key_for_kid(self, kid: str) -> Any:
        now = time.time()
        # Se cache scaduta o mai popolata
        if not self._keys or (now - self._last_fetch) > self.ttl_seconds:
            self.fetch_keys()

        # Se il kid è presente, restituiscilo
        if kid in self._keys:
            return self._keys[kid]

        # Se kid ignoto, forza il refresh UNA volta
        self.fetch_keys()
        if kid in self._keys:
            return self._keys[kid]

        raise KeyError(f"Chiave con kid '{kid}' non trovata nel JWKS.")


_ISTANZA_CACHE: JWKSCache | None = None


def get_jwks_cache() -> JWKSCache:
    global _ISTANZA_CACHE
    if _ISTANZA_CACHE is None:
        _ISTANZA_CACHE = JWKSCache()
    return _ISTANZA_CACHE


def reset_jwks_cache(nuova_istanza: JWKSCache | None = None) -> None:
    """Utility per test: permette di azzerare o iniettare una cache mock."""
    global _ISTANZA_CACHE
    _ISTANZA_CACHE = nuova_istanza
