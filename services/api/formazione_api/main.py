import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import ambiente
from .routes import router
from .generation_routes import router as generation_router
from .editing_routes import router as editing_router
from .impostazioni_routes import router as impostazioni_router
from .branch_quiz_routes import router as branch_quiz_router
from .storage import Store


def create_app(storage_dir=None):
    # Prima di tutto il resto: fornitore, chiavi, modello e limiti di spesa vengono dal file .env
    # del server (ambiente.py), senza sovrascrivere le variabili già impostate nel processo.
    env_file = ambiente.percorso()
    ambiente.carica(env_file)
    app = FastAPI(title='Formazione — API locale', version='0.1.0')
    app.state.env_file = env_file
    default_root = Path(__file__).resolve().parents[3] / 'var' / 'api'
    app.state.store = Store(storage_dir or os.environ.get('FORMAZIONE_DATA_DIR', default_root))
    origins = os.environ.get('FORMAZIONE_CORS_ORIGINS', 'http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082')
    app.add_middleware(CORSMiddleware, allow_origins=origins.split(','), allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Content-Type'])
    app.include_router(router)
    app.include_router(generation_router)
    app.include_router(editing_router)
    app.include_router(impostazioni_router)
    app.include_router(branch_quiz_router)
    return app


app = create_app()
