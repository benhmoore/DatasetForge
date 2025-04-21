````markdown
# Server-side Workflow Management Implementation Guide (Revised for Local, Single-User)

**Project Context and Guidance:**

-   **Target Environment:** This is a personal project. The application (server and client) will run locally on the user's machine, packaged within a Docker container.
-   **User Scope:** The system is designed for a **single user** interacting with their own data at any given time. While a basic user account system exists for identification (`owner_id`), there is **no requirement for multi-user collaboration, complex permissions, or handling simultaneous edits from different users.**
-   **Operational Concerns:** Extensive security hardening, backups, and complex deployment strategies are **not** required due to the local, personal nature of the application. Focus on core functionality.
-   **LLM Programmer Note:** Please adhere strictly to this plan. **Avoid adding features or complexity** beyond what is specified (e.g., advanced role-based access, real-time collaboration features, intricate error reporting). Prioritize a clean, functional implementation suitable for a local, single-user application.

**IMPORTANT:** This implementation does not migrate existing data from localStorage. The database will be wiped entirely, and the user will need to recreate their workflows in the new system.

---

## 1. Backend Implementation

### 1.1 Add Workflow Model in `models.py`

```python
# models.py
from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint, String, Text
from sqlalchemy.sql import func
from sqlmodel import SQLModel, Field, JSON # Use SQLModel's JSON for simplicity across DBs
from typing import Optional, Dict, Any
from datetime import datetime, timezone

# Use SQLModel's JSON type for broader compatibility in a local setup (SQLite/Postgres)
JsonType = JSON

class Workflow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # owner_id: Identifies the user this workflow belongs to within the local DB.
    # Ensures data isolation if multiple (rare) local user profiles were ever used.
    owner_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    name: str = Field(sa_column=Column(String(100), nullable=False)) # Max length added
    description: Optional[str] = Field(default=None, sa_column=Column(Text)) # Use Text for potentially longer descriptions
    # data: Stores the entire workflow structure (nodes, connections) as JSON.
    data: Dict[str, Any] = Field(sa_column=Column(JsonType), default={}) # Provide default
    # created_at/updated_at: Track modification times using UTC.
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )
    # version: For Optimistic Concurrency Control (OCC).
    # Helps prevent accidental self-overwrites if the user interacts rapidly
    # or has multiple tabs open on the same workflow locally.
    version: int = Field(default=1, sa_column=Column(Integer, nullable=False))

    # __table_args__: Ensures a user cannot have two workflows with the same name locally.
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_owner_name"),)
```
````

### 1.2 Add Schema Models in `schemas.py`

```python
# schemas.py
import json
from pydantic import BaseModel, validator, constr
from typing import Optional, Dict, Any, List
from datetime import datetime

# Define a reasonable size limit for local storage (e.g., 10MB)
MAX_WORKFLOW_SIZE_BYTES = 10 * 1024 * 1024 # 10MB

# Shared validator function
def validate_data_size(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if data is None:
        return data
    try:
        data_json = json.dumps(data)
        # Check byte size for a more accurate limit assessment
        if len(data_json.encode('utf-8')) > MAX_WORKFLOW_SIZE_BYTES:
            raise ValueError(f"Workflow data exceeds size limit: {len(data_json.encode('utf-8')) / (1024*1024):.1f}MB (max: {MAX_WORKFLOW_SIZE_BYTES / (1024*1024):.0f}MB)")
    except TypeError as e:
        # Catch errors if data is not JSON serializable
        raise ValueError(f"Invalid data format: {e}")
    return data

class WorkflowBase(BaseModel):
    name: constr(min_length=1, max_length=100)
    description: Optional[constr(max_length=1000)] = None # Increased limit slightly
    data: Dict[str, Any]

    # Apply the validator to the 'data' field
    _validate_size = validator('data', allow_reuse=True)(validate_data_size)

class WorkflowCreate(WorkflowBase):
    pass # Inherits fields and validation from WorkflowBase

class WorkflowRead(WorkflowBase):
    id: int
    owner_id: int # Included for completeness, though primarily for the single user context
    created_at: datetime
    updated_at: datetime
    version: int

class WorkflowUpdate(BaseModel):
    # All fields are optional for updates
    name: Optional[constr(min_length=1, max_length=100)] = None
    description: Optional[constr(max_length=1000)] = None
    data: Optional[Dict[str, Any]] = None

    # Apply the same validator to the 'data' field on update
    _validate_size = validator('data', allow_reuse=True)(validate_data_size)

class WorkflowPagination(BaseModel):
    items: List[WorkflowRead]
    total: int

```

### 1.3 Add CRUD Endpoints in `workflows.py`

_(Note: Authentication `Depends(get_current_user)` and session `Depends(get_session)` are assumed to be set up correctly for the local user context)._

