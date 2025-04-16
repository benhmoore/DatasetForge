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