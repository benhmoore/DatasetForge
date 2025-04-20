from typing import Dict, Any, AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session
import logging
import json
import asyncio

from ..db import get_session
from ..core.security import get_current_user
from ..api.models import User, Template
from ..api.schemas import (
    WorkflowExecuteRequest, 
    WorkflowExecutionResult,
    SeedData,
    NodeExecutionResult
)
from ..core.workflow_executor import WorkflowExecutor

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/workflow/execute", response_model=WorkflowExecutionResult)
async def execute_workflow(
    request: Dict[str, Any],  # Accept raw JSON to allow client-defined workflow
    user: User = Depends(get_current_user),
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
    user: User = Depends(get_current_user),
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
            input_data = request.get("input_data", {})
            seed_data_dict = request.get("seed_data", {})  # For backwards compatibility
            template_output = request.get("template_output", "")
            debug_mode = request.get("debug_mode", False)
            
            if not workflow_definition:
                error_msg = json.dumps({
                    "type": "error",
                    "error": "Workflow definition is required"
                })
                yield f"{error_msg}\n"
                return
            
            # Handle input data - first try legacy seed_data format
            if seed_data_dict and not input_data:
                try:
                    seed_data = SeedData.parse_obj(seed_data_dict)
                except Exception as e:
                    error_msg = json.dumps({
                        "type": "error",
                        "error": f"Invalid seed data format: {str(e)}"
                    })
                    yield f"{error_msg}\n"
                    return
            else:
                # Create a simplified SeedData object
                seed_data = SeedData(slots={})
                
            # Add template output to the input data and seed_data.slots
            # This ensures the input node will have access to the template output
            if template_output:
                # Store the raw template output for processing by the input node
                input_data["template_output"] = template_output
                # Also add to the root level for consistent access
                input_data["output"] = template_output
                # And add to slots for convenience
                seed_data.slots["template_output"] = template_output
                
                logger.info(f"Received template output for workflow streaming: type={type(template_output).__name__}, length={len(template_output) if isinstance(template_output, str) else 'not-string'}")
                
            # Add any input data to what we pass to the executor
            if input_data and isinstance(input_data, dict):
                for key, value in input_data.items():
                    seed_data.slots[key] = value
            
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
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Execute a single step (node) of a workflow.
    This is useful for debugging or for progressive workflow building.
    """
    try:
        # Extract node configuration and input data
        node_config = request.get("node_config")
        node_inputs = request.get("inputs", {})
        
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
        if node_type == "model":
            result = await executor._execute_model_node(node_config, node_inputs)
        elif node_type == "transform":
            result = await executor._execute_transform_node(node_config, node_inputs)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported node type: {node_type}"
            )
        
        return {
            "node_id": node_config.get("id", "temp-node"),
            "node_type": node_type,
            "output": result
        }
        
    except Exception as e:
        logger.exception(f"Error executing workflow step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing workflow step: {str(e)}"
        )