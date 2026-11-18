class GenerationError(ValueError):
    def __init__(self, code: str, message: str, causa: dict | None = None):
        super().__init__(message)
        self.code = code
        # Causa strutturata e senza segreti di un errore del fornitore (causa.py); None per gli altri errori.
        self.causa = causa
        # Blocchi salvati per la ripresa ({savedChunks, totalChunks}), scritto da generate() quando il
        # fallimento avviene durante i blocchi di una generazione con ripresa; None negli altri casi.
        self.ripresa = None
