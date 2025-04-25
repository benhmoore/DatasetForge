# DatasetForge

DatasetForge is an application for generating, managing, and exporting AI training datasets.

## Key Features

-   **Template-Based Generation**: Create templates with placeholders and use them with seed data to generate examples.
-   **Seed Bank**: Manage collections of seed data for use in generation.
-   **Workflows**: Connect generation, transformation, filtering, and other steps into reusable workflows.
-   **Paraphrasing**: Create variations of examples for data augmentation.
-   **Export Options**: Export data in a variety of formats including JSONL, CSV, and custom templates.
-   **Tool Calling Support**: Generate examples with tool calls for function calling training.

## Setup

### Using Docker (Recommended)

1. Clone this repository
2. Copy `.env.example` to `.env` and configure:
    - Set `OLLAMA_HOST` to `host.docker.internal` to access Ollama running on your host machine
    - Set up default model names (`DEFAULT_GEN_MODEL`, `DEFAULT_PARA_MODEL`)
    - Set context sizes (`GEN_MODEL_CONTEXT_SIZE`, `PARA_MODEL_CONTEXT_SIZE`, `DEFAULT_CONTEXT_SIZE`)
3. Run `docker-compose up` to start the application
4. Open http://localhost:3000 in your browser

### Running Locally (Development)

#### Backend (Python API)

1. Create a virtual environment: `python -m venv dataforge_env`
2. Activate it:
    - Windows: `dataforge_env\Scripts\activate`
    - Mac/Linux: `source dataforge_env/bin/activate`
3. Install backend dependencies: `cd backend && pip install -r requirements.txt`
4. Download spaCy model: `python -m spacy download en_core_web_sm`
5. Copy `.env.example` to `.env` and configure:
    - Set `OLLAMA_HOST` to `localhost` for local Ollama
    - Set default models and context sizes
6. Start the backend: `cd backend && python -m app.main`

#### Frontend (React UI)

1. Install Node.js dependencies: `cd frontend && npm install`
2. Start the frontend development server: `cd frontend && npm run dev`
3. Open http://localhost:3000 in your browser

## Configuration

The application uses environment variables for configuration:

-   **DB_PATH**: Location of the SQLite database file
-   **OLLAMA_HOST/PORT/TIMEOUT**: Configuration for connecting to Ollama
-   **DEFAULT_GEN_MODEL**: Default model for generation (e.g., "mistral:latest")
-   **DEFAULT_PARA_MODEL**: Default model for paraphrasing (e.g., "mistral:latest")
-   **GEN_MODEL_CONTEXT_SIZE**: Context size for generation model (in tokens)
-   **PARA_MODEL_CONTEXT_SIZE**: Context size for paraphrase model (in tokens)

## CLI Commands

DatasetForge includes a command-line interface with these utilities:

-   `database_stats`: Display database statistics
-   `show_examples`: View examples from a dataset
-   `reset_database`: Reset the database (warning: deletes all data)
-   `restore_database`: Restore from a backup
-   `database_status`: Show database file information
-   `run_migration`: Update database schema when upgrading
-   `export_database`: Export the database to another location
-   `import_database`: Import a database from another location

To run these commands:

```bash
cd backend
# In development:
python -m app.cli command_name [options]
# In Docker:
docker-compose exec backend python -m app.cli command_name [options]
```

## Acknowledgments

This application builds on several open source projects:

-   FastAPI for the backend API
-   React and Vite for the frontend
-   SQLModel for database models
-   ReactFlow for workflow visualization
