import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import ambiente
from .account.auth import utente_corrente
from .account.config import is_auth_required, valida_config_avvio
from .account.db import inizializza_db, resolve_db_path
from .branch_quiz_routes import router as branch_quiz_router
from .editing_routes import router as editing_router
from .funzioni import router as funzioni_router
from .gamification_routes import router as gamification_router
from .generation_routes import router as generation_router
from .impostazioni_routes import router as impostazioni_router
from .routes import public_router as health_router, router
from .routes_account import public_router as public_account_router, router as account_router
from .account.routes_referral import router as referral_router
from .account.routes_duelli import public_router as public_duelli_router, router as duelli_router
from .storage import Store
from .voice_recall_routes import router as voice_recall_router


def create_app(storage_dir=None):
    # Prima di tutto il resto: fornitore, chiavi, modello e limiti di spesa vengono dal file .env
    # del server (ambiente.py), senza sovrascrivere le variabili già impostate nel processo.
    env_file = ambiente.percorso()
    ambiente.carica(env_file)
    valida_config_avvio()

    app = FastAPI(title='Formazione — API locale', version='0.1.0')
    app.state.env_file = env_file
    default_root = Path(__file__).resolve().parents[3] / 'var' / 'api'
    target_storage = storage_dir or os.environ.get('FORMAZIONE_DATA_DIR', default_root)
    app.state.store = Store(target_storage)

    if is_auth_required():
        inizializza_db(resolve_db_path(target_storage))

    origins = os.environ.get('FORMAZIONE_CORS_ORIGINS', 'http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082')
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins.split(','),
        allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allow_headers=['Content-Type', 'Authorization'],
    )

    # Rotte pubbliche (nessuna dependency di autenticazione)
    app.include_router(health_router)
    app.include_router(public_account_router)
    app.include_router(public_duelli_router)

    # Rotte protette (richiedono utente_corrente; con AUTH_REQUIRED=false restituisce UTENTE_LOCALE)
    auth_deps = [Depends(utente_corrente)]
    app.include_router(router, dependencies=auth_deps)
    app.include_router(generation_router, dependencies=auth_deps)
    app.include_router(editing_router, dependencies=auth_deps)
    app.include_router(impostazioni_router, dependencies=auth_deps)
    app.include_router(branch_quiz_router, dependencies=auth_deps)
    app.include_router(gamification_router, dependencies=auth_deps)
    app.include_router(funzioni_router, dependencies=auth_deps)
    app.include_router(voice_recall_router, dependencies=auth_deps)
    app.include_router(account_router, dependencies=auth_deps)
    app.include_router(referral_router, dependencies=auth_deps)
    app.include_router(duelli_router, dependencies=auth_deps)
    return app


app = create_app()
