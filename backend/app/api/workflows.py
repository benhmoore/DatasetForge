from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
import logging

from ..db import get_session
from ..core.security import get_current_user
from ..api.models import User, Template
from ..api.schemas import (
    WorkflowExecuteRequest, 
    WorkflowExecutionResult,
    SeedData
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
    Execute a workflow with the provided workflow definition and seed data.
    The workflow definition is provided by the client and not stored on the server.
    """
    try:
        # Extract workflow definition and seed data from request
        workflow_definition = request.get("workflow")
        seed_data_dict = request.get("seed_data")
        debug_mode = request.get("debug_mode", False)
        
        if not workflow_definition:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow definition is required"
            )
            
        if not seed_data_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Seed data is required"
            )
        
        # Convert seed data to SeedData model
        try:
            seed_data = SeedData.parse_obj(seed_data_dict)
        except Exception as e:
            logger.error(f"Error parsing seed data: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid seed data format: {str(e)}"
            )
        
        # Initialize workflow executor
        executor = WorkflowExecutor(debug_mode=debug_mode)
        
        # Generate a unique ID for this execution (not stored)
        workflow_id = workflow_definition.get("id", "temp-workflow")
        
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