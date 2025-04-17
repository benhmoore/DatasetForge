# DatasetForge

A personal web application for generating fine-tuning datasets. DatasetForge helps you create, manage, and export datasets for training language models.

## Overview

DatasetForge is designed as a single-user tool that helps you:

- Create templates with slots for generating training examples
- Generate variations of prompts using LLMs via Ollama
- Edit and curate the examples before saving to datasets
- Export datasets in standard JSONL format for fine-tuning

This project targets modern browsers only (Chrome, Firefox, Safari, Edge) and is designed for personal use.

## Prerequisites

- Docker and Docker Compose
- Ollama running locally with language models installed (e.g., `ollama run gemma:7b`)

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
   docker-compose up --build
   ```

5. Create a user by running the CLI command in the backend container:
   ```
   docker exec -it datasetforge-backend-1 python -m app.cli create-user
   ```
   Note: You must run this command in a separate terminal while the containers are running. This creates your first user account, which is required to log in.

6. Access the application at http://localhost:3000

## Development

### Backend

- Run the backend with auto-reload:
  ```
  cd backend
  pip install -r requirements.txt
  uvicorn app.main:app --reload
  ```

### Frontend

- Run the frontend development server:
  ```
  cd frontend
  npm install
  npm run dev
  ```

## Features

- **Authentication**: Secure login with session timeout
- **Templates**: Create reusable templates with customizable slots
- **Generation**: Use Ollama models to generate variations
- **Datasets**: Organize examples into named datasets
- **Export**: Export datasets in JSONL format for fine-tuning

## Architecture

- **Backend**: FastAPI (Python) with SQLite database
- **Frontend**: React with Tailwind CSS
- **Containerization**: Docker Compose setup for easy deployment
  - Backend: Python FastAPI container with host network mode to access local Ollama
  - Frontend: Node.js container built with architecture-independent setup

## Browser Support

This application is designed to work with current versions of:
- Chrome
- Firefox
- Safari
- Edge

## Troubleshooting

### "No users exist in the system"
If you see this error when trying to log in, it means you need to create your first user. Run this command in a terminal while the containers are running:
```
docker exec -it datasetforge-backend-1 python -m app.cli create-user
```

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