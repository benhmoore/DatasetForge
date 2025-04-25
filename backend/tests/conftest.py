import pytest
import os
import sys
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import base64
from unittest.mock import patch

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set test environment variables
os.environ["ENV_FILE"] = os.path.join(os.path.dirname(__file__), ".env.test")

# Import app after setting environment variables
from app.main import app
from app.db import get_session
from app.api.models import User, Template, Dataset, Example, Workflow


@pytest.fixture(name="session")
def session_fixture():
    """Create an in-memory database session for testing"""
    engine = create_engine(
        "sqlite://",  # In-memory SQLite database
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session):
    """Create a test client with the in-memory database session"""

    def get_test_session():
        yield session

    app.dependency_overrides[get_session] = get_test_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_user")
def test_user_fixture(session):
    """Create a test user in the database"""
    # Generate password hash and salt
    password_hash, salt = get_password_hash("testpassword")

    # Create a test user
    user = User(
        username="testuser",
        password_hash=password_hash,
        salt=salt,
        name="Test User",
        default_gen_model="model1",
        default_para_model="model2",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return user


@pytest.fixture(name="disable_rate_limit", autouse=True)
def disable_rate_limit_fixture(monkeypatch):
    """Disable rate limiting for all tests"""

    # No-op decorator to replace the rate limiter
    def dummy_decorator(*args, **kwargs):
        def inner(func):
            return func

        return inner

    # Import the limiter and replace its limit method
    from app.api.auth import limiter

    original_limit = limiter.limit
    monkeypatch.setattr(limiter, "limit", dummy_decorator)

    yield

    # Restore the original limiter after the test
    monkeypatch.setattr(limiter, "limit", original_limit)


@pytest.fixture(name="login")
def login_fixture(client, test_user):
    """Log in the test user"""
    credentials = f"{test_user.username}:testpassword"
    response = client.post(
        "/login",
        headers={
            "Authorization": f"Basic {base64.b64encode(credentials.encode()).decode()}"
        },
    )
    assert response.status_code == 200
    return response


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(test_user):
    """Create HTTP Basic auth headers for the test user"""
    credentials = f"{test_user.username}:testpassword"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


@pytest.fixture(name="test_template")
def test_template_fixture(session):
    """Create a test template in the database"""
    template = Template(
        name="Test Template",
        system_prompt="You are a helpful assistant.",
        user_prompt="Answer this question: {question}",
        slots=["question"],
        archived=False,
    )
    session.add(template)
    session.commit()
    session.refresh(template)

    return template


@pytest.fixture(name="test_dataset")
def test_dataset_fixture(session, test_user):
    """Create a test dataset in the database"""
    # Create a salt for encryption
    salt = base64.b64encode(os.urandom(16)).decode()

    dataset = Dataset(name="Test Dataset", salt=salt, archived=False)
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    return dataset