```python
# workflows.py
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select, func, update # Import update statement
from typing import List
# Assume User model and dependency functions exist from your project setup
from ..models.user import User
from ..models.workflow import Workflow # Adjust import path as needed
from ..schemas.workflow import WorkflowCreate, WorkflowRead, WorkflowUpdate, WorkflowPagination
from ..dependencies import get_session, get_current_user # Adjust import path

router = APIRouter()

# GET all workflows for the current local user
@router.get("/workflows", response_model=WorkflowPagination)
async def get_workflows(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(50, ge=1, le=100, description="Items per page"), # Default 50, max 100
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all workflows owned by the current user (paginated)."""
    # Base query filtered by the current user
    query = select(Workflow).where(Workflow.owner_id == user.id).order_by(Workflow.updated_at.desc())

    # Efficient count for pagination total
    total_query = select(func.count()).select_from(Workflow).where(Workflow.owner_id == user.id)
    total = session.exec(total_query).scalar_one_or_none() or 0 # Handle case with no workflows

    # Apply pagination limits
    query = query.offset((page - 1) * size).limit(size)

    # Execute query
    workflows = session.exec(query).all()

    return {"items": workflows, "total": total}

# GET a specific workflow
@router.get("/workflows/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    workflow_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get a specific workflow by ID."""
    workflow = session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    # Basic check ensuring the workflow belongs to the current user context
    if workflow.owner_id != user.id:
        # This shouldn't happen in a correct single-user setup but provides safety
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return workflow

# CREATE a new workflow
@router.post("/workflows", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate, # Renamed variable for clarity
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create a new workflow."""
    # Check for duplicate name for this user before creating
    existing_query = select(Workflow).where(Workflow.owner_id == user.id).where(Workflow.name == workflow_data.name)
    existing = session.exec(existing_query).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workflow with name '{workflow_data.name}' already exists."
        )

    # Create workflow instance (timestamps/version handled by model defaults)
    db_workflow = Workflow(
        owner_id=user.id,
        name=workflow_data.name,
        description=workflow_data.description,
        data=workflow_data.data
        # version defaults to 1
    )
    session.add(db_workflow)
    try:
        session.commit()
        session.refresh(db_workflow) # Load DB-generated values like ID, timestamps
        return db_workflow
    except Exception as e: # Catch potential DB errors during commit
        session.rollback()
        # Log the error server-side if possible
        print(f"Error creating workflow: {e}") # Basic logging for local context
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create workflow due to a server error."
        )


# UPDATE an existing workflow
@router.put("/workflows/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    workflow_id: int,
    workflow_update_data: WorkflowUpdate, # Renamed variable
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update an existing workflow using Optimistic Concurrency Control."""
    # Retrieve the existing workflow
    db_workflow = session.get(Workflow, workflow_id)
    if not db_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if db_workflow.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Check for name uniqueness if name is being updated to a new value
    if workflow_update_data.name and workflow_update_data.name != db_workflow.name:
        existing_query = select(Workflow).where(
            Workflow.owner_id == user.id,
            Workflow.name == workflow_update_data.name,
            Workflow.id != workflow_id # Exclude the current workflow being updated
        )
        existing = session.exec(existing_query).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Workflow with name '{workflow_update_data.name}' already exists."
            )

    # --- Optimistic Locking ---
    current_version = db_workflow.version
    # Get only the fields that were actually provided in the update request
    update_dict = workflow_update_data.dict(exclude_unset=True)

    # If no fields were provided in the request, return the current object
    if not update_dict:
         return db_workflow # Or raise 400 Bad Request if preferred

    try:
        # Atomically update the workflow in the database *only if* the version matches
        stmt = (
            update(Workflow)
            .where(Workflow.id == workflow_id)
            .where(Workflow.version == current_version) # Optimistic Concurrency Check
            .values(
                **update_dict, # Apply provided updates
                version=current_version + 1 # Increment version number
                # updated_at is handled by the database's onupdate trigger
            )
        )
        result = session.exec(stmt) # Execute the update statement

        # Check if any row was actually updated
        if result.rowcount == 0:
            # If rowcount is 0, it means the version didn't match (or workflow was deleted concurrently)
            session.rollback() # Rollback the transaction
            # Check if the workflow still exists to give a more specific error
            check_exists = session.get(Workflow, workflow_id)
            if not check_exists or check_exists.owner_id != user.id:
                 # Workflow was deleted or ownership changed (unlikely in single-user)
                 raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found or access denied.")
            else:
                 # The workflow exists, so the version must have mismatched (OCC conflict)
                 raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Workflow was modified elsewhere. Please refresh and try again."
                 )

        # Commit the transaction if the update was successful (rowcount > 0)
        session.commit()
        # Refresh the object to get the updated fields (like new version, updated_at) from the DB
        session.refresh(db_workflow)
        return db_workflow

    except Exception as e:
        session.rollback()
        # Log the error server-side if possible
        print(f"Error updating workflow {workflow_id}: {e}") # Basic logging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not update workflow due to a server error."
        )

# DELETE a workflow
@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a workflow."""
    db_workflow = session.get(Workflow, workflow_id)
    if not db_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if db_workflow.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    session.delete(db_workflow)
    try:
        session.commit()
    except Exception as e: # Catch potential DB errors during commit
        session.rollback()
        print(f"Error deleting workflow {workflow_id}: {e}") # Basic logging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete workflow due to a server error."
        )

    # Return an explicit Response object for 204 status code
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# DUPLICATE a workflow
@router.post("/workflows/{workflow_id}/duplicate", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def duplicate_workflow(
    workflow_id: int,
    response: Response, # Inject Response object to set headers
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create a duplicate of an existing workflow."""
    # Find the workflow to duplicate
    source_workflow = session.get(Workflow, workflow_id)
    if not source_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if source_workflow.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Find a unique name for the copy (e.g., "My Workflow (Copy)", "My Workflow (Copy 2)")
    base_name = source_workflow.name
    copy_name = f"{base_name} (Copy)"
    copy_index = 1
    while True:
        name_check_query = select(Workflow).where(Workflow.owner_id == user.id).where(Workflow.name == copy_name)
        existing = session.exec(name_check_query).first()
        if not existing:
            break # Found a unique name
        copy_index += 1
        copy_name = f"{base_name} (Copy {copy_index})"

    # Create the new workflow instance with copied data
    new_workflow = Workflow(
        owner_id=user.id,
        name=copy_name,
        description=source_workflow.description,
        data=source_workflow.data # Deep copy should be handled by JSON type if needed, usually fine for dict/list
        # Timestamps and version=1 will be set by database defaults/model defaults
    )

    session.add(new_workflow)
    try:
        session.commit()
        session.refresh(new_workflow) # Get the generated ID, timestamps, version

        # Set the Location header in the HTTP response
        response.headers["Location"] = f"/workflows/{new_workflow.id}" # Use router path format

        return new_workflow
    except Exception as e:
        session.rollback()
        print(f"Error duplicating workflow {workflow_id}: {e}") # Basic logging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not duplicate workflow due to a server error."
        )

```

---

## 2. Frontend API Client Updates

### 2.1 Update `apiClient.js` with new workflow endpoints

_(Assumes `apiClient` is an Axios instance or similar, configured for the local server base URL and potentially handling basic error formatting)._

