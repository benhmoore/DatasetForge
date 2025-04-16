def test_get_datasets(client, auth_headers, test_dataset):
    """Test retrieving all datasets"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Get datasets
    response = client.get("/datasets", headers=auth_headers)
    
    # Verify response
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    assert any(d["id"] == test_dataset.id for d in data["items"])
    assert any(d["name"] == test_dataset.name for d in data["items"])


def test_create_dataset(client, auth_headers):
    """Test creating a new dataset"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Create a new dataset
    new_dataset = {
        "name": "New Test Dataset"
    }
    response = client.post("/datasets", json=new_dataset, headers=auth_headers)
    
    # Verify response
    assert response.status_code == 201  # Created
    created = response.json()
    assert created["name"] == new_dataset["name"]
    assert created["id"] is not None
    assert created["archived"] is False
    assert "created_at" in created


def test_archive_dataset(client, auth_headers, test_dataset):
    """Test archiving a dataset"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Archive the dataset
    response = client.put(
        f"/datasets/{test_dataset.id}/archive", 
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 204
    
    # Get datasets with include_archived=True to verify it's archived
    archived_response = client.get(
        "/datasets?include_archived=true", 
        headers=auth_headers
    )
    data = archived_response.json()
    
    # Find the test dataset in the response
    test_dataset_item = next(
        (d for d in data["items"] if d["id"] == test_dataset.id), 
        None
    )
    assert test_dataset_item is not None
    assert test_dataset_item["archived"] is True
    
    # Get datasets without archived to verify it's not returned
    non_archived_response = client.get("/datasets", headers=auth_headers)
    non_archived_data = non_archived_response.json()
    assert not any(d["id"] == test_dataset.id for d in non_archived_data["items"])