# Implementation Guide & UI Specification

This comprehensive guide covers everything needed to build a personal, single-user web app for generating fine-tuning datasets.

## 1. Project Context & Philosophy

- **Nature**
  - Personal tool, single user
  - Future open-source, but no enterprise SLAs or legacy-browser support

- **Goals**
  - Fast iteration, minimal dependencies, modern tech only, clear code

- **Browser Support**
  - Only current versions of Chrome, Firefox, Safari, and Edge

- **Backup & Recovery**
  - Not provided. To keep complexity low and match personal-project scope
  - No automated backup or recovery process
  - Users should back up the data/ folder externally if desired

## 2. High-Level Architecture

- **Backend**
  - FastAPI (Python 3.10+)
  - SQLite + SQLModel + Alembic
  - Typer CLI for user creation & password reset
  - AES-GCM encryption (cryptography)
  - HTTP Basic auth + rate-limiting + session timeout
  - CORS, global error handler, request logging
  - Configurable Ollama API timeouts

- **Frontend**
  - React + Vite.js
  - Tailwind CSS (mobile-first, responsive)
  - React Query + Axios
  - TanStack Table, React-Toastify
  - Client-side session expiry logic

- **Containerization**
  - Docker Compose for Ollama, backend, frontend

- **CI/CD**
  - GitHub Actions: lint, type-check, tests, builds

## 3. Project Layout

```
root/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ api/
│  │  │  ├─ auth.py
│  │  │  ├─ health.py
│  │  │  ├─ models.py
│  │  │  ├─ schemas.py
│  │  │  ├─ templates.py
│  │  │  ├─ datasets.py
│  │  │  ├─ generate.py
│  │  │  └─ paraphrase.py
│  │  ├─ core/
│  │  │  ├─ config.py
│  │  │  ├─ security.py
│  │  │  ├─ encryption.py
│  │  │  └─ logging.py
│  │  ├─ db.py
│  │  ├─ cli.py           # includes create-user & reset-password
│  │  └─ migrations/
│  ├─ tests/
│  ├─ requirements.txt
│  └─ Dockerfile
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ api/
│  │  ├─ App.jsx
│  │  └─ main.jsx
│  ├─ public/
│  ├─ package.json
│  └─ vite.config.js
├─ .env.example
├─ docker-compose.yml
├─ .github/
│  └─ workflows/ci.yml
├─ .pre-commit-config.yaml
└─ README.md
```

## 4. Configuration & Environment

### 4.1 .env.example

```
# SQLite DB file
DB_PATH=./data/app.db

# Base64-encoded salt for key derivation
SECRET_SALT=<BASE64_RANDOM>

# Ollama config
OLLAMA_HOST=localhost
OLLAMA_PORT=11434
OLLAMA_TIMEOUT=30       # seconds

# Frontend URL for CORS
CORS_ORIGINS=http://localhost:3000

# Login rate-limit (attempts per minute)
LOGIN_RATE_LIMIT=5

# Session timeout (minutes)
SESSION_TIMEOUT=30
```

### 4.2 backend/app/core/config.py

```python
from pydantic import BaseSettings

class Settings(BaseSettings):
    DB_PATH: str
    SECRET_SALT: str
    OLLAMA_HOST: str
    OLLAMA_PORT: int
    OLLAMA_TIMEOUT: int
    CORS_ORIGINS: list[str]
    LOGIN_RATE_LIMIT: int = 5
    SESSION_TIMEOUT: int = 30  # minutes

    class Config:
        env_file = ".env"

settings = Settings()
```

## 5. Backend Design

### 5.1 Models (api/models.py)