```javascript
// apiClient.js (or similar)

// Assuming 'apiClient' is your pre-configured Axios instance
const api = {
    // ... potentially other existing API methods ...

    /**
     * Fetches a paginated list of workflows for the current user.
     * @param {number} page - Page number (default: 1)
     * @param {number} size - Items per page (default: 50)
     * @returns {Promise<object>} Pagination object { items: [], total: 0 }
     */
    getWorkflows: (page = 1, size = 50) =>
        apiClient
            .get("/workflows", { params: { page, size } })
            .then((response) => response.data)
            // Add basic catch block for logging; specific handling should be in components
            .catch((error) => {
                console.error(
                    "API Error fetching workflows:",
                    error.response?.data || error.message
                );
                throw error; // Re-throw for component-level handling
            }),

    /**
     * Fetches a single workflow by its ID.
     * @param {number} id - The workflow ID.
     * @returns {Promise<object>} The workflow object.
     */
    getWorkflowById: (id) =>
        apiClient
            .get(`/workflows/${id}`)
            .then((response) => response.data)
            .catch((error) => {
                console.error(
                    `API Error fetching workflow ${id}:`,
                    error.response?.data || error.message
                );
                throw error;
            }),

    /**
     * Creates a new workflow.
     * @param {object} workflow - Workflow data matching WorkflowCreate schema.
     * @returns {Promise<object>} The created workflow object (with id, timestamps, version).
     */
    createWorkflow: (workflow) =>
        apiClient
            .post("/workflows", workflow)
            .then((response) => response.data)
            .catch((error) => {
                console.error(
                    "API Error creating workflow:",
                    error.response?.data || error.message
                );
                throw error;
            }),

    /**
     * Updates an existing workflow.
     * @param {number} id - The workflow ID.
     * @param {object} workflow - Workflow data matching WorkflowUpdate schema.
     * @returns {Promise<object>} The updated workflow object.
     */
    updateWorkflow: (id, workflow) =>
        apiClient
            .put(`/workflows/${id}`, workflow)
            .then((response) => response.data)
            .catch((error) => {
                // Log specific conflict errors, but primary handling is in the component
                if (error.response?.status === 409) {
                    console.warn(
                        `API Conflict updating workflow ${id}:`,
                        error.response.data
                    );
                } else {
                    console.error(
                        `API Error updating workflow ${id}:`,
                        error.response?.data || error.message
                    );
                }
                throw error;
            }),

    /**
     * Deletes a workflow by its ID.
     * @param {number} id - The workflow ID.
     * @returns {Promise<void>} Resolves on success (usually 204 No Content).
     */
    deleteWorkflow: (id) =>
        apiClient
            .delete(`/workflows/${id}`)
            .then((response) => response.data) // DELETE often returns 204 No Content, data might be null/undefined
            .catch((error) => {
                console.error(
                    `API Error deleting workflow ${id}:`,
                    error.response?.data || error.message
                );
                throw error;
            }),

    /**
     * Duplicates an existing workflow.
     * @param {number} id - The ID of the workflow to duplicate.
     * @returns {Promise<object>} The newly created duplicate workflow object.
     */
    duplicateWorkflow: (id) =>
        apiClient
            .post(`/workflows/${id}/duplicate`)
            .then((response) => response.data)
            .catch((error) => {
                console.error(
                    `API Error duplicating workflow ${id}:`,
                    error.response?.data || error.message
                );
                throw error;
            }),
};

export default api; // Export the API object
```

---

## 3. UI Components

### 3.1 Create WorkflowSelector Component

```jsx
// WorkflowSelector.jsx
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify"; // Assuming react-toastify for notifications
import Icon from "./Icons"; // Assuming an Icon component exists
import api from "../api/apiClient"; // Adjust import path

// Define items per page consistent with backend default/max
const ITEMS_PER_PAGE = 50;

function WorkflowSelector({ onSelect, currentWorkflowId }) {
    const [workflows, setWorkflows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState(null); // State to hold fetch errors

    // Memoized function to fetch workflows for a specific page
    const fetchWorkflows = useCallback(async (pageNum) => {
        console.log(`Fetching workflows page: ${pageNum}`);
        setIsLoading(true);
        setError(null); // Clear previous errors
        try {
            const result = await api.getWorkflows(pageNum, ITEMS_PER_PAGE);
            setWorkflows(result.items);
            // Calculate total pages based on total items and page size
            const calculatedTotalPages =
                Math.ceil(result.total / ITEMS_PER_PAGE) || 1; // Ensure at least 1 page
            setTotalPages(calculatedTotalPages);

            // If the requested page is now out of bounds (e.g., after delete on last page), fetch the new last valid page
            if (pageNum > calculatedTotalPages && calculatedTotalPages > 0) {
                setPage(calculatedTotalPages); // Trigger refetch of the last page
            } else {
                setWorkflows(result.items); // Otherwise, set the fetched items
            }
        } catch (err) {
            console.error("Failed to load workflows:", err);
            const errorMsg =
                err.response?.data?.detail || "Failed to load workflows";
            setError(errorMsg); // Store error message
            toast.error(errorMsg); // Show toast notification
            setWorkflows([]); // Clear workflows on error
            setTotalPages(1);
        } finally {
            setIsLoading(false);
        }
    }, []); // No dependencies needed if ITEMS_PER_PAGE is constant

    // Effect to fetch workflows when the page changes
    useEffect(() => {
        fetchWorkflows(page);
    }, [page, fetchWorkflows]); // Depend on page and the fetch function itself

    // Handler for deleting a workflow
    const handleDelete = async (e, workflow) => {
        e.stopPropagation(); // Prevent selection when clicking delete icon

        // Use a simple confirm dialog for this local application
        if (
            window.confirm(
                `Are you sure you want to delete "${workflow.name}"?`
            )
        ) {
            try {
                setIsLoading(true); // Indicate activity
                await api.deleteWorkflow(workflow.id);
                toast.success(`Workflow "${workflow.name}" deleted`);
                // Refetch the current page to update the list accurately
                fetchWorkflows(page);
            } catch (err) {
                console.error("Failed to delete workflow:", err);
                toast.error(
                    err.response?.data?.detail || "Failed to delete workflow"
                );
                setIsLoading(false); // Ensure loading is reset on error
            }
            // No finally block needed here as fetchWorkflows resets loading state
        }
    };

    // Handler for duplicating a workflow
    const handleDuplicate = async (e, workflow) => {
        e.stopPropagation(); // Prevent selection when clicking duplicate icon

        try {
            setIsLoading(true); // Indicate activity
            const duplicated = await api.duplicateWorkflow(workflow.id);
            toast.success(`Workflow duplicated as "${duplicated.name}"`);
            // Refetch the current page to update the list accurately.
            // Duplicates usually appear first (sorted by updated_at desc), so refetching page 1
            // might be slightly better UX, but refetching current page is simpler and correct.
            fetchWorkflows(page);
        } catch (err) {
            console.error("Failed to duplicate workflow:", err);
            toast.error(
                err.response?.data?.detail || "Failed to duplicate workflow"
            );
            setIsLoading(false); // Ensure loading is reset on error
        }
        // No finally block needed here as fetchWorkflows resets loading state
    };

    return (
        <div className="workflow-selector">
            <h3 className="text-lg font-medium mb-3">Your Workflows</h3>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex justify-center items-center py-4 min-h-[100px]">
                    <div
                        className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"
                        role="status"
                        aria-label="Loading..."
                    ></div>
                </div>
            ) : /* Error State */
            error ? (
                <div className="text-center py-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                    Error: {error}
                </div>
            ) : /* Empty State */
            workflows.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                    No workflows found. Create one to get started!
                </div>
            ) : (
                /* Workflow List and Pagination */
                <>
                    {/* Workflow List */}
                    <div className="space-y-2 max-h-96 overflow-y-auto border rounded p-2 bg-gray-50">
                        {workflows.map((workflow) => (
                            <div
                                key={workflow.id}
                                className={`p-3 border rounded hover:bg-gray-100 cursor-pointer flex justify-between items-center transition-colors duration-150 ${
                                    workflow.id === currentWorkflowId
                                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                                        : "border-gray-200 bg-white"
                                }`}
                                onClick={() => onSelect(workflow)}
                                role="button"
                                tabIndex={0} // Make it focusable
                                onKeyPress={(e) =>
                                    e.key === "Enter" && onSelect(workflow)
                                } // Basic keyboard accessibility
                            >
                                {/* Workflow Info */}
                                <div className="flex-grow mr-2 overflow-hidden">
                                    <div
                                        className="font-medium truncate"
                                        title={workflow.name}
                                    >
                                        {workflow.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Updated{" "}
                                        {new Date(
                                            workflow.updated_at
                                        ).toLocaleString()}{" "}
                                        (v{workflow.version})
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex space-x-1 flex-shrink-0">
                                    <button
                                        onClick={(e) =>
                                            handleDuplicate(e, workflow)
                                        }
                                        className="p-1 text-gray-500 hover:text-blue-600 rounded hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        title="Duplicate workflow"
                                        aria-label={`Duplicate workflow ${workflow.name}`}
                                    >
                                        <Icon name="copy" className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) =>
                                            handleDelete(e, workflow)
                                        }
                                        className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-400"
                                        title="Delete workflow"
                                        aria-label={`Delete workflow ${workflow.name}`}
                                    >
                                        <Icon
                                            name="trash-2"
                                            className="w-4 h-4"
                                        />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center mt-4 space-x-2">
                            <button
                                onClick={() =>
                                    setPage((prev) => Math.max(prev - 1, 1))
                                }
                                disabled={page === 1 || isLoading}
                                className="px-2 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                aria-label="Previous page"
                            >
                                <Icon name="chevron-left" className="w-4 h-4" />
                            </button>
                            <span className="px-2 py-1 text-sm text-gray-700">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() =>
                                    setPage((prev) =>
                                        Math.min(prev + 1, totalPages)
                                    )
                                }
                                disabled={page === totalPages || isLoading}
                                className="px-2 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                aria-label="Next page"
                            >
                                <Icon
                                    name="chevron-right"
                                    className="w-4 h-4"
                                />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default WorkflowSelector;
```

