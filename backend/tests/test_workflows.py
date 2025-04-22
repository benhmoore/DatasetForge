import pytest
import json
from fastapi import status
from app.api.models import Workflow
from datetime import datetime, timezone
import time


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


def test_get_workflows_empty(client, auth_headers):
    """Test getting workflows when none exist"""
    response = client.get("/workflows", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


def test_get_workflows(client, auth_headers, test_workflow):
    """Test getting all workflows"""
    response = client.get("/workflows", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    
    workflow = data["items"][0]
    assert workflow["id"] == test_workflow.id
    assert workflow["name"] == test_workflow.name
    assert workflow["description"] == test_workflow.description
    assert workflow["data"] == test_workflow.data
    assert workflow["version"] == test_workflow.version


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


def test_get_workflow_not_found(client, auth_headers):
    """Test getting a workflow that doesn't exist"""
    response = client.get("/workflows/999", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Workflow not found"


def test_create_workflow(client, auth_headers):
    """Test creating a new workflow"""
    workflow_data = {
        "name": "New Workflow",
        "description": "New workflow description",
        "data": {
            "nodes": {
                "node1": {
                    "id": "node1",
                    "type": "input",
                    "name": "Input Node",
                    "position": {"x": 100, "y": 100}
                }
            },
            "connections": []
        }
    }
    
    response = client.post("/workflows", json=workflow_data, headers=auth_headers)
    assert response.status_code == 201
    
    created = response.json()
    assert created["name"] == workflow_data["name"]
    assert created["description"] == workflow_data["description"]
    assert created["data"] == workflow_data["data"]
    assert created["version"] == 1
    assert "id" in created
    assert "created_at" in created
    assert "updated_at" in created


def test_create_workflow_duplicate_name(client, auth_headers, test_workflow):
    """Test creating a workflow with a duplicate name"""
    workflow_data = {
        "name": test_workflow.name,  # Same name as existing workflow
        "description": "Duplicate name workflow",
        "data": {"nodes": {}, "connections": []}
    }
    
    response = client.post("/workflows", json=workflow_data, headers=auth_headers)
    assert response.status_code == 409
    assert response.json()["detail"] == f"Workflow with name '{test_workflow.name}' already exists."


def test_update_workflow(client, auth_headers, test_workflow, session):
    """Test updating a workflow"""
    update_data = {
        "name": "Updated Workflow",
        "description": "Updated description",
        "data": {
            "nodes": {
                "node1": {
                    "id": "node1",
                    "type": "input",
                    "name": "Updated Input Node",
                    "position": {"x": 200, "y": 200}
                }
            },
            "connections": []
        }
    }
    
    response = client.put(f"/workflows/{test_workflow.id}", json=update_data, headers=auth_headers)
    assert response.status_code == 200
    
    updated = response.json()
    assert updated["id"] == test_workflow.id
    assert updated["name"] == update_data["name"]
    assert updated["description"] == update_data["description"]
    assert updated["data"] == update_data["data"]
    assert updated["version"] == 2  # Version should be incremented
    
    # Verify in database
    db_workflow = session.get(Workflow, test_workflow.id)
    assert db_workflow.name == update_data["name"]
    assert db_workflow.description == update_data["description"]
    assert db_workflow.data == update_data["data"]
    assert db_workflow.version == 2


def test_update_workflow_partial(client, auth_headers, test_workflow, session):
    """Test partial update of a workflow"""
    # Only update name, leave other fields unchanged
    update_data = {
        "name": "Partially Updated Workflow"
    }
    
    response = client.put(f"/workflows/{test_workflow.id}", json=update_data, headers=auth_headers)
    assert response.status_code == 200
    
    updated = response.json()
    assert updated["id"] == test_workflow.id
    assert updated["name"] == update_data["name"]
    assert updated["description"] == test_workflow.description  # Unchanged
    assert updated["data"] == test_workflow.data  # Unchanged
    assert updated["version"] == 2  # Version should be incremented


def test_update_workflow_optimistic_concurrency(client, auth_headers, test_workflow, session):
    """Test optimistic concurrency control for updates"""
    # First update
    update_data1 = {"name": "First Update"}
    response1 = client.put(f"/workflows/{test_workflow.id}", json=update_data1, headers=auth_headers)
    assert response1.status_code == 200
    
    # Try second update with original version (should fail)
    update_data2 = {"name": "Second Update"}
    response2 = client.put(f"/workflows/{test_workflow.id}", json=update_data2, headers=auth_headers)
    
    # OCC should detect the conflict (version mismatch)
    assert response2.status_code == 409
    assert "modified elsewhere" in response2.json()["detail"]
    
    # Verify in database that the first update succeeded but the second didn't
    db_workflow = session.get(Workflow, test_workflow.id)
    assert db_workflow.name == "First Update"
    assert db_workflow.version == 2


def test_update_workflow_not_found(client, auth_headers):
    """Test updating a workflow that doesn't exist"""
    update_data = {"name": "Updated Workflow"}
    response = client.put("/workflows/999", json=update_data, headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Workflow not found"


def test_delete_workflow(client, auth_headers, test_workflow, session):
    """Test deleting a workflow"""
    response = client.delete(f"/workflows/{test_workflow.id}", headers=auth_headers)
    assert response.status_code == 204
    
    # Verify in database
    db_workflow = session.get(Workflow, test_workflow.id)
    assert db_workflow is None


def test_delete_workflow_not_found(client, auth_headers):
    """Test deleting a workflow that doesn't exist"""
    response = client.delete("/workflows/999", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Workflow not found"


def test_duplicate_workflow(client, auth_headers, test_workflow, session):
    """Test duplicating a workflow"""
    response = client.post(f"/workflows/{test_workflow.id}/duplicate", headers=auth_headers)
    assert response.status_code == 201
    
    duplicated = response.json()
    assert duplicated["name"] == f"{test_workflow.name} (Copy)"
    assert duplicated["description"] == test_workflow.description
    assert duplicated["data"] == test_workflow.data
    assert duplicated["version"] == 1  # New workflow starts at version 1
    assert duplicated["id"] != test_workflow.id  # Should be a new ID
    
    # Verify in database
    workflows = session.exec(f"SELECT * FROM workflow").all()
    assert len(workflows) == 2  # Original + duplicate