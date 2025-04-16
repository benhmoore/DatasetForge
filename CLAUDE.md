# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Backend: `cd backend && python -m pytest` (all tests)
- Backend: `cd backend && python -m pytest tests/test_file.py` (single test file)
- Backend: `cd backend && python -m pytest tests/test_file.py::test_function` (single test)
- Frontend: `cd frontend && npm test` (all tests)
- Frontend: `cd frontend && npm run lint` (lint frontend code)

## Style Guidelines
- Backend: Use PEP 8, with Black formatting. Group imports: stdlib, third-party, local.
- Backend: Use SQLModel for database models, FastAPI for API endpoints.
- Frontend: Use functional React components with hooks.
- Naming: snake_case for Python, camelCase for JavaScript.
- Error handling: Backend uses global exception handler; frontend uses toast notifications.
- Types: Use type hints in Python, implicit React prop types in frontend.
- Database: Ensure encryption for sensitive data using the provided utilities.