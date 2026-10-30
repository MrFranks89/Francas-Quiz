"""Impostazioni comuni dei test del server.

Il file .env del server (services/api/.env) può contenere le chiavi vere dell'operatore: i test non
devono mai leggerlo né scriverlo. Prima che un modulo di test importi formazione_api.main (che crea
l'app e legge il file all'avvio), il percorso è puntato a un file che non esiste.
"""
import os
import tempfile
from pathlib import Path

os.environ['FORMAZIONE_ENV_FILE'] = str(Path(tempfile.gettempdir()) / 'formazione-test' / 'env-dei-test-inesistente')
