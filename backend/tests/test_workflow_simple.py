"""
Simple isolated test for workflow endpoints.
"""
import pytest
import os
import sys
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool
import base64
from unittest.mock import patch

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Disable the default migration in app/db.py
from unittest.mock import patch
with patch('app.db_migration.migrate_database'):
    # Import app with migration disabled
    from app.main import app
    from app.db import get_session
    from app.api.models import User, Workflow
    from app.core.security import get_password_hash

@pytest.fixture(name="session")
def session_fixture():
    """Create an in-memory database session for testing"""
    engine = create_engine(
        "sqlite://",  # In-memory SQLite database
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
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
        default_para_model="model2"
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return user

@pytest.fixture(name="auth_headers")
def auth_headers_fixture(test_user):
    """Create HTTP Basic auth headers for the test user"""
    credentials = f"{test_user.username}:testpassword"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}

@pytest.fixture(name="test_workflow")
def test_workflow_fixture(session, test_user):
    """Create a test workflow in the database"""
    workflow = Workflow(
        name="Test Workflow",
        description="Test workflow description",
        owner_id=test_user.id,
        data={
            "nodes": {
                "node1": {
                    "id": "node1",
                    "type": "input",
                    "name": "Input Node",
                    "position": {"x": 100, "y": 100}
                },
                "node2": {
                    "id": "node2",
                    "type": "output",
                    "name": "Output Node",
                    "position": {"x": 300, "y": 100}
                }
            },
            "connections": [
                {
                    "source_node_id": "node1",
                    "target_node_id": "node2"
                }
            ]
        },
        version=1
    )
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    
    return workflow

def test_get_workflow_by_id(client, auth_headers, test_workflow):
    """Test getting a single workflow by ID"""
    response = client.get(f"/workflows/{test_workflow.id}", headers=auth_headers)
    assert response.status_code == 200
    
    workflow = response.json()
    assert workflow["id"] == test_workflow.id
    assert workflow["name"] == test_workflow.name
    assert workflow["description"] == test_workflow.description
    assert workflow["data"] == test_workflow.data
    assert workflow["version"] == test_workflow.version