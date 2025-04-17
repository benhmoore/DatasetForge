import os
import typer
import httpx
import sys
import shutil
from typing import List, Optional
from sqlmodel import Session, select, SQLModel
from sqlalchemy.sql import func
from sqlalchemy import inspect

# Support both ways of running:
# 1. From the container's /app directory: python app/cli.py
# 2. From the app directory directly: python cli.py
try:
    # Try relative imports first (when run directly from app directory)
    from db import create_db_and_tables, engine
    from api.models import User, Dataset, Template, Example
    from core.security import get_password_hash
    from core.config import settings
except ImportError:
    # Fall back to absolute imports (when run from parent directory)
    from app.db import create_db_and_tables, engine
    from app.api.models import User, Dataset, Template, Example
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


@app.command()
def remove_user(
    username: str = typer.Option(..., prompt=True, help="Username to remove"),
    force: bool = typer.Option(
        False, "--force", "-f", help="Force deletion without confirmation"
    )
):
    """Remove a user from the database"""
    # Create DB session
    with Session(engine) as session:
        # Find the user
        user = session.exec(
            select(User).where(User.username == username)
        ).first()
        
        if not user:
            typer.echo(f"Error: User '{username}' not found")
            raise typer.Exit(code=1)
        
        # Confirm deletion
        if not force:
            confirm = typer.confirm(
                f"Are you sure you want to remove user '{username}'? This will delete ALL associated data.",
                default=False
            )
            if not confirm:
                typer.echo("Operation cancelled.")
                return
        
        # Delete user (in a real implementation, we would also remove or archive associated datasets)
        session.delete(user)
        session.commit()
        
        typer.echo(f"User '{username}' has been removed from the database.")


@app.command()
def database_stats():
    """Display statistics about the database"""
    # Create DB session
    with Session(engine) as session:
        # Count each model type
        user_count = session.exec(select(func.count()).select_from(User)).one()
        dataset_count = session.exec(select(func.count()).select_from(Dataset)).one()
        template_count = session.exec(select(func.count()).select_from(Template)).one()
        example_count = session.exec(select(func.count()).select_from(Example)).one()
        
        # Count archived items
        archived_datasets = session.exec(select(func.count()).select_from(Dataset).where(Dataset.archived == True)).one()
        archived_templates = session.exec(select(func.count()).select_from(Template).where(Template.archived == True)).one()
        
        # Count active items
        active_datasets = dataset_count - archived_datasets
        active_templates = template_count - archived_templates
        
        # Calculate averages
        examples_per_dataset = example_count / dataset_count if dataset_count > 0 else 0
        datasets_per_user = dataset_count / user_count if user_count > 0 else 0
        templates_per_user = template_count / user_count if user_count > 0 else 0
        
        # Display the statistics
        typer.echo("\nDatabase Statistics:")
        typer.echo("=" * 50)
        
        typer.echo("\nCounts:")
        typer.echo(f"  Users: {user_count}")
        typer.echo(f"  Datasets: {dataset_count} (Active: {active_datasets}, Archived: {archived_datasets})")
        typer.echo(f"  Templates: {template_count} (Active: {active_templates}, Archived: {archived_templates})")
        typer.echo(f"  Examples: {example_count}")
        
        typer.echo("\nAverages:")
        typer.echo(f"  Examples per dataset: {examples_per_dataset:.2f}")
        typer.echo(f"  Datasets per user: {datasets_per_user:.2f}")
        typer.echo(f"  Templates per user: {templates_per_user:.2f}")
        
        # Get the largest datasets
        largest_datasets_query = select(Dataset.id, Dataset.name, func.count(Example.id).label("example_count")) \
            .join(Example, Dataset.id == Example.dataset_id, isouter=True) \
            .group_by(Dataset.id) \
            .order_by(func.count(Example.id).desc()) \
            .limit(3)
        
        largest_datasets = session.exec(largest_datasets_query).all()
        
        if largest_datasets:
            typer.echo("\nLargest Datasets:")
            for i, (dataset_id, dataset_name, count) in enumerate(largest_datasets, 1):
                typer.echo(f"  {i}. {dataset_name}: {count} examples")


