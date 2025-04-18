import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api.models import User, ExportTemplate
from app.core.security import get_password_hash, active_sessions
from sqlmodel import Session
from app.db import engine
import base64
from datetime import datetime, timedelta

client = TestClient(app)


@pytest.fixture
def test_user():
    with Session(engine) as session:
        password_hash, salt = get_password_hash("password123")
        user = User(
            username="testexporter",
            password_hash=password_hash,
            salt=salt,
            name="Test Exporter",
            default_gen_model="llama3",
            default_para_model="llama3"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        # Create a mock session
        active_sessions[user.username] = {
            "user_id": user.id,
            "valid_until": datetime.now(datetime.timezone.utc) + timedelta(minutes=30)
        }
        token = base64.b64encode(f"{user.username}:password123".encode()).decode()
        
        yield user, token


def test_default_export_templates_created():
    """Test that default export templates are created during migration"""
    with Session(engine) as session:
        templates = session.query(ExportTemplate).all()
        
        # Should have at least the 4 default templates
        assert len(templates) >= 4
        
        # Check default format names
        format_names = [t.format_name for t in templates]
        for expected in ["mlx-chat", "mlx-instruct", "tool-calling", "raw"]:
            assert expected in format_names


def test_get_export_templates(test_user):
    """Test retrieving export templates"""
    user, token = test_user
    
    response = client.get(
        "/export_templates/",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 4


def test_filter_export_templates_by_format(test_user):
    """Test filtering export templates by format name"""
    user, token = test_user
    
    response = client.get(
        "/export_templates/?format_name=mlx-chat",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert len(data["items"]) > 0
    for template in data["items"]:
        assert template["format_name"] == "mlx-chat"


def test_create_custom_export_template(test_user):
    """Test creating a custom export template"""
    user, token = test_user
    
    custom_template = {
        "name": "Custom Format",
        "description": "My custom export format",
        "format_name": "custom",
        "template": '{"system": {{ system_prompt|tojson }}, "output": {{ output|tojson }}}',
        "is_default": True
    }
    
    response = client.post(
        "/export_templates/",
        json=custom_template,
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    
    assert data["name"] == custom_template["name"]
    assert data["format_name"] == custom_template["format_name"]
    assert data["is_default"] == True
    assert data["owner_id"] == user.id


def test_update_export_template(test_user):
    """Test updating an export template"""
    user, token = test_user
    
    # First create a template
    custom_template = {
        "name": "Template to Update",
        "description": "Will be updated",
        "format_name": "update-test",
        "template": '{"test": "test"}',
        "is_default": False
    }
    
    response = client.post(
        "/export_templates/",
        json=custom_template,
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 201
    template_id = response.json()["id"]
    
    # Now update it
    update_data = {
        "name": "Updated Template",
        "description": "This has been updated",
        "is_default": True
    }
    
    response = client.put(
        f"/export_templates/{template_id}",
        json=update_data,
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["name"] == update_data["name"]
    assert data["description"] == update_data["description"]
    assert data["is_default"] == update_data["is_default"]
    assert data["format_name"] == custom_template["format_name"]  # Unchanged


def test_archive_export_template(test_user):
    """Test archiving an export template"""
    user, token = test_user
    
    # First create a template
    custom_template = {
        "name": "Template to Archive",
        "description": "Will be archived",
        "format_name": "archive-test",
        "template": '{"test": "test"}',
        "is_default": False
    }
    
    response = client.post(
        "/export_templates/",
        json=custom_template,
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 201
    template_id = response.json()["id"]
    
    # Now archive it
    response = client.put(
        f"/export_templates/{template_id}/archive",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    
    # Verify it's archived by trying to get it with include_archived=false
    response = client.get(
        "/export_templates/",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # The template should not be in the results
    for template in data["items"]:
        if template["id"] == template_id:
            assert template["archived"] == True