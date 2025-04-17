import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.main import app
from app.api.models import User, Dataset, Example, ExportTemplate
from app.core.security import get_password_hash, active_sessions
from app.db import engine
import base64
import os
import json
from datetime import datetime, timedelta

client = TestClient(app)


@pytest.fixture
def test_user_with_dataset():
    with Session(engine) as session:
        # Create user
        password_hash, salt = get_password_hash("password123")
        user = User(
            username="testexport",
            password_hash=password_hash,
            salt=salt,
            name="Test Export",
            default_gen_model="llama3",
            default_para_model="llama3"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        # Create dataset
        dataset_salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        dataset = Dataset(
            name="Test Export Dataset",
            owner_id=user.id,
            salt=dataset_salt
        )
        session.add(dataset)
        session.commit()
        session.refresh(dataset)
        
        # Add example
        example1 = Example(
            dataset_id=dataset.id,
            system_prompt="You are a helpful assistant",
            slots={"question": "What is the weather like?"},
            output="I don't have real-time weather information, but I'd be happy to help you find weather forecasts."
        )
        
        example2 = Example(
            dataset_id=dataset.id,
            system_prompt="You are a helpful assistant",
            slots={"question": "How do I bake a cake?"},
            output="To bake a cake, you'll need ingredients like flour, sugar, eggs, and butter. Start by preheating your oven...",
            tool_calls=[{
                "function": {
                    "name": "search_recipes",
                    "arguments": json.dumps({"query": "simple cake recipe", "dietary": "none"})
                }
            }]
        )
        
        session.add(example1)
        session.add(example2)
        session.commit()
        
        # Create active session
        active_sessions[user.username] = {
            "user_id": user.id,
            "valid_until": datetime.utcnow() + timedelta(minutes=30)
        }
        token = base64.b64encode(f"{user.username}:password123".encode()).decode()
        
        yield user, dataset, token


def test_export_dataset_default_format(test_user_with_dataset):
    """Test exporting a dataset with the default format"""
    user, dataset, token = test_user_with_dataset
    
    response = client.get(
        f"/datasets/{dataset.id}/export",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/jsonl"
    assert response.headers["Content-Disposition"] == f"attachment; filename=dataset-{dataset.id}.jsonl"
    
    # Parse JSONL content
    content = response.content.decode('utf-8')
    examples = [json.loads(line) for line in content.strip().split('\n')]
    
    assert len(examples) == 2
    
    # Check structure of examples
    for example in examples:
        assert "system_prompt" in example
        assert "slots" in example
        assert "output" in example
        assert "timestamp" in example
    
    # One example should have tool_calls
    tool_calls_examples = [ex for ex in examples if "tool_calls" in ex]
    assert len(tool_calls_examples) == 1
    assert tool_calls_examples[0]["tool_calls"][0]["function"]["name"] == "search_recipes"


def test_export_dataset_with_custom_template(test_user_with_dataset):
    """Test exporting a dataset with a custom template"""
    user, dataset, token = test_user_with_dataset
    
    # First create a custom template
    custom_template = {
        "name": "Test Export Format",
        "description": "Custom format for testing",
        "format_name": "test-export",
        "template": '{"prompt": {{ system_prompt|tojson }} + "\\n" + {% for key, value in slots.items() %}{{ value|tojson }}{% endfor %}, "completion": {{ output|tojson }}}',
        "is_default": False
    }
    
    response = client.post(
        "/export_templates/",
        json=custom_template,
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 201
    template_id = response.json()["id"]
    
    # Now export using the template
    response = client.get(
        f"/datasets/{dataset.id}/export?template_id={template_id}",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/jsonl"
    assert response.headers["Content-Disposition"] == f"attachment; filename=dataset-{dataset.id}-test-export.jsonl"
    
    # Parse JSONL content
    content = response.content.decode('utf-8')
    examples = [json.loads(line) for line in content.strip().split('\n')]
    
    assert len(examples) == 2
    
    # Check structure matches our custom template
    for example in examples:
        assert "prompt" in example
        assert "completion" in example
        assert example["prompt"].startswith("You are a helpful assistant")


def test_export_with_mlx_chat_template(test_user_with_dataset):
    """Test exporting with the built-in MLX Chat template"""
    user, dataset, token = test_user_with_dataset
    
    # Find the MLX Chat template
    with Session(engine) as session:
        template = session.exec(
            select(ExportTemplate).where(ExportTemplate.format_name == "mlx-chat")
        ).first()
        
        assert template is not None
        template_id = template.id
    
    # Export using the template
    response = client.get(
        f"/datasets/{dataset.id}/export?template_id={template_id}",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    
    # Parse JSONL content
    content = response.content.decode('utf-8')
    examples = [json.loads(line) for line in content.strip().split('\n')]
    
    assert len(examples) == 2
    
    # Check MLX Chat format
    for example in examples:
        assert "messages" in example
        messages = example["messages"]
        assert len(messages) >= 3  # system + user + assistant
        assert messages[0]["role"] == "system"
        assert any(msg["role"] == "user" for msg in messages)
        assert any(msg["role"] == "assistant" for msg in messages)


def test_export_with_tool_calling_template(test_user_with_dataset):
    """Test exporting with the built-in tool calling template"""
    user, dataset, token = test_user_with_dataset
    
    # Find the tool calling template
    with Session(engine) as session:
        template = session.exec(
            select(ExportTemplate).where(ExportTemplate.format_name == "tool-calling")
        ).first()
        
        assert template is not None
        template_id = template.id
    
    # Export using the template
    response = client.get(
        f"/datasets/{dataset.id}/export?template_id={template_id}",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    
    # Parse JSONL content
    content = response.content.decode('utf-8')
    examples = [json.loads(line) for line in content.strip().split('\n')]
    
    assert len(examples) == 2
    
    # Find the example with tool calls
    tool_example = next((ex for ex in examples if any(msg.get("tool_calls") for msg in ex["messages"])), None)
    assert tool_example is not None
    
    # Find the assistant message with tool calls
    assistant_msg = next((msg for msg in tool_example["messages"] if msg["role"] == "assistant"), None)
    assert assistant_msg is not None
    assert "tool_calls" in assistant_msg
    assert len(assistant_msg["tool_calls"]) == 1
    assert assistant_msg["tool_calls"][0]["function"]["name"] == "search_recipes"