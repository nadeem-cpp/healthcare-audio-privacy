# Path: config.py
"""
Purpose:
    Centralizes project configuration and environment variables.

What it does:
    - Loads environment variables from a .env file via pydantic-settings.
    - Builds the MongoDB URI from DB credentials.
    - Stores auth settings, Redis URL, and CORS_ALLOWED_ORIGINS.
    - Exposes AI keys (OpenAI, Anthropic), AWS/S3, email, and internal API settings.
"""
from typing import Annotated
from urllib.parse import quote_plus

from pydantic import computed_field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    ENVIRONMENT: str
    APP_NAME: str

    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_NAME: str

    AUTH_SECRET_KEY: str
    AUTH_ALGORITHM: str
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int


    EMAIL_APP_PASSWORD: str
    FROM_EMAIL: str


    # Comma-separated list of allowed CORS origins (e.g. https://app.example.com,http://localhost:3000)
    CORS_ALLOWED_ORIGINS: Annotated[list[str], NoDecode]

    @field_validator("CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @computed_field
    @property
    def MONGO_USER(self) -> str:
        return quote_plus(self.DB_USER)

    @computed_field
    @property
    def MONGO_PASS(self) -> str:
        return quote_plus(self.DB_PASSWORD)

    @computed_field
    @property
    def MONGO_HOST(self) -> str:
        return self.DB_HOST

    @computed_field
    @property
    def MONGO_DB(self) -> str:
        return self.DB_NAME

    @computed_field
    @property
    def DB_URI(self) -> str:
        return (
            f"mongodb+srv://{self.MONGO_USER}:{self.MONGO_PASS}"
            f"@{self.MONGO_HOST}/{self.MONGO_DB}"
        )


settings = Settings()

ENVIRONMENT = settings.ENVIRONMENT
APP_NAME = settings.APP_NAME

MONGO_USER = settings.MONGO_USER
MONGO_PASS = settings.MONGO_PASS
MONGO_HOST = settings.MONGO_HOST
MONGO_DB = settings.MONGO_DB
DB_URI = settings.DB_URI

AUTH_SECRET_KEY = settings.AUTH_SECRET_KEY
AUTH_ALGORITHM = settings.AUTH_ALGORITHM
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES = settings.AUTH_ACCESS_TOKEN_EXPIRE_MINUTES


EMAIL_APP_PASSWORD = settings.EMAIL_APP_PASSWORD
FROM_EMAIL = settings.FROM_EMAIL


CORS_ALLOWED_ORIGINS = settings.CORS_ALLOWED_ORIGINS
