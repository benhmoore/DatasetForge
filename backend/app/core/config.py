import os
from typing import List, Dict, Optional
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    DB_PATH: str
    OLLAMA_HOST: str
    OLLAMA_PORT: int
    OLLAMA_TIMEOUT: int
    CORS_ORIGINS: str
    
    # Default model settings
    DEFAULT_GEN_MODEL: str
    DEFAULT_PARA_MODEL: str
    DEFAULT_CONTEXT_SIZE: int = 4096
    GEN_MODEL_CONTEXT_SIZE: Optional[int] = None
    PARA_MODEL_CONTEXT_SIZE: Optional[int] = None

    @validator("DB_PATH", pre=True)
    def override_db_path_for_tests(cls, v):
        if os.getenv("TESTING") == "1":
            return ":memory:"
        return v

    @validator("CORS_ORIGINS")
    def parse_cors_origins(cls, v):
        return v.split(",")

    class Config:
        env_file = os.environ.get("ENV_FILE", ".env")


settings = Settings()