```python
from sqlmodel import SQLModel, Field, JSON
from datetime import datetime

class User(SQLModel, table=True):
    id: int = Field(primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    salt: str
    name: str
    default_gen_model: str
    default_para_model: str

class Template(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name: str
    system_prompt: str
    user_prompt: str
    slots: list[str] = Field(sa_column=JSON)
    archived: bool = False

class Dataset(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name: str
    owner_id: int = Field(foreign_key="user.id")
    archived: bool = False
    created_at: datetime
    salt: str  # base64 salt for AES-GCM

class Example(SQLModel, table=True):
    id: int = Field(primary_key=True)
    dataset_id: int = Field(foreign_key="dataset.id")
    system_prompt: str
    variation_prompt: str
    slots: dict = Field(sa_column=JSON)
    output: str
    timestamp: datetime
```

### 5.2 Security, Encryption & Key Rotation

- **Key Derivation**
  - PBKDF2HMAC (password + user.salt + SECRET_SALT) → AES key

- **AES-GCM**
  - Helpers encrypt/decrypt with per-dataset salt and IV

- **Key Rotation Strategy**
  - Rotate SECRET_SALT in .env: all new datasets use the new key
  - Existing datasets remain decryptable with old salt stored per dataset
  - To re-encrypt old data, run a one-off script: decrypt with old key + re-encrypt with new key

### 5.3 Auth, Rate-Limiting & Session Timeout

- **/login**
  - HTTP Basic auth
  - Rate-limit: LOGIN_RATE_LIMIT attempts/minute → 429 on excess
  - On success: derive AES key, issue a server-side session token with TTL = SESSION_TIMEOUT minutes

- **Session Management**
  - Session stored in memory cache with expiration
  - Dependency on protected endpoints checks session validity
  - Expired session → 401 → frontend forces re-login

### 5.4 CORS, Logging, Global Errors

- **CORS Middleware**
  - Allow CORS_ORIGINS

- **Logging**
  - Uvicorn + middleware logging method, path, status

- **Exceptions**
  - Global handler returns { detail: "message" }

### 5.5 CLI (cli.py)

- **create-user**: name, username, password, select default models
- **reset-password**: prompt for username, new password → update hash+salt
- Persists to SQLite; creates dataset folder

### 5.6 Ollama API Timeouts

- Use httpx with timeout=settings.OLLAMA_TIMEOUT
- On timeout, catch httpx.ReadTimeout → return 504 { detail: "Ollama API timed out" }

### 5.7 API Endpoints

| Path | Method | Purpose | Request & Response |
|------|--------|---------|-------------------|
| /health | GET | Liveness probe | { "status": "ok" } |
| /login | POST | Authenticate + derive key | Basic Auth header → 200 / 401 / 429 |
| /models | GET | List Ollama models | ["gemma3-base","vicuna-13b",...] |
| /user/preferences | GET | Get user name & default models | { name, default_gen_model, default_para_model } |
| /user/preferences | PUT | Update default models | { default_gen_model, default_para_model } → 204 |
| /templates | GET | List non-archived templates | [{ id,name,system_prompt,user_prompt,slots }] |
| /templates | POST | Create template | { name,system_prompt,user_prompt,slots,is_tool_calling_template,tool_definitions } → { id,... } |
| /templates/{id} | PUT | Update template | same as POST → 204 |
| /templates/{id}/archive | PUT | Archive template | 204 |
| /templates/{id}/history | GET | Recent system_prompts (last 10, deduped) | ["...", "..."] |
| /paraphrase | POST | Generate paraphrases | { text,count } → ["para1","para2",...] |
| /generate | POST | Generate outputs | { template_id,slots,count } → [{ variation,output,tool_calls }] |
| /datasets | GET | List non-archived datasets (optional pagination) | ?page&size → { items:[...],total } |
| /datasets | POST | Create new dataset | { name } → { id,name,created_at } |
| /datasets/{id}/archive | PUT | Archive dataset | 204 |
| /datasets/{id}/examples | GET | Get examples (paginated) | ?page&size → { items:Example[], total } |
| /datasets/{id}/examples | POST | Append starred examples (explicit save action) | [ExampleInput] → 204 |
| /datasets/{id}/export | GET | Stream JSONL export | Lines of {"system_prompt",...,"tool_calls":[...]} |

