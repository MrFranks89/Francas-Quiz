"""Regole pure per la validazione, generazione e controlli anti-abuso del referral."""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime
from typing import Literal

ALFABETO_REFERRAL = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
_REGEX_REFERRAL = re.compile(r"^(REF-)?[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$")

EsitoAntiAbuso = Literal[
    "CODICE_SCONOSCIUTO",
    "AUTO_INVITO",
    "EMAIL_GIA_REGISTRATA",
    "FINESTRA_SCADUTA",
    "GIA_ACCREDITATO",
    "TETTO_RAGGIUNTO",
    "ACCREDITATO",
]


def genera_codice_referral() -> str:
    """Genera un codice univoco crittograficamente sicuro con prefisso REF- e 8 caratteri."""
    corpo = "".join(secrets.choice(ALFABETO_REFERRAL) for _ in range(8))
    return f"REF-{corpo}"


def valida_codice_referral(codice: str) -> bool:
    """Verifica se una stringa rispetta la sintassi del codice referral."""
    if not codice:
        return False
    norm = codice.strip().upper()
    return bool(_REGEX_REFERRAL.match(norm))


def normalizza_codice_referral(codice: str) -> str:
    """Normalizza il codice (trim, uppercase, prefisso REF- opzionale in input).
    
    Solleva ValueError se il formato non è valido.
    """
    if not codice:
        raise ValueError("Codice referral mancante.")
    norm = codice.strip().upper()
    if not _REGEX_REFERRAL.match(norm):
        raise ValueError(f"Formato codice referral non valido: '{codice}'.")
    if not norm.startswith("REF-"):
        norm = f"REF-{norm}"
    return norm


def maschera_nome_o_iniziali(nome_visualizzato: str | None, email: str | None) -> str:
    """Restituisce il nome visualizzato o le iniziali protette. MAI esporre l'email intera."""
    if nome_visualizzato and nome_visualizzato.strip():
        return nome_visualizzato.strip()
    if email and "@" in email:
        local = email.split("@")[0].strip()
        if local:
            return f"{local[0].upper()}."
    return "Utente"


def hash_dispositivo_o_ip(valore: str | None, salt: str) -> str | None:
    """Calcola l'hash sha256 salato per IP o identificativo dispositivo."""
    if not valore or not valore.strip():
        return None
    testo = f"{salt}:{valore.strip()}".encode("utf-8")
    return hashlib.sha256(testo).hexdigest()


def valuta_antiabuso(
    *,
    invitante_id: str | None,
    invitato_id: str,
    invitante_email_hash: str | None,
    invitato_email_hash: str | None,
    email_gia_vista_da_altro: bool,
    creato_il_invitato: datetime,
    adesso: datetime,
    finestra_ore: int,
    gia_accreditato: bool,
    corsi_extra_invitante: int,
    tetto_corsi_extra: int,
    is_redeem: bool,
) -> tuple[EsitoAntiAbuso, bool]:
    """Valuta l'ammissibilità dell'accredito referral nell'ordine rigoroso ratificato.
    
    Restituisce una tupla (esito, accreditabile).
    """
    # 1. CODICE_SCONOSCIUTO
    if invitante_id is None:
        return "CODICE_SCONOSCIUTO", False

    # 2. AUTO_INVITO
    if invitante_id == invitato_id:
        return "AUTO_INVITO", False
    if invitante_email_hash and invitato_email_hash and invitante_email_hash == invitato_email_hash:
        return "AUTO_INVITO", False

    # 3. EMAIL_GIA_REGISTRATA (l'email normale era già stata vista da un altro account)
    if email_gia_vista_da_altro:
        return "EMAIL_GIA_REGISTRATA", False

    # 4. FINESTRA_SCADUTA (valutata solo su /referral/redeem manuale)
    if is_redeem:
        diff_secondi = (adesso - creato_il_invitato).total_seconds()
        if diff_secondi > (finestra_ore * 3600):
            return "FINESTRA_SCADUTA", False

    # 5. GIA_ACCREDITATO (ha già ricevuto accredito referral in precedenza)
    if gia_accreditato:
        return "GIA_ACCREDITATO", False

    # 6. TETTO_RAGGIUNTO (invitante ha raggiunto il tetto corsi extra)
    if corsi_extra_invitante >= tetto_corsi_extra:
        return "TETTO_RAGGIUNTO", False

    # 7. ACCREDITATO
    return "ACCREDITATO", True
