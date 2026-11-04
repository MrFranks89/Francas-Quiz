class GenerationError(ValueError):
    def __init__(self, code: str, message: str, causa: dict | None = None):
        super().__init__(message)
        self.code = code
        # Causa strutturata e senza segreti di un errore del fornitore (causa.py); None per gli altri errori.
        self.causa = causa