**Note**: Examples are saved only when the user clicks "Add to Dataset". Inline edits in the table are local until that action.

**Error Codes**:
- 401 Unauthorized
- 429 Too Many Requests
- 504 Gateway Timeout for Ollama
- 400 Bad Request / 500 Server Error

## 6. Frontend Design & User Flows

### 6.1 Login

- **Component**: `<Login>`
- **Flow**:
  1. User enters credentials → POST /login
  2. On 200: store sessionStorage.auth & sessionStorage.loginAt = now(), redirect to /app
  3. On 401: toast "Invalid credentials"
  4. On 429: toast "Too many attempts. Wait a minute."
  5. Client-side: on each route change, check (now() - loginAt) < SESSION_TIMEOUT. Else clear auth & redirect.

### 6.2 Global Layout

- **Header**:
  - `<DatasetSelector>`
  - `<SettingsModal>` trigger
  - `<LogoutButton>`
- **Main**: Toggle between Template Builder and Generate & Edit views
- **Responsive** via Tailwind: use flex, grid, breakpoints (sm:, md:, lg:)

### 6.3 Settings

- **Component**: `<SettingsModal>`
- **Controls**: Dropdowns from /models, Save → PUT /user/preferences, toast

### 6.4 Template Builder

- **Component**: `<TemplateBuilder>`
- **Sidebar**: Templates list, New/Rename/Archive
- **Editor**:
  - `<SystemPromptEditor>` (collapsed; explicit save, history)
  - `<TemplateEditor>` code & Insert Slot
  - `<SlotManager>`
  - `<ToolDefinitionManager>` for tool-calling templates
  - Tool-calling template toggle
  - Preview with dummy values
  - Save Template → POST/PUT → toast

### 6.5 Generate & Audition

- **Components**: `<SeedForm>`, `<VariationCard>`
- **Flow**:
  1. Fill slot fields + "Batch Size" (default 3)
  2. Generate → POST /generate
  3. Show 3 cards: variation dropdown, output, ⭐ star, ✎ edit, ✗ reject→regenerate
  4. Starred cards → Add to Dataset → POST /datasets/{id}/examples → toast → clear cards
  5. Timeout Handling: if Ollama times out → show error toast in card

### 6.6 Example Table

- **Component**: `<ExampleTable>`
- **Features**:
  - Columns: dynamic slots + output + tool calls (if present)
  - Inline edits (local)
  - Bulk delete/regenerate
  - Tool call display in detailed view
  - Pagination controls if total > page size

### 6.7 Dataset Selector

- **Component**: `<DatasetSelector>`
- **Options**:
  - New Dataset → GET name → POST /datasets
  - Load → GET /datasets
  - Archive/Unarchive → PUT /datasets/{id}/archive
  - Show Archived toggle

### 6.8 Export Templates & Export

- **Components**: 
  - `<ExportDialog>` - Modal with template selection and export options
  - `<ExportTemplateManager>` - Interface for creating and editing export templates

- **Features**:
  - Configurable export formats with templates 
  - Built-in templates for common formats: MLX Chat, MLX Instruct, OpenAI ChatML, Llama/Mistral, Tool Calling
  - Custom template creation with Jinja2 syntax
  - Template categorization and filtering
  - Format-specific export filenames

- **Actions**:
  - GET /datasets/{id}/export?template_id={id} → download formatted JSONL
  - GET /export_templates/ → List available templates
  - POST/PUT/DELETE operations for template management

**Default Export Formats**:
- **MLX Chat**: Chat format for MLX fine-tuning
  ```json
  {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
  ```

- **MLX Instruct**: Instruction format for MLX fine-tuning
  ```json
  {"instruction": "...", "input": "...", "output": "..."}
  ```

- **OpenAI ChatML**: Format for OpenAI chat fine-tuning
  ```json
  {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
  ```

