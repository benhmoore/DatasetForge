from typing import List
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    DB_PATH: str
    SECRET_SALT: str
    OLLAMA_HOST: str
    OLLAMA_PORT: int
    OLLAMA_TIMEOUT: int
    CORS_ORIGINS: str
    LOGIN_RATE_LIMIT: int = 5
    SESSION_TIMEOUT: int = 30  # minutes

    @validator("CORS_ORIGINS")
    def parse_cors_origins(cls, v):
        return v.split(",")

    class Config:
        env_file = ".env"


settings = Settings()