class CollectorError(Exception):
    """A safe, public error; never wrap raw upstream or database exceptions."""
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)
