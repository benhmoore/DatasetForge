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
- Ollama with language models installed

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

3. Start the services:
   ```
   docker-compose up --build
   ```

4. Create a user:
   ```
   python backend/app/cli.py create-user
   ```

5. Access the application at http://localhost:3000

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

## Browser Support

This application is designed to work with current versions of:
- Chrome
- Firefox
- Safari
- Edge

## License

[MIT License](LICENSE)