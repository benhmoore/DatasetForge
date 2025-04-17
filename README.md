# DatasetForge

A personal web application for generating fine-tuning datasets. DatasetForge helps you create, manage, and export datasets for training language models.

## Overview

DatasetForge is designed as a single-user tool that helps you:

-   Create templates with slots for generating training examples
-   Design tool definitions for tool-calling models
-   Generate structured tool calls in example outputs
-   Generate variations of prompts using LLMs via Ollama
-   Edit and curate the examples before saving to datasets
-   Export datasets in standard JSONL format for fine-tuning

This project targets modern browsers only (Chrome, Firefox, Safari, Edge) and is designed for personal use.

## Prerequisites

-   Docker and Docker Compose
-   Ollama running locally with language models installed (e.g., `ollama run gemma:7b`)

## Setup

1. Clone this repository:

    ```
    git clone <repository-url>
    cd DatasetForge
    ```

2. Create an environment file:

    ```
    cp .env.example .env
    ```

    Edit the `.env` file and set a random SECRET_SALT (you can generate one with:

    ```
    python -c "import base64, os; print(base64.b64encode(os.urandom(16)).decode())"
    ```

3. Start Ollama on your local machine:

    ```
    ollama serve
    ```

4. Start the application services:

    ```
    docker compose up --build
    ```

5. Create a user by running the CLI command in the backend container:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli create-user
    ```

    Note: You must run this command in a separate terminal while the containers are running. This creates your first user account, which is required to log in.

6. Access the application at http://localhost:3000

## CLI Commands

DatasetForge includes several command-line tools to help you manage your installation:

1. Create a user:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli create-user
    ```

2. Reset a user's password:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli reset-password
    ```

3. List all users:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli list-users
    ```

4. Remove a user:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli remove-user
    ```

    Add the `--force` flag to skip the confirmation prompt.

5. View database statistics:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli database-stats
    ```

    This shows counts of users, datasets, templates, examples, and other useful metrics.

6. View examples from a dataset:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli show-examples
    ```

    You can filter and limit the results:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli show-examples --limit 10 --query "question"
    ```

7. Check database status:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli database-status
    ```

    Shows details about the database including file status, backup availability, and integrity check.

8. Reset database:

    ```
    docker exec -it datasetforge-backend-1 python -m app.cli reset-database
    ```

    Completely resets the database by dropping all tables and recreating the schema. A backup is automatically created.
    Add the `--force` flag to skip the confirmation prompt.

9. Restore database from backup:
    ```
    docker exec -it datasetforge-backend-1 python -m app.cli restore-database
    ```
    Restores from the most recent auto-backup. To specify a different backup file:
    ```
    docker exec -it datasetforge-backend-1 python -m app.cli restore-database --file /path/to/backup.db.bak
    ```
    Add the `--force` (or `--yes` / `-y`) flag to skip the confirmation prompt.

## Development

### Backend

-   Run the backend with auto-reload:
    ```
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload
    ```

### Frontend

-   Run the frontend development server:
    ```
    cd frontend
    npm install
    npm run dev
    ```

## Features

-   **Authentication**: Secure login with session timeout
-   **Templates**: Create reusable templates with customizable slots
-   **Tool Calling**: Design tool interfaces and generate structured tool calls
-   **Generation**: Use Ollama models to generate variations
-   **Datasets**: Organize examples into named datasets
-   **Export**: Export datasets in JSONL format for fine-tuning

## Architecture

-   **Backend**: FastAPI (Python) with SQLite database
-   **Frontend**: React with Tailwind CSS
-   **Containerization**: Docker Compose setup for easy deployment
    -   Backend: Python FastAPI container with host network mode to access local Ollama
    -   Frontend: Node.js container built with architecture-independent setup

## Browser Support

This application is designed to work with current versions of:

-   Chrome
-   Firefox
-   Safari
-   Edge

## Troubleshooting

### "No users exist in the system"

If you see this error when trying to log in, it means you need to create your first user. Run this command in a terminal while the containers are running:

```
docker exec -it datasetforge-backend-1 python -m app.cli create-user
```

### Database corruption or inconsistency

If you're experiencing database issues, you can use the database management commands:

1. First, check the status: `python -m app.cli database-status`
2. If needed, reset the database: `python -m app.cli reset-database`
3. After resetting, you'll need to create users again: `python -m app.cli create-user`

Remember that resetting the database will delete all data, but a backup is automatically created and can be restored if needed.

### Connection Issues with Ollama

If you're having trouble connecting to Ollama:

1. Make sure Ollama is running on your host machine with `ollama serve`
2. Verify the host.docker.internal address is correctly set in your .env file
3. For some operating systems, you may need to modify the docker-compose.yml extra_hosts setting

### Frontend can't connect to Backend

If your frontend shows proxy errors connecting to the backend:

1. Ensure both containers are running (`docker-compose ps`)
2. Check logs for any startup errors (`docker-compose logs backend`)
3. Wait a few seconds after startup for all services to initialize

## License

[MIT License](LICENSE)
