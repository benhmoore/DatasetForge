# DatasetForge Progress Tracker

## Milestone 1: Backend Core
- [x] Set up basic project structure
- [x] Implement database models & migrations
- [x] Create user authentication (HTTP Basic)
- [x] Implement rate limiting
- [x] Configure session timeout mechanism
- [x] Set up CORS middleware
- [x] Add global error handler
- [x] Implement request logging
- [x] Create CLI tools (create-user, reset-password)
- [x] Build health endpoint
- [x] Complete unit tests for core functionality

## Milestone 2: Templates & Datasets CRUD
- [x] Implement Templates API endpoints (create, read, update, archive)
- [x] Set up AES-GCM encryption helpers
- [x] Build Datasets API endpoints (create, read, update, archive)
- [x] Create system prompt history functionality
- [x] Implement Ollama integration with timeout handling
- [x] Build /generate endpoint
- [x] Build /paraphrase endpoint
- [x] Set up examples data model and API
- [x] Implement JSONL export functionality
- [x] Complete unit tests for all endpoints

## Milestone 3: Frontend Scaffolding
- [x] Set up React + Vite project with Tailwind CSS
- [x] Implement responsive layout structure
- [x] Build Login component with client-side session expiry
- [x] Create Settings modal with model preferences
- [x] Implement DatasetSelector component
- [x] Build TemplateBuilder UI (sidebar, editor, slot manager)
- [x] Implement SystemPromptEditor with history dropdown
- [x] Create JWT/auth hook and API client
- [x] Add React-Toastify for user feedback
- [x] Implement navigation and routing

## Milestone 4: Generation UI & Data Management
- [x] Build SeedForm component
- [x] Create VariationCard component with star/edit/reject actions
- [x] Implement paraphrase dropdown functionality
- [x] Build ExampleTable with TanStack Table
- [x] Add inline editing functionality (local state)
- [x] Implement bulk operations (delete, regenerate)
- [x] Create export functionality
- [x] Add pagination for example lists
- [x] Implement "Add to Dataset" action
- [x] Build Ollama timeout error handling in UI
- [x] Add UI tests for core components

## Milestone 5: Packaging & Polish
- [x] Create Docker configuration for all services
- [x] Set up docker-compose.yml
- [x] Implement CI pipeline with GitHub Actions
- [x] Configure pre-commit hooks
- [x] Add comprehensive README.md
- [x] Create .env.example with documentation
- [ ] Implement backup scripts (optional helper)
- [x] Polish UI with loading states and transitions
- [ ] Perform cross-browser testing
- [ ] Conduct final end-to-end testing

## Milestone 6: Tool-Calling Support
- [x] Add tool definitions to Template model
- [x] Add tool calls to Example model 
- [x] Update backend API to include tool calls in generation
- [x] Modify TemplateBuilder to support tool definitions
- [x] Update ExampleTable to display tool calls 
- [x] Include tool calls in dataset exports
- [x] Add comprehensive test coverage for tool-calling features
- [x] Create database migration script

## Additional Tasks & Bug Fixes
- [x] Fix frontend Docker container architecture compatibility issues