import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .generation_routes import router as generation_router
from .editing_routes import router as editing_router
from .storage import Store


def create_app(storage_dir=None):
    app = FastAPI(title='Formazione — API locale', version='0.1.0')
    default_root = Path(__file__).resolve().parents[3] / 'var' / 'api'
    app.state.store = Store(storage_dir or os.environ.get('FORMAZIONE_DATA_DIR', default_root))
    origins = os.environ.get('FORMAZIONE_CORS_ORIGINS', 'http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082')
    app.add_middleware(CORSMiddleware, allow_origins=origins.split(','), allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Content-Type'])
    app.include_router(router)
    app.include_router(generation_router)
    app.include_router(editing_router)
    return app


app = create_app()