### 3.2 Create WorkflowSelectionModal Component

```jsx
// WorkflowSelectionModal.jsx
import React from "react";
import Modal from "./Modal"; // Assuming a generic Modal component exists
import WorkflowSelector from "./WorkflowSelector";

// Default empty workflow structure for creating a new one
const NEW_WORKFLOW_TEMPLATE = {
    name: "New Workflow",
    description: "",
    data: { nodes: {}, connections: [] }, // Match backend 'data' structure expected by API
};

function WorkflowSelectionModal({
    isOpen,
    onClose,
    onSelect,
    currentWorkflowId,
}) {
    // Don't render the modal if it's not open
    if (!isOpen) {
        return null;
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Select or Create Workflow"
            size="lg" // Example size property for the modal
        >
            <div className="p-4">
                {/* Embed the Workflow Selector */}
                <WorkflowSelector
                    onSelect={(workflow) => {
                        onSelect(workflow); // Pass the selected workflow object up
                        onClose(); // Close the modal automatically on selection
                    }}
                    currentWorkflowId={currentWorkflowId} // Highlight the currently active workflow
                />

                {/* Modal Action Buttons */}
                <div className="mt-6 flex justify-between items-center border-t pt-4">
                    {/* Cancel Button */}
                    <button
                        type="button" // Specify type to prevent form submission behavior
                        className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        onClick={onClose}
                    >
                        Cancel
                    </button>

                    {/* Create New Workflow Button */}
                    <button
                        type="button"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        onClick={() => {
                            // Pass a structured object representing the intent to create a new workflow.
                            // Add a flag 'isNew' if the receiving component needs to differentiate easily.
                            onSelect({ ...NEW_WORKFLOW_TEMPLATE, isNew: true });
                            onClose(); // Close the modal after initiating creation
                        }}
                    >
                        Create New Workflow
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default WorkflowSelectionModal;
```

---

## 4. Integration into Existing Components

### 4.1 Update `WorkflowEditor.jsx`

