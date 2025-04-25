from typing import Dict, Any, AsyncGenerator, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, Response
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, func, update
import logging
import json
import asyncio
from datetime import datetime, timezone

from ..db import get_session
from ..api.models import Template, Workflow
from ..api.schemas import (
    WorkflowExecuteRequest, 
    WorkflowExecutionResult,
    SeedData,
    NodeExecutionResult,
    WorkflowCreate,
    WorkflowRead,
    WorkflowUpdate,
    WorkflowPagination
)
from ..core.workflow_executor import WorkflowExecutor

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

# GET all workflows
@router.get("/workflows", response_model=WorkflowPagination)
async def get_workflows(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(50, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session)
):
    """Get all workflows (paginated)."""
    # Base query with no user filter
    query = select(Workflow).order_by(Workflow.updated_at.desc())

    # Efficient count for pagination total
    total_query = select(func.count()).select_from(Workflow)
    total = session.exec(total_query).first() or 0  # Handle case with no workflows

    # Apply pagination limits
    query = query.offset((page - 1) * size).limit(size)

    # Execute query
    workflows = session.exec(query).all()

    return {"items": workflows, "total": total}

# GET a specific workflow
@router.get("/workflows/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    workflow_id: int,
    session: Session = Depends(get_session)
):
    """Get a specific workflow by ID."""
    workflow = session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow

# CREATE a new workflow
@router.post("/workflows", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate,
    session: Session = Depends(get_session)
):
    """Create a new workflow."""
    # Check for duplicate name before creating
    # Try to find a unique name by appending a number if needed
    base_name = workflow_data.name
    name = base_name
    index = 1
    while True:
        existing_query = select(Workflow).where(
            Workflow.name == name
        )
        existing = session.exec(existing_query).first()
        if not existing:
            break
        index += 1
        name = f"{base_name} ({index})"
    workflow_data.name = name

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workflow with name '{workflow_data.name}' already exists."
        )

    # Create workflow instance (timestamps/version handled by model defaults)
    db_workflow = Workflow(
        name=workflow_data.name,
        description=workflow_data.description,
        data=workflow_data.data
        # version defaults to 1
    )
    session.add(db_workflow)
    try:
        session.commit()
        session.refresh(db_workflow)  # Load DB-generated values like ID, timestamps
        return db_workflow
    except Exception as e:  # Catch potential DB errors during commit
        session.rollback()
        # Log the error server-side
        logger.error(f"Error creating workflow: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create workflow due to a server error."
        )

# UPDATE an existing workflow
@router.put("/workflows/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    workflow_id: int,
    workflow_update_data: WorkflowUpdate,
    session: Session = Depends(get_session)
):
    """Update an existing workflow using Optimistic Concurrency Control."""
    # Retrieve the existing workflow
    db_workflow = session.get(Workflow, workflow_id)
    if not db_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Check for name uniqueness if name is being updated to a new value
    if workflow_update_data.name and workflow_update_data.name != db_workflow.name:
        existing_query = select(Workflow).where(
            Workflow.name == workflow_update_data.name,
            Workflow.id != workflow_id  # Exclude the current workflow being updated
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
        return db_workflow

    try:
        # Atomically update the workflow in the database *only if* the version matches
        # Note: updated_at is handled by SQLModel field default_factory
        stmt = (
            update(Workflow)
            .where(Workflow.id == workflow_id)
            .where(Workflow.version == current_version)  # Optimistic Concurrency Check
            .values(
                **update_dict,  # Apply provided updates
                version=current_version + 1  # Increment version number
            )
        )
        result = session.exec(stmt)  # Execute the update statement

        # Check if any row was actually updated
        if result.rowcount == 0:
            # If rowcount is 0, it means the version didn't match (or workflow was deleted concurrently)
            session.rollback()  # Rollback the transaction
            # Check if the workflow still exists to give a more specific error
            check_exists = session.get(Workflow, workflow_id)
            if not check_exists:
                # Workflow was deleted
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail="Workflow not found."
                )
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

    except HTTPException:
        # Re-raise HTTP exceptions without wrapping them
        raise
    except Exception as e:
        session.rollback()
        # Log the error server-side
        logger.error(f"Error updating workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update workflow due to a server error."
        )