- **Llama/Mistral**: Format for Llama and Mistral models
  ```
  <s>[INST] System prompt\n\nUser input [/INST] Assistant response</s>
  ```

- **Tool Calling**: Format with function/tool calling
  ```json
  {"messages": [...], "tool_calls": [{"function": {"name": "tool_name", "arguments": "{\"param1\":\"value1\",\"param2\":\"value2\"}"}}]}
  ```

- **Raw**: Default format with all fields
  ```json
  {"system_prompt": "...", "slots": {"input": "..."}, "output": "...", "tool_calls": [...], "timestamp": "..."}
  ```

### 6.9 System Prompt History

- In: `<SystemPromptEditor>`
- Feature: Dropdown populated by GET /templates/{id}/history

### 6.10 Logout

- **Component**: `<LogoutButton>`
- **Action**: sessionStorage.removeItem("auth"), redirect to /login

## 7. Containerization

```yaml
version: "3.8"
services:
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: ["./ollama-models:/root/.ollama/models"]

  backend:
    build: ./backend
    env_file: .env
    ports: ["8000:8000"]
    depends_on: ["ollama"]
    volumes: ["./data:/app/data"]

  frontend:
    image: node:18
    working_dir: /app
    volumes: ["./frontend:/app"]
    command: ["npm","run","dev"]
    ports: ["3000:3000"]
    depends_on: ["backend"]
```

## 8. CI/CD & Testing

### 8.1 CI (.github/workflows/ci.yml)

```yaml
name: CI
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with: python-version: "3.10"
      - run: pip install -r backend/requirements.txt alembic
      - run: flake8 backend/app
      - run: mypy backend/app
      - run: pytest backend/tests

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: node-version: "18"
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run build
```

### 8.2 Pre-commit (.pre-commit-config.yaml)

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.0.1
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
  - repo: https://github.com/psf/black
    rev: 23.9.1
    hooks:
      - id: black
  - repo: https://github.com/pre-commit/mirrors-isort
    rev: v5.12.0
    hooks:
      - id: isort
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
```

### 8.3 Testing Strategy

- **Backend**
  - FastAPI TestClient + in-memory SQLite
  - Rate-limit edge cases
  - Session expiry
  - Encryption round-trip tests
  - Ollama timeout handling
  - CLI tests (Typer CliRunner)
- **Frontend**
  - MSW for API hooks
  - Component smoke & snapshot tests
  - Session timeout
  - Responsive behavior

## 9. Documentation

**README.md**
1. Overview (personal project, modern browsers only)
2. Prerequisites: Docker, Ollama
3. Setup
```
cp .env.example .env
docker-compose up --build
# then:
python backend/cli.py create-user
```
4. Development
   - Backend: uvicorn app.main:app --reload
   - Frontend: npm run dev
5. Testing & Linting
   - Backend: pytest, flake8, mypy
   - Frontend: npm test, npm run lint
6. Endpoint Reference
7. Browser Support
8. Contribution Guide

## 10. Milestones

1. **First Stage**: Backend core (models, auth+rate-limit, CLI, health, CORS, logging)
2. **Second Stage**: Templates & Datasets CRUD + encryption + /paraphrase & /generate
3. **Third Stage**: Frontend scaffolding (Login, Settings, DatasetSelector, TemplateBuilder)
4. **Fourth Stage**: Generation UI, VariationCard, ExampleTable, Export, Logout
5. **Fifth Stage**: Containerization, CI, pre-commit, README polish
6. **Sixth Stage**: Tool-calling support for LLM fine-tuning datasets
   - Database model extensions for tool definitions and calls
   - Migration script to add new columns
   - Enhanced template builder UI for tool definitions
   - Improved generation endpoint for tool-calling support
   - Robust tool call extraction from LLM responses
   - Tool call display in UI for variations and examples
   - JSONL export format updated for tool calls