```jsx
// In WorkflowEditor.jsx
// --- Other imports ---
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    useNodesState,
    useEdgesState /* ... other React Flow imports ... */,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css"; // Import React Flow styles
import api from "../api/apiClient"; // Adjust import path as needed
import { toast } from "react-toastify";
import isEqual from "lodash/isEqual"; // For deep comparison in unsaved changes check

// --- Node type definitions, component map etc. (Assume these exist) ---
// const NODE_TYPES = { ... };
// const nodeComponentMap = { ... };
// const nodeTypes = { ... };

// *** LLM Programmer Note: Data Transformation Consistency ***
// Ensure the conversion logic between the backend's workflow data format
// (nodes as object map, connections as array) and React Flow's format
// (nodes array, edges array) is precise and handles all necessary fields
// (id, type, position, data, source, target, sourceHandle, targetHandle)
// in *both* directions (loading from API and saving to API).
// Consider creating dedicated utility functions like `apiToReactFlow(apiData)`
// and `reactFlowToApi(nodes, edges)` to centralize and potentially test this logic.

// Example (conceptual utility functions - implement details based on your exact structures)
/*
const apiToReactFlow = (apiData) => {
  const rfNodes = Object.entries(apiData?.nodes || {}).map(([id, nodeConfig]) => ({
     id,
     type: nodeComponentMap[nodeConfig.type] || 'modelNode', // Map internal type to component type
     position: nodeConfig.position || { x: 100, y: 100 },
     data: { ...nodeConfig, label: nodeConfig.name || id } // Pass config to node data
  }));
  const rfEdges = (apiData?.connections || []).map(conn => ({
     id: `edge-${conn.source_node_id}-${conn.source_handle}-${conn.target_node_id}-${conn.target_handle}`, // More specific edge ID
     source: conn.source_node_id,
     target: conn.target_node_id,
     sourceHandle: conn.source_handle,
     targetHandle: conn.target_handle,
     type: 'smoothstep', // Or your preferred edge type
     // ... other edge properties like animated, markerEnd, style ...
  }));
  return { nodes: rfNodes, edges: rfEdges };
};

const reactFlowToApi = (nodes, edges) => {
   const apiNodes = {};
   nodes.forEach(node => {
      // Assumes node data holds the configuration, excluding React Flow specific props like 'label' if needed
      const { label, ...configData } = node.data;
      apiNodes[node.id] = {
         ...configData, // Spread the configuration data
         name: label || node.id, // Store label as name if it exists, otherwise use ID
         position: node.position, // Store node position
         // Map the React Flow component type back to the internal type stored in the DB
         type: Object.keys(nodeComponentMap).find(key => nodeComponentMap[key] === node.type) || 'model'
      };
   });
   const apiConnections = edges.map(edge => ({
      source_node_id: edge.source,
      source_handle: edge.sourceHandle || null,
      target_node_id: edge.target,
      target_handle: edge.targetHandle || null,
   }));
   return { nodes: apiNodes, connections: apiConnections };
};
*/

function WorkflowEditor(
    {
        /* ... other props ... */
    }
) {
    // --- State Hooks ---
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    // Store the full workflow object received from the API { id, name, data, version, ... }
    const [workflow, setWorkflow] = useState(null);
    // State for editable fields (name, description) separate from the main workflow object
    const [workflowName, setWorkflowName] = useState("New Workflow");
    const [workflowDescription, setWorkflowDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    // Ref to store the initial loaded state for comparing changes
    const initialWorkflowState = useRef(null);

    // --- Callbacks ---

    // Function to check if the current state differs from the initially loaded state
    const checkForUnsavedChanges = useCallback(() => {
        // If no workflow is loaded or initial state isn't set,
        // consider it changed if there are any nodes or edges.
        if (!workflow || !initialWorkflowState.current) {
            return nodes.length > 0 || edges.length > 0;
        }
        // Compare current editable fields and graph data to the initial state
        const currentApiData = reactFlowToApi(nodes, edges); // Use your transformation utility
        const initialApiData = initialWorkflowState.current.data;
        const nameChanged = workflowName !== initialWorkflowState.current.name;
        const descriptionChanged =
            workflowDescription !== initialWorkflowState.current.description;
        // Use a deep comparison for the graph data object
        const dataChanged = !isEqual(currentApiData, initialApiData);

        return nameChanged || descriptionChanged || dataChanged;
    }, [nodes, edges, workflow, workflowName, workflowDescription]); // Dependencies for comparison

    // Update the 'hasUnsavedChanges' flag whenever relevant state changes
    useEffect(() => {
        setHasUnsavedChanges(checkForUnsavedChanges());
    }, [
        nodes,
        edges,
        workflowName,
        workflowDescription,
        checkForUnsavedChanges,
    ]);

    // Handle creating a new, empty workflow state in the editor
    const handleNewWorkflow = useCallback(() => {
        // Optional: Prompt for saving if there are unsaved changes
        // if (hasUnsavedChanges && !window.confirm("Discard unsaved changes and create a new workflow?")) return;

        setWorkflow(null); // Clear the loaded workflow object reference
        setWorkflowName("New Workflow"); // Reset editable fields
        setWorkflowDescription("");
        setNodes([]); // Clear React Flow state
        setEdges([]);
        initialWorkflowState.current = null; // Clear the reference state
        setHasUnsavedChanges(false); // Reset unsaved changes flag
        toast.info("Started new workflow");
    }, [setNodes, setEdges]); // Dependencies: only setters

    // Handle loading a workflow selected from the modal/selector into the editor
    const handleWorkflowSelected = useCallback(
        async (selectedWorkflow) => {
            if (!selectedWorkflow) return; // Do nothing if selection is invalid

            // Optional: Prompt for saving if there are unsaved changes before loading
            // if (hasUnsavedChanges && !window.confirm("Discard unsaved changes and load selected workflow?")) return;

            // Check if the selection represents a new workflow intent
            if (selectedWorkflow.isNew || !selectedWorkflow.id) {
                handleNewWorkflow(); // Reset editor to a new state
            } else {
                // Load the existing workflow data
                try {
                    // Assume selectedWorkflow is the full object from getWorkflows or getWorkflowById API call
                    const loadedData = selectedWorkflow.data || {
                        nodes: {},
                        connections: [],
                    }; // Ensure data exists
                    // Use your transformation utility to convert API data to React Flow format
                    const { nodes: rfNodes, edges: rfEdges } =
                        apiToReactFlow(loadedData);

                    setWorkflow(selectedWorkflow); // Store the full workflow object (incl. id, version)
                    setWorkflowName(selectedWorkflow.name); // Set editable fields
                    setWorkflowDescription(selectedWorkflow.description || "");
                    setNodes(rfNodes); // Set React Flow state
                    setEdges(rfEdges);

                    // Store the initial state (in API format) for unsaved changes detection
                    initialWorkflowState.current = {
                        name: selectedWorkflow.name,
                        description: selectedWorkflow.description || "",
                        data: loadedData, // Store the original API data structure
                    };
                    setHasUnsavedChanges(false); // Reset flag after successful load
                    toast.success(`Loaded workflow "${selectedWorkflow.name}"`);
                } catch (error) {
                    console.error(
                        "Failed to process selected workflow:",
                        error
                    );
                    toast.error(
                        "Failed to load workflow data. Resetting editor."
                    );
                    handleNewWorkflow(); // Reset to a new state on error
                }
            }
        },
        [handleNewWorkflow, setNodes, setEdges]
    ); // Dependencies

    // Save the current workflow state (nodes, edges, name, description) to the backend
    const saveWorkflow = useCallback(async () => {
        if (isSaving) return; // Prevent accidental double saves
        setIsSaving(true);

        try {
            // Use your transformation utility to convert React Flow state to API format
            const workflowApiData = reactFlowToApi(nodes, edges);

            let savedWorkflow;
            // Check if we are updating an existing workflow (has ID and version)
            if (workflow?.id) {
                savedWorkflow = await api.updateWorkflow(workflow.id, {
                    name: workflowName,
                    description: workflowDescription,
                    data: workflowApiData,
                    // The backend API endpoint handles the version increment using OCC
                });
                toast.success(
                    `Workflow "${savedWorkflow.name}" updated (v${savedWorkflow.version})`
                );
            } else {
                // Otherwise, create a new workflow
                savedWorkflow = await api.createWorkflow({
                    name: workflowName,
                    description: workflowDescription,
                    data: workflowApiData,
                });
                toast.success(`Workflow "${savedWorkflow.name}" created`);
            }

            // Update local state with the saved workflow object from the API response
            // This ensures we have the latest ID, version, and timestamps.
            setWorkflow(savedWorkflow);
            // Update the initial state reference to match the newly saved state
            initialWorkflowState.current = {
                name: savedWorkflow.name,
                description: savedWorkflow.description || "",
                data: savedWorkflow.data, // Use the data structure returned by the API
            };
            setHasUnsavedChanges(false); // Reset unsaved changes flag after successful save
        } catch (error) {
            console.error("Failed to save workflow:", error);
            // Provide specific feedback for Optimistic Concurrency Control conflicts (409)
            if (error.response?.status === 409) {
                toast.error(
                    "Save failed: Workflow was modified elsewhere. Please reload and try again."
                );
                // Future enhancement: Offer options like force overwrite or view diff.
            } else {
                // Generic error message for other failures
                toast.error(
                    `Failed to save workflow: ${
                        error.response?.data?.detail || error.message
                    }`
                );
            }
        } finally {
            setIsSaving(false); // Re-enable save button
        }
    }, [nodes, edges, workflow, workflowName, workflowDescription, isSaving]); // Dependencies

    // Add 'beforeunload' event listener to warn about unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasUnsavedChanges) {
                // Standard mechanism to trigger the browser's native confirmation dialog
                e.preventDefault();
                // Most modern browsers ignore the custom message and show a generic one.
                e.returnValue =
                    "You have unsaved changes. Are you sure you want to leave?";
                return e.returnValue;
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        // Cleanup function to remove the listener when the component unmounts
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]); // Re-run effect only if the unsaved changes flag changes

    // --- Render Logic ---
    // ... rest of WorkflowEditor component JSX (React Flow canvas, controls, input fields for name/description, save button) ...
    // Example:
    // return (
    //    <div>
    //      <input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
    //      <textarea value={workflowDescription} onChange={(e) => setWorkflowDescription(e.target.value)} />
    //      <button onClick={saveWorkflow} disabled={isSaving || !hasUnsavedChanges}>
    //          {isSaving ? 'Saving...' : 'Save Workflow'}
    //      </button>
    //      <ReactFlow nodes={nodes} edges={edges} ... />
    //    </div>
    // );
}
```