@app.command()
def show_examples(
    dataset_id: int = typer.Option(..., prompt=True, help="Dataset ID to view examples from"),
    limit: int = typer.Option(5, "--limit", "-l", help="Maximum number of examples to display"),
    query: str = typer.Option(None, "--query", "-q", help="Optional search term to filter examples")
):
    """Display a sample of examples from a dataset"""
    # Create DB session
    with Session(engine) as session:
        # Verify dataset exists
        dataset = session.exec(select(Dataset).where(Dataset.id == dataset_id)).first()
        if not dataset:
            typer.echo(f"Error: Dataset with ID {dataset_id} not found")
            raise typer.Exit(code=1)
        
        # Build query
        examples_query = select(Example).where(Example.dataset_id == dataset_id)
        
        # Add text search if provided
        if query:
            examples_query = examples_query.where(
                (Example.system_prompt.contains(query)) | 
                (Example.output.contains(query))
            )
        
        # Add limit and order by newest first
        examples_query = examples_query.order_by(Example.timestamp.desc()).limit(limit)
        
        # Execute query
        examples = session.exec(examples_query).all()
        
        if not examples:
            typer.echo(f"No examples found in dataset '{dataset.name}'")
            if query:
                typer.echo(f"Try removing the search query: '{query}'")
            return
        
        # Display dataset info
        typer.echo(f"\nExamples from dataset: {dataset.name} (ID: {dataset_id})")
        typer.echo("=" * 50)
        
        # Note: The application architecture supports encryption, but the current
        # implementation stores examples in plain text as noted in the API code comments
        
        # Display examples
        for i, example in enumerate(examples, 1):
            typer.echo(f"\nExample {i}:")
            typer.echo(f"  ID: {example.id}")
            typer.echo(f"  Timestamp: {example.timestamp}")
            
            # Format and display system prompt (truncate if too long)
            system_prompt = example.system_prompt
            if len(system_prompt) > 80:
                system_prompt = system_prompt[:77] + "..."
            typer.echo(f"  System: {system_prompt}")
            
            # Format and display slots
            if example.slots:
                typer.echo("  Slots:")
                for key, value in example.slots.items():
                    # Truncate slot values if too long
                    if len(value) > 60:
                        value = value[:57] + "..."
                    typer.echo(f"    {key}: {value}")
            
            # Format and display outputs (truncate if too long)
            output = example.output
            if len(output) > 100:
                output = output[:97] + "..."
            typer.echo(f"  Output: {output}")
            
            # Separator between examples
            typer.echo("-" * 50)


