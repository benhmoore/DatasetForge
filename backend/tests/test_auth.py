import base64


def test_login_success(client, test_user):
    """Test that login succeeds with valid credentials"""
    # Create Basic auth header with correct credentials
    credentials = f"{test_user.username}:testpassword"
    encoded = base64.b64encode(credentials.encode()).decode()
    headers = {"Authorization": f"Basic {encoded}"}
    
    # Attempt login
    response = client.post("/login", headers=headers)
    
    # Verify response
    assert response.status_code == 200
    assert "Login successful" in response.text


def test_login_failure(client, test_user):
    """Test that login fails with invalid credentials"""
    # Create Basic auth header with incorrect password
    credentials = f"{test_user.username}:wrongpassword"
    encoded = base64.b64encode(credentials.encode()).decode()
    headers = {"Authorization": f"Basic {encoded}"}
    
    # Attempt login
    response = client.post("/login", headers=headers)
    
    # Verify response
    assert response.status_code == 401
    assert "Invalid credentials" in response.text


def test_user_preferences(client, auth_headers, test_user):
    """Test retrieving user preferences"""
    # Log in first to create a session
    client.post("/login", headers=auth_headers)
    
    # Get user preferences
    response = client.get("/user/preferences", headers=auth_headers)
    
    # Verify response
    assert response.status_code == 200
    preferences = response.json()
    assert preferences["name"] == test_user.name
    assert preferences["default_gen_model"] == test_user.default_gen_model
    assert preferences["default_para_model"] == test_user.default_para_model


def test_update_preferences(client, auth_headers, test_user, session):
    """Test updating user preferences"""
    # Log in first to create a session
    client.post("/login", headers=auth_headers)
    
    # Update preferences
    new_preferences = {
        "default_gen_model": "updated-model1",
        "default_para_model": "updated-model2"
    }
    response = client.put("/user/preferences", json=new_preferences, headers=auth_headers)
    
    # Verify response
    assert response.status_code == 200
    
    # Verify data was updated in the database
    updated_user = session.get(type(test_user), test_user.id)
    assert updated_user.default_gen_model == "updated-model1"
    assert updated_user.default_para_model == "updated-model2"