### 4.2 Update `WorkflowManager.jsx`

_(This component might be for raw JSON editing. Ensure it uses the API client for saving and handles potential errors, including the 409 conflict, similar to `WorkflowEditor`)._

```jsx
// In WorkflowManager.jsx (Conceptual - adapt to your actual component structure)
import React, { useState, useEffect, useCallback } from "react"; // Added useEffect
import api from "../api/apiClient";
import { toast } from "react-toastify";

function WorkflowManager({
    currentWorkflow,
    onSaveSuccess /*, ... other props */,
}) {
    // State to hold the JSON string being edited
    const [workflowJson, setWorkflowJson] = useState(""); // Initialize empty
    const [isSaving, setIsSaving] = useState(false);
    // Store the workflow object this JSON corresponds to (needed for update ID/name/desc)
    const [workflow, setWorkflow] = useState(null); // Initialize null

    // Update internal state when the currentWorkflow prop changes
    useEffect(() => {
        setWorkflow(currentWorkflow);
        setWorkflowJson(
            JSON.stringify(
                currentWorkflow?.data || { nodes: {}, connections: [] },
                null,
                2
            ) // Format nicely
        );
    }, [currentWorkflow]);

    const handleSaveJson = useCallback(async () => {
        setIsSaving(true);
        let parsedData;

        // 1. Validate JSON syntax
        try {
            parsedData = JSON.parse(workflowJson);
        } catch (error) {
            console.error("Invalid JSON format:", error);
            toast.error("Invalid JSON format. Please correct syntax errors.");
            setIsSaving(false);
            return;
        }

        // 2. Basic structure validation (optional but recommended)
        if (
            typeof parsedData !== "object" ||
            parsedData === null ||
            !parsedData.nodes ||
            !Array.isArray(parsedData.connections)
        ) {
            toast.error(
                'Invalid workflow structure. Must include "nodes" (object) and "connections" (array).'
            );
            setIsSaving(false);
            return;
        }

        // 3. Prepare payload for API
        const workflowPayload = {
            // Use current workflow name/desc if updating, or defaults if somehow creating new from JSON editor
            name: workflow?.name || "Workflow from JSON",
            description: workflow?.description || "",
            data: parsedData, // The parsed JSON data
        };

        // 4. Call API (Update or Create)
        try {
            let savedWorkflow;
            if (workflow?.id) {
                // Update existing workflow
                savedWorkflow = await api.updateWorkflow(
                    workflow.id,
                    workflowPayload
                );
                toast.success(
                    `Workflow "${savedWorkflow.name}" updated from JSON`
                );
            } else {
                // Creating a new workflow directly from JSON editor (less common scenario)
                // Might need to prompt for name/description if 'workflow' state is null
                savedWorkflow = await api.createWorkflow(workflowPayload);
                toast.success(
                    `Workflow "${savedWorkflow.name}" created from JSON`
                );
            }

            // Notify parent or update local state on success
            if (onSaveSuccess) {
                onSaveSuccess(savedWorkflow);
            }
            setWorkflow(savedWorkflow); // Update local workflow state reference
        } catch (error) {
            console.error("Failed to save workflow from JSON:", error);
            // Handle specific 409 Conflict error
            if (error.response?.status === 409) {
                toast.error(
                    "Save failed: Workflow was modified elsewhere. Please reload and try again."
                );
            } else {
                // Handle other API or validation errors
                toast.error(
                    `Failed to save: ${
                        error.response?.data?.detail || error.message
                    }`
                );
            }
        } finally {
            setIsSaving(false); // Re-enable save button
        }
    }, [workflowJson, workflow, onSaveSuccess]); // Dependencies

    // --- Render Logic ---
    // return (
    //   <div>
    //     <textarea value={workflowJson} onChange={(e) => setWorkflowJson(e.target.value)} rows={20} cols={80} />
    //     <button onClick={handleSaveJson} disabled={isSaving}>
    //       {isSaving ? 'Saving...' : 'Save JSON'}
    //     </button>
    //   </div>
    // );
}
```

