import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session
from app.api.models import Template, Example, Dataset, User
from app.db import engine
from app.core.security import get_password_hash, active_sessions
import base64
import os
import json
from datetime import datetime, timedelta

from app.main import app

client = TestClient(app)


@pytest.fixture
def template_with_tools():
    # Create a template with tool definitions
    return {
        "name": "Weather Tool Template",
        "system_prompt": "You are a helpful assistant that can check the weather.",
        "user_prompt": "What's the weather like in {city}?",
        "slots": ["city"],
        "is_tool_calling_template": True,
        "tool_definitions": [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get the current weather in a given location",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {
                                "type": "string",
                                "description": "The city and state, e.g. San Francisco, CA"
                            },
                            "unit": {
                                "type": "string",
                                "enum": ["celsius", "fahrenheit"]
                            }
                        },
                        "required": ["location"]
                    }
                }
            }
        ]
    }


@pytest.fixture
def example_with_tool_calls():
    # Create an example with tool calls
    return {
        "system_prompt": "You are a helpful assistant that can check the weather.",
        "slots": {"city": "New York"},
        "output": "I'll check the weather for you.",
        "tool_calls": [
            {
                "id": "call_123",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": json.dumps({
                        "location": "New York, NY",
                        "unit": "celsius"
                    })
                }
            }
        ]
    }


def test_create_tool_calling_template():
    """Test creating a template with tool definitions"""
    # Create a test user
    with Session(engine) as session:
        password_hash, salt = get_password_hash("password123")
        user = User(
            username="testuser",
            password_hash=password_hash,
            salt=salt,
            name="Test User",
            default_gen_model="llama3",
            default_para_model="llama3"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        # Create a mock session
        active_sessions[user.username] = {
            "user_id": user.id,
            "valid_until": datetime.utcnow() + timedelta(minutes=30)
        }
        token = base64.b64encode(f"{user.username}:password123".encode()).decode()
    
    # Create a template with tool definitions
    response = client.post(
        "/templates/",
        json=template_with_tools(),
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["name"] == template_with_tools()["name"]
    assert data["is_tool_calling_template"] == True
    assert len(data["tool_definitions"]) == 1
    assert data["tool_definitions"][0]["function"]["name"] == "get_weather"


def test_create_and_get_example_with_tool_calls():
    """Test creating and retrieving an example with tool calls"""
    # Create a test user and dataset
    with Session(engine) as session:
        password_hash, salt = get_password_hash("password123")
        user = User(
            username="testuser2",
            password_hash=password_hash,
            salt=salt,
            name="Test User 2",
            default_gen_model="llama3",
            default_para_model="llama3"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        # Generate a random salt for the dataset
        dataset_salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        
        # Create a dataset
        dataset = Dataset(
            name="Test Dataset",
            owner_id=user.id,
            salt=dataset_salt
        )
        session.add(dataset)
        session.commit()
        session.refresh(dataset)
        
        # Create a mock session
        active_sessions[user.username] = {
            "user_id": user.id,
            "valid_until": datetime.utcnow() + timedelta(minutes=30)
        }
        token = base64.b64encode(f"{user.username}:password123".encode()).decode()
    
    # Create an example with tool calls
    response = client.post(
        f"/datasets/{dataset.id}/examples/",
        json=example_with_tool_calls(),
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    example_id = data["id"]
    
    # Get the example and verify tool calls are present
    response = client.get(
        f"/datasets/{dataset.id}/examples/{example_id}",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["system_prompt"] == example_with_tool_calls()["system_prompt"]
    assert len(data["tool_calls"]) == 1
    assert data["tool_calls"][0]["function"]["name"] == "get_weather"


def test_export_dataset_with_tool_calls():
    """Test exporting a dataset with examples that have tool calls"""
    # Create a test user and dataset
    with Session(engine) as session:
        password_hash, salt = get_password_hash("password123")
        user = User(
            username="testuser3",
            password_hash=password_hash,
            salt=salt,
            name="Test User 3",
            default_gen_model="llama3",
            default_para_model="llama3"
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        # Generate a random salt for the dataset
        dataset_salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        
        # Create a dataset
        dataset = Dataset(
            name="Test Export Dataset",
            owner_id=user.id,
            salt=dataset_salt
        )
        session.add(dataset)
        session.commit()
        session.refresh(dataset)
        
        # Add examples directly to the database
        example = Example(
            dataset_id=dataset.id,
            system_prompt=example_with_tool_calls()["system_prompt"],
            slots=example_with_tool_calls()["slots"],
            output=example_with_tool_calls()["output"],
            tool_calls=example_with_tool_calls()["tool_calls"]
        )
        session.add(example)
        session.commit()
        
        # Create a mock session
        active_sessions[user.username] = {
            "user_id": user.id,
            "valid_until": datetime.utcnow() + timedelta(minutes=30)
        }
        token = base64.b64encode(f"{user.username}:password123".encode()).decode()
    
    # Export the dataset
    response = client.get(
        f"/datasets/{dataset.id}/export?format=jsonl",
        headers={"Authorization": f"Basic {token}"}
    )
    
    assert response.status_code == 200
    content = response.content.decode('utf-8')
    
    # Parse the JSONL content
    examples = [json.loads(line) for line in content.strip().split('\n')]
    
    assert len(examples) == 1
    assert "tool_calls" in examples[0]
    assert examples[0]["tool_calls"][0]["function"]["name"] == "get_weather"


def test_tool_calls_extraction():
    """Test the extraction of tool calls from JSON responses"""
    from app.api.generate import extract_tool_calls_from_text
    
    # Test simplified format with valid JSON
    simple_text = '{"name": "get_weather", "parameters": {"location": "New York, NY", "unit": "celsius"}}'
    
    tool_calls = extract_tool_calls_from_text(simple_text)
    assert tool_calls is not None
    assert len(tool_calls) == 1
    assert tool_calls[0]["function"]["name"] == "get_weather"
    assert "New York, NY" in tool_calls[0]["function"]["arguments"]
    
    # Test OpenAI-style format with properly escaped arguments
    openai_text = '{"function_call": {"name": "get_weather", "arguments": "{\\\"location\\\":\\\"New York, NY\\\",\\\"unit\\\":\\\"celsius\\\"}"}}'
    
    tool_calls = extract_tool_calls_from_text(openai_text)
    assert tool_calls is not None
    assert len(tool_calls) == 1
    assert tool_calls[0]["function"]["name"] == "get_weather"
    assert "New York, NY" in tool_calls[0]["function"]["arguments"]