# Server-side Workflow Management Implementation Todo List

## Phase 1: Backend Setup

### Models & Schemas

-   [ ] Create `Workflow` model in `models.py`
    -   [ ] Include fields: id, owner_id, name, description, data, created_at, updated_at, version
    -   [ ] Set up appropriate SQLModel table configuration and constraints
-   [ ] Create schema models in `schemas.py`
    -   [ ] Implement `WorkflowBase`, `WorkflowCreate`, `WorkflowRead`, `WorkflowUpdate` classes
    -   [ ] Set up pagination schema (`WorkflowPagination`)

### API Endpoints

-   [ ] Create CRUD endpoints in `workflows.py`
    -   [ ] GET `/workflows` - List workflows with pagination
    -   [ ] GET `/workflows/{workflow_id}` - Get single workflow
    -   [ ] POST `/workflows` - Create new workflow
    -   [ ] PUT `/workflows/{workflow_id}` - Update workflow with OCC
    -   [ ] DELETE `/workflows/{workflow_id}` - Delete workflow
    -   [ ] POST `/workflows/{workflow_id}/duplicate` - Duplicate workflow

### Database & Testing

-   [ ] Ensure database schema is created when database is initialized

## Phase 2: Frontend Integration

### API Client

-   [ ] Update `apiClient.js` with workflow methods
    -   [ ] `getWorkflows` - Fetch paginated list
    -   [ ] `getWorkflowById` - Fetch single workflow
    -   [ ] `createWorkflow` - Create new workflow
    -   [ ] `updateWorkflow` - Update existing workflow
    -   [ ] `deleteWorkflow` - Delete workflow
    -   [ ] `duplicateWorkflow` - Duplicate workflow

### UI Components

-   [ ] Create `WorkflowSelector` component
    -   [ ] Implement pagination controls
    -   [ ] Add delete and duplicate functionality
    -   [ ] Handle loading and error states
-   [ ] Create `WorkflowSelectionModal` component
    -   [ ] Embed selector component
    -   [ ] Add "Create New Workflow" button
    -   [ ] Implement modal open/close logic

### Existing Component Updates

-   [ ] Update `WorkflowEditor.jsx`
    -   [ ] Create data transformation utilities (API ↔ React Flow)
    -   [ ] Replace localStorage with API calls
    -   [ ] Implement unsaved changes detection
    -   [ ] Update beforeunload prompt
-   [ ] Update `WorkflowManager.jsx` (JSON editor)
    -   [ ] Replace localStorage with API calls
    -   [ ] Add validation and error handling
-   [ ] Update `Generate.jsx`
    -   [ ] Add workflow fetching and selection
    -   [ ] Implement workflow toggle functionality
    -   [ ] Handle loading and error states

### Test Frontend Integration

ASK developer to complete these tasks and check them off:

-   [ ] Test loading workflows list
-   [ ] Test selecting a workflow
-   [ ] Test creating and saving new workflow
-   [ ] Test updating existing workflow
-   [ ] Test workflow deletion and duplication
-   [ ] Test workflow data loading in Generate component

## Phase 3: Refinement & Cleanup

### UI Polish

-   [ ] Improve loading state indicators
    -   [ ] Add spinners where appropriate
    -   [ ] Disable UI elements during operations
-   [ ] Enhance error message presentation
    -   [ ] Show toast notifications for important events
    -   [ ] Add inline error messages
-   [ ] Ensure consistent styling across components

### Code Cleanup

-   [ ] Remove all localStorage workflow-related code
-   [ ] Refactor any multi-user assumptions
-   [ ] Add appropriate comments and documentation
-   [ ] Perform code review for clarity and simplicity