### 4.3 Update `Generate.jsx`

_(This component primarily consumes workflow data. Ensure it correctly uses the API client methods defined earlier and handles loading/error states when fetching the workflow list or specific workflow data)._

```jsx
// In Generate.jsx
import React, { useState, useEffect, useCallback } from "react";
import api from "../api/apiClient"; // Adjust import path
import { toast } from "react-toastify";
import Icon from "./Icons"; // Assuming Icon component exists
import ToggleSwitch from "./ToggleSwitch"; // Assuming ToggleSwitch component exists
// Potentially import WorkflowSelectionModal if managing workflows from here
// import WorkflowSelectionModal from './WorkflowSelectionModal';

function Generate(
    {
        /* ... other props like isGenerating, isParaphrasing ... */
    }
) {
    // --- State Hooks ---
    const [workflowEnabled, setWorkflowEnabled] = useState(false); // Is workflow mode active?
    const [workflows, setWorkflows] = useState([]); // List of available workflows for dropdown
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false); // Loading state for the dropdown list
    const [selectedWorkflowId, setSelectedWorkflowId] = useState(null); // ID of the selected workflow
    const [currentWorkflowData, setCurrentWorkflowData] = useState(null); // Actual data {nodes, connections} of the selected workflow
    const [isLoadingWorkflowData, setIsLoadingWorkflowData] = useState(false); // Loading state for the selected workflow's data
    // const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false); // State for managing workflow modal visibility

    // --- Callbacks ---

    // Fetch the list of available workflows (names/IDs) for the dropdown
    const fetchWorkflowsList = useCallback(async () => {
        setIsLoadingWorkflows(true);
        setCurrentWorkflowData(null); // Clear old data when fetching list
        // Keep selectedWorkflowId to potentially re-select if list hasn't changed drastically
        // setSelectedWorkflowId(null); // Optionally clear selection when fetching list
        try {
            // Fetch a reasonable number, e.g., up to 100, assuming not thousands locally
            const result = await api.getWorkflows(1, 100); // Use pagination params
            setWorkflows(result.items);

            // If a workflow was previously selected, check if it still exists in the new list
            const currentSelectionExists = result.items.some(
                (item) => item.id === selectedWorkflowId
            );
            if (!currentSelectionExists) {
                // If the previously selected one is gone, clear selection and data
                setSelectedWorkflowId(null);
                setCurrentWorkflowData(null);
                // Optionally auto-select the first if list not empty
                if (result.items.length > 0) {
                    handleSelectWorkflow(result.items[0].id);
                }
            } else if (selectedWorkflowId && !currentWorkflowData) {
                // If selection exists but data isn't loaded (e.g. after enabling mode), load it
                handleSelectWorkflow(selectedWorkflowId);
            } else if (!selectedWorkflowId && result.items.length > 0) {
                // If nothing selected and list not empty, auto-select first
                handleSelectWorkflow(result.items[0].id);
            }
        } catch (error) {
            console.error("Failed to load workflows list:", error);
            toast.error("Could not load workflows list");
            setWorkflows([]); // Clear list on error
            setSelectedWorkflowId(null);
            setCurrentWorkflowData(null);
        } finally {
            setIsLoadingWorkflows(false);
        }
        // Depend on selectedWorkflowId to re-validate selection if list changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWorkflowId]); // Add handleSelectWorkflow later if needed, be careful of loops

    // Effect to fetch the workflow list when workflow mode is enabled/disabled
    useEffect(() => {
        if (workflowEnabled) {
            fetchWorkflowsList();
        } else {
            // Clear workflow state when mode is disabled
            setWorkflows([]);
            setSelectedWorkflowId(null);
            setCurrentWorkflowData(null);
            setIsLoadingWorkflows(false);
            setIsLoadingWorkflowData(false);
        }
    }, [workflowEnabled, fetchWorkflowsList]); // Depend on mode and the fetch function

    // Load the actual data ({nodes, connections}) for the selected workflow ID
    const handleSelectWorkflow = useCallback(async (id) => {
        // Convert id to number if it comes from select value (string)
        const numericId = id ? parseInt(id, 10) : null;

        if (!numericId) {
            setSelectedWorkflowId(null);
            setCurrentWorkflowData(null);
            return;
        }

        // Update the selected ID immediately for the dropdown UI feedback
        setSelectedWorkflowId(numericId);
        // Don't clear data immediately if it's already loaded for this ID
        // setCurrentWorkflowData(null); // Clear old data while loading new? Maybe not needed if quick.
        setIsLoadingWorkflowData(true); // Set loading state for data fetch

        try {
            // Fetch the full workflow details by ID
            const workflow = await api.getWorkflowById(numericId);
            setCurrentWorkflowData(workflow.data); // Store only the relevant 'data' part
            // Optional feedback: toast.info(`Loaded data for workflow: ${workflow.name}`);
        } catch (error) {
            console.error(
                `Failed to load workflow data for ID ${numericId}:`,
                error
            );
            toast.error("Failed to load selected workflow data");
            setCurrentWorkflowData(null); // Clear data on error
            // Consider resetting the selection if the load fails critically
            // setSelectedWorkflowId(null);
        } finally {
            setIsLoadingWorkflowData(false); // Clear loading state for data fetch
        }
    }, []); // No dependencies needed as it uses the ID passed in

    // Add handleSelectWorkflow to fetchWorkflowsList dependencies carefully if needed
    // useEffect(() => { ... }, [fetchWorkflowsList, handleSelectWorkflow]);

    // Toggle workflow mode on/off
    const handleToggleWorkflow = (enabled) => {
        setWorkflowEnabled(enabled);
    };

    // --- Optional Modal Handling ---
    // const handleOpenWorkflowModal = () => setIsWorkflowModalOpen(true);
    // const handleCloseWorkflowModal = () => setIsWorkflowModalOpen(false);
    // const handleWorkflowSelectedFromModal = (workflow) => {
    //    // Logic after selecting/creating in modal:
    //    // 1. Refresh the workflow list
    //    fetchWorkflowsList();
    //    // 2. Optionally auto-select the newly created/selected one
    //    if (workflow?.id) {
    //        handleSelectWorkflow(workflow.id);
    //    }
    //    // 3. Or trigger opening the editor for a new workflow
    // }

    // --- Render Logic ---
    // Use currentWorkflowData in the generation process
    // Disable relevant UI elements based on isLoadingWorkflows, isLoadingWorkflowData, isGenerating etc.

    return (
        <div>
            {/* ... other Generate UI elements ... */}

            {/* Workflow Mode Control Section */}
            <div className="mt-4 p-3 border rounded bg-gray-50">
                {/* Toggle Switch */}
                <div className="flex items-center justify-between">
                    <label
                        htmlFor="workflow-toggle"
                        className="text-sm font-medium text-gray-700 flex items-center cursor-pointer"
                    >
                        <Icon
                            name="workflow"
                            className="h-4 w-4 mr-1.5 text-gray-500"
                        />
                        Workflow Mode
                    </label>
                    <ToggleSwitch
                        id="workflow-toggle"
                        checked={workflowEnabled}
                        onChange={handleToggleWorkflow}
                        // Example: disable toggle during generation
                        // disabled={isGenerating || isParaphrasing}
                    />
                </div>

                {/* Workflow Selection Dropdown (only shown if mode is enabled) */}
                {workflowEnabled && (
                    <div className="mt-3 space-y-2">
                        <label
                            htmlFor="workflow-select"
                            className="block text-xs font-medium text-gray-600"
                        >
                            Select Workflow:
                        </label>
                        <div className="flex items-center space-x-2">
                            <select
                                id="workflow-select"
                                value={selectedWorkflowId || ""} // Controlled component
                                onChange={(e) =>
                                    handleSelectWorkflow(e.target.value)
                                } // Pass selected value (string ID)
                                className="block w-full text-sm border-gray-300 rounded shadow-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:bg-gray-100"
                                // Disable dropdown while loading list or generating output
                                disabled={
                                    isLoadingWorkflows /* || isGenerating || isParaphrasing */
                                }
                            >
                                {/* Default / Loading Option */}
                                <option value="" disabled={isLoadingWorkflows}>
                                    {isLoadingWorkflows
                                        ? "Loading workflows..."
                                        : "Select a workflow"}
                                </option>
                                {/* Empty List Option */}
                                {!isLoadingWorkflows &&
                                    workflows.length === 0 && (
                                        <option value="" disabled>
                                            No workflows available
                                        </option>
                                    )}
                                {/* Populated List Options */}
                                {workflows.map((workflow) => (
                                    <option
                                        key={workflow.id}
                                        value={workflow.id}
                                    >
                                        {workflow.name}
                                    </option>
                                ))}
                            </select>
                            {/* Optional: Button to open editor/modal */}
                            {/*
                             <button
                                 onClick={handleOpenWorkflowModal}
                                 className="flex-shrink-0 text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                                 disabled={isLoadingWorkflows // || isGenerating || isParaphrasing}
                                 title="Manage Workflows"
                             >
                                 Manage
                             </button>
                             */}
                        </div>
                        {/* Status indicator for loading selected workflow data */}
                        {isLoadingWorkflowData && (
                            <div className="text-xs text-gray-500 italic mt-1">
                                Loading workflow data...
                            </div>
                        )}
                        {selectedWorkflowId &&
                            currentWorkflowData &&
                            !isLoadingWorkflowData && (
                                <div className="text-xs text-green-600 mt-1">
                                    Workflow data loaded. Ready for generation.
                                </div>
                            )}
                        {!selectedWorkflowId &&
                            !isLoadingWorkflows &&
                            workflows.length > 0 && (
                                <div className="text-xs text-gray-500 italic mt-1">
                                    Select a workflow to load its data.
                                </div>
                            )}
                    </div>
                )}
            </div>

            {/* Optional: Render Workflow Management Modal */}
            {/*
            <WorkflowSelectionModal
                isOpen={isWorkflowModalOpen}
                onClose={handleCloseWorkflowModal}
                onSelect={handleWorkflowSelectedFromModal}
                currentWorkflowId={selectedWorkflowId}
            />
            */}

            {/* ... rest of Generate component, potentially using currentWorkflowData ... */}
        </div>
    );
}

export default Generate;
```

