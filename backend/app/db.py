import os
from sqlmodel import Session, SQLModel, create_engine
from .core.config import settings

# Handle special DB path for in-memory SQLite for testing
if settings.DB_PATH == ":memory:":
    # In-memory database for testing
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    # Create data directory if it doesn't exist and using file-based DB
    if settings.DB_PATH and settings.DB_PATH != ":memory:":
        os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)
    
    # Create SQLite engine
    engine = create_engine(
        f"sqlite:///{settings.DB_PATH}",
        connect_args={"check_same_thread": False},
        echo=False,
    )


def create_db_and_tables():
    """Create all tables defined by SQLModel.metadata"""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency for getting DB session"""
    with Session(engine) as session:
        yield session