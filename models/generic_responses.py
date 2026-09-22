from pydantic import BaseModel


class ErrorModel(BaseModel):
    message: str