import pytest
from app.api.models import Example


@pytest.fixture(name="test_examples")
def test_examples_fixture(session, test_dataset):
    """Create test examples in the database"""
    examples = []
    
    # Create a few examples
    for i in range(3):
        example = Example(
            dataset_id=test_dataset.id,
            system_prompt=f"System prompt {i}",
            variation_prompt=f"Variation prompt {i}",
            slots={"question": f"Question {i}"},
            output=f"Output for question {i}"
        )
        session.add(example)
        examples.append(example)
    
    session.commit()
    
    # Refresh examples to get IDs
    for example in examples:
        session.refresh(example)
    
    return examples


def test_get_examples(client, auth_headers, test_dataset, test_examples):
    """Test retrieving examples from a dataset"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Get examples
    response = client.get(
        f"/datasets/{test_dataset.id}/examples", 
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 3
    assert len(data["items"]) >= 3
    
    # Verify example data
    for example in test_examples:
        assert any(
            e["id"] == example.id and
            e["system_prompt"] == example.system_prompt and
            e["variation_prompt"] == example.variation_prompt and
            e["slots"] == example.slots and
            e["output"] == example.output
            for e in data["items"]
        )


def test_add_examples(client, auth_headers, test_dataset):
    """Test adding examples to a dataset"""
    # Login first
    client.post("/login", headers=auth_headers)
    
    # Create new examples
    new_examples = [
        {
            "system_prompt": "New system prompt 1",
            "variation_prompt": "New variation prompt 1",
            "slots": {"question": "New question 1"},
            "output": "New answer 1"
        },
        {
            "system_prompt": "New system prompt 2",
            "variation_prompt": "New variation prompt 2",
            "slots": {"question": "New question 2"},
            "output": "New answer 2"
        }
    ]
    
    response = client.post(
        f"/datasets/{test_dataset.id}/examples",
        json=new_examples,
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 204
    
    # Get examples to verify they were added
    get_response = client.get(
        f"/datasets/{test_dataset.id}/examples", 
        headers=auth_headers
    )
    
    data = get_response.json()
    
    # Check that our new examples are in the dataset
    for new_example in new_examples:
        assert any(
            e["system_prompt"] == new_example["system_prompt"] and
            e["variation_prompt"] == new_example["variation_prompt"] and
            e["slots"] == new_example["slots"] and
            e["output"] == new_example["output"]
            for e in data["items"]
        )