@app.command()
def reset_database(
    force: bool = typer.Option(
        False, "--force", "-f", help="Force reset without confirmation"
    )
):
    """
    Reset the database by dropping all tables and recreating the schema.
    WARNING: This will delete ALL data in the database!
    """
    # Ensure we're not in memory mode
    if settings.DB_PATH == ":memory:":
        typer.echo("Error: Cannot reset in-memory database")
        raise typer.Exit(code=1)
    
    # Get user confirmation unless force flag is used
    if not force:
        typer.echo("WARNING: This will permanently delete ALL data in the database!")
        typer.echo(f"Database file: {settings.DB_PATH}")
        confirm = typer.confirm(
            "Are you sure you want to reset the database?",
            default=False
        )
        if not confirm:
            typer.echo("Database reset cancelled.")
            return
        
    # Create a backup before deletion
    backup_path = f"{settings.DB_PATH}.bak"
    try:
        if os.path.exists(settings.DB_PATH):
            typer.echo(f"Creating backup at: {backup_path}")
            shutil.copy2(settings.DB_PATH, backup_path)
            typer.echo("Backup created successfully.")
    except Exception as e:
        typer.echo(f"Warning: Failed to create backup: {e}")
        if not force:
            confirm = typer.confirm(
                "Continue without backup?",
                default=False
            )
            if not confirm:
                typer.echo("Database reset cancelled.")
                return
    
    try:
        # Method 1: Drop all tables using SQLAlchemy
        typer.echo("Dropping all tables...")
        
        # First check if the database file exists
        if not os.path.exists(settings.DB_PATH):
            typer.echo("No database file found. Creating a new one.")
            create_db_and_tables()
            typer.echo("Database initialized successfully.")
            return
        
        # Drop all tables
        inspector = inspect(engine)
        
        # For SQLite, we can simply delete the file and recreate it
        typer.echo(f"Deleting database file: {settings.DB_PATH}")
        
        try:
            # Close engine connections first
            engine.dispose()
            
            # Delete the file
            if os.path.exists(settings.DB_PATH):
                os.remove(settings.DB_PATH)
            
            # Also delete any journal or WAL files that might exist
            wal_file = f"{settings.DB_PATH}-wal"
            if os.path.exists(wal_file):
                os.remove(wal_file)
            
            shm_file = f"{settings.DB_PATH}-shm"
            if os.path.exists(shm_file):
                os.remove(shm_file)
            
            journal_file = f"{settings.DB_PATH}-journal"
            if os.path.exists(journal_file):
                os.remove(journal_file)
            
            # Recreate the database
            create_db_and_tables()
            
            typer.echo("Database reset successful!")
            typer.echo("You can now recreate users with the create_user command.")
            if os.path.exists(backup_path):
                typer.echo(f"A backup was created at: {backup_path}")
                typer.echo("You can restore it using the restore_database command if needed.")
            
        except Exception as e:
            typer.echo(f"Error resetting database: {e}")
            typer.echo("The database may be in an inconsistent state.")
            raise typer.Exit(code=1)
    
    except Exception as e:
        typer.echo(f"Error: {e}")
        raise typer.Exit(code=1)


@app.command()
def restore_database(
    backup_file: str = typer.Option(
        None, "--file", "-f", help="Path to the backup file to restore. If not provided, uses the default .bak file."
    ),
    force: bool = typer.Option(
        False, "--force", "--yes", "-y", help="Force restore without confirmation"
    )
):
    """
    Restore the database from a backup file.
    """
    # Ensure we're not in memory mode
    if settings.DB_PATH == ":memory:":
        typer.echo("Error: Cannot restore in-memory database")
        raise typer.Exit(code=1)
    
    # Determine backup file path
    if not backup_file:
        backup_file = f"{settings.DB_PATH}.bak"
    
    # Check if backup file exists
    if not os.path.exists(backup_file):
        typer.echo(f"Error: Backup file not found: {backup_file}")
        raise typer.Exit(code=1)
    
    # Check if destination exists
    if os.path.exists(settings.DB_PATH):
        if not force:
            typer.echo(f"Warning: Database file already exists: {settings.DB_PATH}")
            confirm = typer.confirm(
                "This will overwrite the existing database. Continue?",
                default=False
            )
            if not confirm:
                typer.echo("Restore cancelled.")
                return
    
    try:
        # Close engine connections first
        engine.dispose()
        
        # Create a temporary backup of the current DB if it exists
        temp_backup = None
        if os.path.exists(settings.DB_PATH):
            temp_backup = f"{settings.DB_PATH}.temp"
            typer.echo(f"Creating temporary backup of current database: {temp_backup}")
            shutil.copy2(settings.DB_PATH, temp_backup)
        
        # Restore from backup
        typer.echo(f"Restoring from backup: {backup_file}")
        shutil.copy2(backup_file, settings.DB_PATH)
        
        # Clean up temporary backup
        if temp_backup and os.path.exists(temp_backup):
            os.remove(temp_backup)
        
        typer.echo("Database restored successfully!")
        
    except Exception as e:
        typer.echo(f"Error restoring database: {e}")
        
        # Try to recover from temp backup if it exists
        if temp_backup and os.path.exists(temp_backup):
            typer.echo("Attempting to recover from temporary backup...")
            try:
                shutil.copy2(temp_backup, settings.DB_PATH)
                typer.echo("Recovery successful. Database is back to its previous state.")
                os.remove(temp_backup)
            except Exception as recover_e:
                typer.echo(f"Failed to recover: {recover_e}")
                typer.echo(f"Your temporary backup is still available at: {temp_backup}")
        
        raise typer.Exit(code=1)


