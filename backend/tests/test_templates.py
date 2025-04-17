def test_get_templates(client, auth_headers, test_template):
    """Test retrieving all templates"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Get templates
    response = client.get("/templates", headers=auth_headers)
    
    # Verify response
    assert response.status_code == 200
    templates = response.json()
    assert len(templates) >= 1
    assert any(t["id"] == test_template.id for t in templates)
    assert any(t["name"] == test_template.name for t in templates)
    # Check that the new field is present (can be None)
    assert all("model_override" in t for t in templates)


def test_create_template(client, auth_headers):
    """Test creating a new template"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Create a new template
    new_template = {
        "name": "New Test Template",
        "system_prompt": "You are a test assistant.",
        "user_prompt": "Answer this test question: {test_question}",
        "slots": ["test_question"]
    }
    response = client.post("/templates", json=new_template, headers=auth_headers)
    
    # Verify response
    assert response.status_code == 201  # Created
    created = response.json()
    assert created["name"] == new_template["name"]
    assert created["system_prompt"] == new_template["system_prompt"]
    assert created["user_prompt"] == new_template["user_prompt"]
    assert created["slots"] == new_template["slots"]
    assert created["id"] is not None
    assert created["archived"] is False

    # Test creating with model_override
    new_template_with_override = {
        "name": "New Test Template With Override",
        "system_prompt": "You are a test assistant.",
        "user_prompt": "Answer this test question: {test_question}",
        "slots": ["test_question"],
        "model_override": "test-model-override:latest"
    }
    response_with_override = client.post("/templates", json=new_template_with_override, headers=auth_headers)
    
    # Verify response with override
    assert response_with_override.status_code == 201
    created_with_override = response_with_override.json()
    assert created_with_override["name"] == new_template_with_override["name"]
    assert created_with_override["model_override"] == new_template_with_override["model_override"]
    assert created_with_override["id"] is not None
    assert created_with_override["archived"] is False

    # Test creating without override (should be None)
    new_template_no_override = {
        "name": "New Test Template No Override",
        "system_prompt": "You are another test assistant.",
        "user_prompt": "Answer this: {prompt}",
        "slots": ["prompt"]
    }
    response_no_override = client.post("/templates", json=new_template_no_override, headers=auth_headers)
    
    # Verify response without override
    assert response_no_override.status_code == 201
    created_no_override = response_no_override.json()
    assert created_no_override["name"] == new_template_no_override["name"]
    assert created_no_override["model_override"] is None
    assert created_no_override["id"] is not None


def test_update_template(client, auth_headers, test_template):
    """Test updating an existing template"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Update the template
    updated_data = {
        "name": "Updated Template Name",
        "system_prompt": "Updated system prompt",
        "user_prompt": "Updated user prompt: {question}",
        "slots": ["question"]
    }
    response = client.put(
        f"/templates/{test_template.id}", 
        json=updated_data, 
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == updated_data["name"]
    assert updated["system_prompt"] == updated_data["system_prompt"]
    assert updated["user_prompt"] == updated_data["user_prompt"]
    assert updated["slots"] == updated_data["slots"]
    assert updated["id"] == test_template.id

    # Update the template including model_override
    updated_data_with_override = {
        "name": "Updated Template Name",
        "system_prompt": "Updated system prompt",
        "user_prompt": "Updated user prompt: {question}",
        "slots": ["question"],
        "model_override": "updated-model:v2"
    }
    response_with_override = client.put(
        f"/templates/{test_template.id}", 
        json=updated_data_with_override, 
        headers=auth_headers
    )
    
    # Verify response with override
    assert response_with_override.status_code == 200
    updated_with_override = response_with_override.json()
    assert updated_with_override["name"] == updated_data_with_override["name"]
    assert updated_with_override["system_prompt"] == updated_data_with_override["system_prompt"]
    assert updated_with_override["user_prompt"] == updated_data_with_override["user_prompt"]
    assert updated_with_override["slots"] == updated_data_with_override["slots"]
    assert updated_with_override["model_override"] == updated_data_with_override["model_override"]
    assert updated_with_override["id"] == test_template.id

    # Test updating to set model_override to None
    updated_data_none_override = {
        "model_override": None
    }
    response_none_override = client.put(
        f"/templates/{test_template.id}", 
        json=updated_data_none_override, 
        headers=auth_headers
    )
    
    # Verify response with None override
    assert response_none_override.status_code == 200
    updated_none_override = response_none_override.json()
    assert updated_none_override["model_override"] is None
    assert updated_none_override["id"] == test_template.id
    # Check other fields remain unchanged from previous update
    assert updated_none_override["name"] == updated_data_with_override["name"]

    # Test updating without changing model_override (should remain None)
    updated_data_no_override_change = {
        "name": "Final Name"
    }
    response_no_override_change = client.put(
        f"/templates/{test_template.id}", 
        json=updated_data_no_override_change, 
        headers=auth_headers
    )
    
    # Verify response with no override change
    assert response_no_override_change.status_code == 200
    updated_no_override_change = response_no_override_change.json()
    assert updated_no_override_change["name"] == updated_data_no_override_change["name"]
    assert updated_no_override_change["model_override"] is None # Should still be None
    assert updated_no_override_change["id"] == test_template.id


def test_archive_template(client, auth_headers, test_template, session):
    """Test archiving a template"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Archive the template
    response = client.put(
        f"/templates/{test_template.id}/archive", 
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 204
    
    # Get templates and verify it's no longer returned (because it's archived)
    templates_response = client.get("/templates", headers=auth_headers)
    templates = templates_response.json()
    assert not any(t["id"] == test_template.id for t in templates)