# DELETE a workflow
@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: int,
    session: Session = Depends(get_session)
):
    """Delete a workflow."""
    db_workflow = session.get(Workflow, workflow_id)
    if not db_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    session.delete(db_workflow)
    try:
        session.commit()
    except Exception as e:  # Catch potential DB errors during commit
        session.rollback()
        logger.error(f"Error deleting workflow {workflow_id}: {e}")
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
    response: Response,  # Inject Response object to set headers
    session: Session = Depends(get_session)
):
    """Create a duplicate of an existing workflow."""
    # Find the workflow to duplicate
    source_workflow = session.get(Workflow, workflow_id)
    if not source_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Find a unique name for the copy (e.g., "My Workflow (Copy)", "My Workflow (Copy 2)")
    base_name = source_workflow.name
    copy_name = f"{base_name} (Copy)"
    copy_index = 1
    while True:
        name_check_query = select(Workflow).where(
            Workflow.name == copy_name
        )
        existing = session.exec(name_check_query).first()
        if not existing:
            break  # Found a unique name
        copy_index += 1
        copy_name = f"{base_name} (Copy {copy_index})"

    # Create the new workflow instance with copied data
    new_workflow = Workflow(
        name=copy_name,
        description=source_workflow.description,
        data=source_workflow.data  # Deep copy should be handled by JSON type
        # Timestamps and version=1 will be set by database defaults/model defaults
    )

    session.add(new_workflow)
    try:
        session.commit()
        session.refresh(new_workflow)  # Get the generated ID, timestamps, version

        # Set the Location header in the HTTP response
        response.headers["Location"] = f"/workflows/{new_workflow.id}"

        return new_workflow
    except Exception as e:
        session.rollback()
        logger.error(f"Error duplicating workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not duplicate workflow due to a server error."
        )


# --- Workflow Execution Endpoints (existing code) ---

@router.post("/workflow/execute", response_model=WorkflowExecutionResult)
async def execute_workflow(
    request: Dict[str, Any],  # Accept raw JSON to allow client-defined workflow
    session: Session = Depends(get_session),
):
    """
    Execute a workflow with the provided workflow definition and template output.
    The workflow definition is provided by the client and not stored on the server.
    The workflow processes the output of the template generation.
    """
    try:
        # Extract workflow definition and input data from request
        workflow_definition = request.get("workflow")
        input_data = request.get("input_data", {})
        seed_data_dict = request.get("seed_data", {})  # For backwards compatibility
        template_output = request.get("template_output", "")
        debug_mode = request.get("debug_mode", False)
        
        if not workflow_definition:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow definition is required"
            )
        
        # Ensure we have proper input data for the workflow
        # First check if we have seed_data for backward compatibility
        if seed_data_dict and not input_data:
            logger.info("Using legacy seed_data format for workflow execution")
            try:
                seed_data = SeedData.parse_obj(seed_data_dict)
            except Exception as e:
                logger.error(f"Error parsing seed data: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid seed data format: {str(e)}"
                )
        else:
            # Create a simplified SeedData object with the input data
            seed_data = SeedData(slots={})
            
        # Initialize workflow executor - always enable debug mode for easier troubleshooting
        executor = WorkflowExecutor(debug_mode=True)
        
        # Generate a unique ID for this execution (not stored)
        workflow_id = workflow_definition.get("id", "temp-workflow")
        
        # Add template output to the input data and seed_data.slots
        # This ensures the input node will have access to the template output
        if template_output:
            # Store the raw template output for processing by the input node
            input_data["template_output"] = template_output
            # Also add to the root level for consistent access
            input_data["output"] = template_output
            # And add to slots for convenience
            seed_data.slots["template_output"] = template_output
            
            logger.info(f"Received template output for workflow execution: type={type(template_output).__name__}, length={len(template_output) if isinstance(template_output, str) else 'not-string'}")
        
        # Check if input_data should be included in the seed data
        if input_data and isinstance(input_data, dict):
            # Add any input data to what we pass to the executor
            for key, value in input_data.items():
                seed_data.slots[key] = value
        
        # Execute the workflow
        result = await executor.execute_workflow(
            workflow_id=workflow_id,
            workflow_data=workflow_definition,
            seed_data=seed_data
        )
        
        return result
        
    except Exception as e:
        logger.exception(f"Error executing workflow: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing workflow: {str(e)}"
        )

