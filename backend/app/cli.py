import os
import typer
import httpx
import sys
from typing import List, Optional
from sqlmodel import Session, select

# Support both ways of running:
# 1. From the container's /app directory: python app/cli.py
# 2. From the app directory directly: python cli.py
try:
    # Try relative imports first (when run directly from app directory)
    from db import create_db_and_tables, engine
    from api.models import User
    from core.security import get_password_hash
    from core.config import settings
except ImportError:
    # Fall back to absolute imports (when run from parent directory)
    from app.db import create_db_and_tables, engine
    from app.api.models import User
    from app.core.security import get_password_hash
    from app.core.config import settings

app = typer.Typer()


def get_available_models() -> List[str]:
    """Get available models from Ollama API"""
    try:
        response = httpx.get(
            f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/tags",
            timeout=settings.OLLAMA_TIMEOUT
        )
        if response.status_code == 200:
            models = [model["name"] for model in response.json().get("models", [])]
            return models
        return []
    except Exception:
        typer.echo("Warning: Couldn't connect to Ollama API to fetch models")
        return ["mistral-7b", "gemma-7b", "llama3-8b"]  # Default fallback models


@app.command()
def create_user(
    name: str = typer.Option(..., prompt=True, help="User's full name"),
    username: str = typer.Option(..., prompt=True, help="Login username"),
    password: str = typer.Option(
        ..., prompt=True, confirmation_prompt=True, hide_input=True,
        help="User password (will not be shown)"
    )
):
    """Create a new user in the database"""
    # Make sure DB and tables exist
    create_db_and_tables()
    
    # Create DB session
    with Session(engine) as session:
        # Check if username already exists
        existing_user = session.exec(
            select(User).where(User.username == username)
        ).first()
        
        if existing_user:
            typer.echo(f"Error: Username '{username}' already exists")
            raise typer.Exit(code=1)
        
        # Get available models from Ollama
        models = get_available_models()
        
        if not models:
            typer.echo("Warning: No models available. Using default values.")
            default_gen_model = "mistral-7b"
            default_para_model = "mistral-7b"
        else:
            # Display available models
            typer.echo("Available models:")
            for i, model in enumerate(models, start=1):
                typer.echo(f"{i}. {model}")
            
            # Ask user to select default models
            gen_idx = typer.prompt(
                "Select a default generation model (number)",
                type=int,
                default=1
            )
            para_idx = typer.prompt(
                "Select a default paraphrase model (number)",
                type=int,
                default=1
            )
            
            # Get the selected models (with bounds checking)
            gen_idx = max(1, min(gen_idx, len(models))) - 1
            para_idx = max(1, min(para_idx, len(models))) - 1
            
            default_gen_model = models[gen_idx]
            default_para_model = models[para_idx]
        
        # Create password hash and salt
        password_hash, salt = get_password_hash(password)
        
        # Create the user
        new_user = User(
            username=username,
            password_hash=password_hash,
            salt=salt,
            name=name,
            default_gen_model=default_gen_model,
            default_para_model=default_para_model
        )
        
        # Save to database
        session.add(new_user)
        session.commit()
        
        typer.echo(f"User '{username}' created successfully!")


@app.command()
def reset_password(
    username: str = typer.Option(..., prompt=True, help="Username"),
    password: str = typer.Option(
        ..., prompt=True, confirmation_prompt=True, hide_input=True,
        help="New password (will not be shown)"
    )
):
    """Reset a user's password"""
    # Create DB session
    with Session(engine) as session:
        # Find the user
        user = session.exec(
            select(User).where(User.username == username)
        ).first()
        
        if not user:
            typer.echo(f"Error: User '{username}' not found")
            raise typer.Exit(code=1)
        
        # Create new password hash and salt
        password_hash, salt = get_password_hash(password)
        
        # Update user
        user.password_hash = password_hash
        user.salt = salt
        session.add(user)
        session.commit()
        
        typer.echo(f"Password reset successful for user '{username}'")


@app.command()
def list_users():
    """List all users in the database"""
    # Create DB session
    with Session(engine) as session:
        # Find all users
        users = session.exec(select(User)).all()
        
        if not users:
            typer.echo("No users found in the database.")
            return
        
        typer.echo("\nUsers in the system:")
        typer.echo("=" * 40)
        for i, user in enumerate(users, 1):
            typer.echo(f"{i}. Username: {user.username}")
            typer.echo(f"   Name: {user.name}")
            typer.echo(f"   Default generation model: {user.default_gen_model}")
            typer.echo(f"   Default paraphrase model: {user.default_para_model}")
            typer.echo("-" * 40)


if __name__ == "__main__":
    # Create data directory if it doesn't exist
    os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)
    
    app()