---

## 5. Implementation Strategy

_(Simplified to reflect local, single-user context)_

1.  **Phase 1: Backend Setup (Focus: Core Logic)**

    -   Create/update `Workflow` model (`models.py`) and `schemas.py` as specified.
    -   Implement CRUD endpoints (`workflows.py`) including OCC logic (for self-overwrite protection) and basic error handling.
    -   Ensure database schema is created locally (e.g., via `SQLModel.metadata.create_all` on startup or a simple script). **No complex migrations needed.**

2.  **Phase 2: Frontend Integration (Focus: Connecting UI)**

    -   Update API client (`apiClient.js`) with all workflow methods.
    -   Create `WorkflowSelector` and `WorkflowSelectionModal` components as specified (using refetch logic for updates).
    -   Update `WorkflowEditor.jsx`:
        -   Replace `localStorage` logic with API calls for loading (`handleWorkflowSelected`) and saving (`saveWorkflow`).
        -   Implement data transformation logic (API <-> React Flow), ideally using utility functions as noted.
        -   Add specific handling for the 409 Conflict error during save.
        -   Ensure `beforeunload` prompt works based on `hasUnsavedChanges`.
    -   Update `Generate.jsx` to fetch the workflow list and load selected workflow data via the API, handling loading/error states.

3.  **Phase 3: Refinement & Cleanup (Focus: Polish)**

    -   Improve loading states (e.g., spinners, disabled elements) and error message presentation throughout the UI.
    -   Ensure consistent styling across new/updated components.
    -   Remove all old `localStorage` code related to workflows thoroughly.
    -   Review code for clarity and adherence to the single-user, local context (remove any lingering multi-user assumptions or unnecessary complexity).

---

## 6. Limitations

-   **JSON Searchability:** Workflow `data` is stored as a JSON blob. Searching _within_ workflows (e.g., finding workflows using a specific node type) is not possible via database queries. Workflows must be loaded into the application to inspect their contents. (This is acceptable for local use).
-   **No Real-time Merging:** If the user _somehow_ manages to edit the exact same workflow in two separate application instances or browser tabs simultaneously, the _last_ save (that doesn't hit an OCC conflict) will overwrite the other. There's no real-time merging or notification between instances/tabs. OCC primarily mitigates rapid accidental overwrites within _one_ editing session.
-   **Scalability:** Designed for a single user's workflow collection. Performance might degrade if a single user creates _thousands_ of extremely large workflows (approaching the 10MB limit), but this is considered unlikely in the intended personal use scenario.