@app.command()
def database_status():
    """
    Show the status of the database, including file information and backup availability.
    """
    typer.echo("\nDatabase Status:")
    typer.echo("=" * 50)
    
    # File information
    typer.echo(f"\nDatabase Path: {settings.DB_PATH}")
    
    if settings.DB_PATH == ":memory:":
        typer.echo("Using in-memory database - no file status available.")
        return
    
    # Check if the database file exists
    if os.path.exists(settings.DB_PATH):
        # Get file info
        file_size = os.path.getsize(settings.DB_PATH)
        file_size_mb = file_size / (1024 * 1024)
        modified_time = os.path.getmtime(settings.DB_PATH)
        import datetime
        modified_date = datetime.datetime.fromtimestamp(modified_time).strftime('%Y-%m-%d %H:%M:%S')
        
        typer.echo(f"File Exists: Yes")
        typer.echo(f"File Size: {file_size_mb:.2f} MB")
        typer.echo(f"Last Modified: {modified_date}")
        
        # Check for backup
        backup_path = f"{settings.DB_PATH}.bak"
        if os.path.exists(backup_path):
            backup_size = os.path.getsize(backup_path)
            backup_size_mb = backup_size / (1024 * 1024)
            backup_time = os.path.getmtime(backup_path)
            backup_date = datetime.datetime.fromtimestamp(backup_time).strftime('%Y-%m-%d %H:%M:%S')
            
            typer.echo(f"\nBackup Available: Yes")
            typer.echo(f"Backup Path: {backup_path}")
            typer.echo(f"Backup Size: {backup_size_mb:.2f} MB")
            typer.echo(f"Backup Date: {backup_date}")
        else:
            typer.echo(f"\nBackup Available: No")
        
        # Check for related SQLite files
        related_files = {
            "WAL": f"{settings.DB_PATH}-wal",
            "SHM": f"{settings.DB_PATH}-shm",
            "Journal": f"{settings.DB_PATH}-journal"
        }
        
        has_related = False
        for name, path in related_files.items():
            if os.path.exists(path):
                if not has_related:
                    typer.echo(f"\nRelated SQLite Files:")
                    has_related = True
                
                file_size = os.path.getsize(path)
                file_size_kb = file_size / 1024
                typer.echo(f"- {name}: {path} ({file_size_kb:.2f} KB)")
        
        # Database integrity check
        try:
            with Session(engine) as session:
                # Try a simple query to test connection
                result = session.execute("PRAGMA integrity_check").scalar()
                if result == "ok":
                    typer.echo(f"\nDatabase Integrity: OK")
                else:
                    typer.echo(f"\nDatabase Integrity: FAILED - {result}")
        except Exception as e:
            typer.echo(f"\nDatabase Integrity: ERROR - {e}")
    else:
        typer.echo("File Exists: No")
        typer.echo("Database has not been created yet.")
        
        # Check for backup
        backup_path = f"{settings.DB_PATH}.bak"
        if os.path.exists(backup_path):
            typer.echo(f"\nBackup Available: Yes (but current database doesn't exist)")
            typer.echo(f"You can restore using: cli.py restore-database")


if __name__ == "__main__":
    # Create data directory if it doesn't exist
    os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)
    
    app()