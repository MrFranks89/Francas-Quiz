"""GET/PUT /settings: fornitore, modello e chiave dalla schermata Impostazioni dell'app.

Solo per l'operatore locale. La rotta accetta soltanto connessioni da 127.0.0.1 o ::1 con un
Host locale (un sito che fa risolvere il proprio nome su 127.0.0.1, il «DNS rebinding», manda il
proprio nome nell'Host). La CORS resta quella di main.py, solo origini locali.

Il corpo è letto e validato a mano invece che con un modello pydantic: la risposta 422
predefinita di FastAPI ripete il valore ricevuto (`input`), e un campo sbagliato può contenere la
chiave. I messaggi d'errore di impostazioni.valida non ripetono mai i valori.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from . import impostazioni

router = APIRouter()
log = logging.getLogger(__name__)

CLIENT_LOCALI = {'127.0.0.1', '::1'}
HOST_LOCALI = {'127.0.0.1', 'localhost', '[::1]'}


def nome_host(host: str) -> str:
    host = host.strip().lower()
    if host.startswith('['):
        return host.split(']', 1)[0] + ']'
    return host.rsplit(':', 1)[0] if ':' in host else host


def solo_locale(request: Request) -> None:
    client = request.client.host if request.client else None
    if client not in CLIENT_LOCALI or nome_host(request.headers.get('host', '')) not in HOST_LOCALI:
        raise HTTPException(403, {'code': 'local_only', 'message': 'Impostazioni disponibili solo da questo computer (127.0.0.1).'})


def rifiuto(messaggio: str) -> HTTPException:
    return HTTPException(422, {'code': 'invalid_settings', 'message': messaggio})


@router.get('/settings', dependencies=[Depends(solo_locale)])
def leggi_impostazioni():
    return impostazioni.stato()


@router.put('/settings', dependencies=[Depends(solo_locale)])
async def salva_impostazioni(request: Request):
    try:
        corpo = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        raise rifiuto('Corpo della richiesta non valido: atteso un oggetto JSON.') from None
    try:
        return impostazioni.salva(request.app.state.env_file, corpo)
    except impostazioni.ImpostazioniRifiuto as errore:
        raise rifiuto(str(errore)) from None
    except OSError as errore:
        # Registrato senza il messaggio di sistema né i valori: basta il tipo d'errore e il file.
        log.error('Impostazioni non salvate: %s su %s', type(errore).__name__, request.app.state.env_file)
        raise HTTPException(500, {'code': 'settings_not_saved',
                                  'message': 'Impostazioni non salvate: il file .env del server non è scrivibile.'}) from None