@router.post("/workflow/execute/stream")
async def execute_workflow_stream(
    request: Dict[str, Any],
    session: Session = Depends(get_session),
):
    """
    Execute a workflow with streaming progress updates.
    Returns a streaming response with node execution progress and results.
    The workflow processes the output of the template generation.
    """
    async def generate_workflow_progress() -> AsyncGenerator[str, None]:
        try:
            # Extract workflow definition and input data from request
            workflow_definition = request.get("workflow")
            template_output = request.get("template_output", "")
            debug_mode = request.get("debug_mode", False)
            
            if not workflow_definition:
                error_msg = json.dumps({
                    "type": "error",
                    "error": "Workflow definition is required"
                })
                yield f"{error_msg}\n"
                return
            
            # Create a simplified SeedData object with minimal required data
            seed_data = SeedData(slots={})
                
            # Add template output directly to slots in a clean way
            if template_output:
                seed_data.slots["template_output"] = template_output
                logger.info(f"Received template output for workflow streaming: type={type(template_output).__name__}, length={len(template_output) if isinstance(template_output, str) else 'not-string'}")
            
            # Setup workflow executor with progress callback
            # Always enable debug mode for streaming to diagnose issues
            workflow_id = workflow_definition.get("id", "temp-workflow")
            executor = WorkflowExecutor(debug_mode=True)
            
            # Initial workflow structure info
            nodes = workflow_definition.get("nodes", {})
            connections = workflow_definition.get("connections", [])
            
            # Build dependency graph and determine execution order
            dependency_graph = executor._build_dependency_graph(nodes, connections)
            execution_order = executor._determine_execution_order(dependency_graph)
            
            # Send the initial workflow structure and execution plan
            init_data = json.dumps({
                "type": "init",
                "workflow_id": workflow_id,
                "node_count": len(nodes),
                "execution_order": execution_order,
                "timestamp": executor._get_timestamp()
            })
            yield f"{init_data}\n"
            await asyncio.sleep(0.1)  # Small delay to allow client to process
            
            # Create a queue to communicate between callbacks and the generator
            progress_queue = asyncio.Queue()
            
            # Set up progress callback that puts data in the queue
            async def progress_callback(node_id: str, status: str, progress: float, result: NodeExecutionResult = None):
                progress_data = {
                    "type": "progress",
                    "node_id": node_id,
                    "status": status,  # "queued", "running", "success", "error"
                    "progress": progress,  # 0.0 to 1.0
                    "timestamp": executor._get_timestamp()
                }
                
                if result:
                    progress_data["result"] = result.dict()
                
                # Put the formatted data in the queue
                await progress_queue.put(json.dumps(progress_data) + "\n")
            
            # Start the workflow execution in a background task
            execution_task = asyncio.create_task(
                executor.execute_workflow_with_progress(
                    workflow_id=workflow_id,
                    workflow_data=workflow_definition,
                    seed_data=seed_data,
                    progress_callback=progress_callback
                )
            )
            
            # Yield data from the queue as it becomes available
            try:
                # Keep yielding data until the execution task is done
                while not execution_task.done() or not progress_queue.empty():
                    try:
                        # Wait for data with a timeout to prevent blocking forever
                        data = await asyncio.wait_for(progress_queue.get(), 0.5)
                        yield data
                    except asyncio.TimeoutError:
                        # No data available yet, just continue the loop
                        if execution_task.done():
                            # If the execution task is done and no more data is coming, break
                            if progress_queue.empty():
                                break
                        continue
                
                # Get the final result from the completed task
                result = await execution_task
                
                # Send the final result
                final_data = json.dumps({
                    "type": "complete",
                    "result": result.dict(),
                    "timestamp": executor._get_timestamp()
                })
                yield f"{final_data}\n"
            except Exception as e:
                logger.exception(f"Error in workflow execution task: {e}")
                error_msg = json.dumps({
                    "type": "error",
                    "error": f"Workflow execution failed: {str(e)}",
                    "timestamp": executor._get_timestamp()
                })
                yield f"{error_msg}\n"
            
        except Exception as e:
            logger.exception(f"Error executing workflow stream: {e}")
            error_msg = json.dumps({
                "type": "error",
                "error": f"Error executing workflow: {str(e)}",
                "timestamp": executor._get_timestamp() if 'executor' in locals() else None
            })
            yield f"{error_msg}\n"
    
    return StreamingResponse(
        generate_workflow_progress(),
        media_type="text/event-stream"
    )

@router.post("/workflow/execute_step")
async def execute_workflow_step(
    request: Dict[str, Any],
    session: Session = Depends(get_session),
):
    """
    Execute a single step (node) of a workflow.
    This is useful for debugging or for progressive workflow building.
    """
    try:
        # Extract node configuration and input data
        node_config = request.get("node_config")
        node_inputs = request.get("inputs", {}) # Changed from input_data for consistency
        
        if not node_config:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Node configuration is required"
            )
            
        # Get the node type
        node_type = node_config.get("type")
        if not node_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Node type is required"
            )
        
        # Initialize workflow executor
        executor = WorkflowExecutor(debug_mode=True)
        
        # Execute based on node type
        # Use the executor's registered methods for consistency
        node_executor = executor.node_executors.get(node_type)
        
        if not node_executor:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported node type: {node_type}"
            )
        
        # Ensure node_inputs has the required structure (e.g., 'inputs' array)
        # This might need adjustment based on how _get_node_inputs structures things
        # For now, assume node_inputs is passed correctly for the specific executor
        if "inputs" not in node_inputs:
             # If only a single value was passed, wrap it in the expected structure
             if node_inputs:
                  logger.warning(f"execute_step: Wrapping raw input data into 'inputs' array for node {node_config.get('id')}")
                  node_inputs = {"inputs": [node_inputs.get("input")] if "input" in node_inputs else list(node_inputs.values())}
             else:
                  node_inputs = {"inputs": []}

        # Call the appropriate executor method
        result = await node_executor(node_config, node_inputs)
        
        # Return a consistent structure
        return {
            "node_id": node_config.get("id", "temp-node"),
            "node_type": node_type,
            "output": result # The entire output object from the executor
        }
        
    except Exception as e:
        logger.exception(f"Error executing workflow step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing workflow step: {str(e)}"
        )