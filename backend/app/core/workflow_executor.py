from typing import Dict, List, Any, Optional, Tuple, Callable, Awaitable, AsyncGenerator
import logging
import time
import json
import re
import asyncio
from datetime import datetime

from ..api.schemas import (
    WorkflowExecutionResult,
    NodeExecutionResult,
    ModelNodeConfig,
    TransformNodeConfig,
    WorkflowExecuteRequest,
    SeedData
)

# Set up logging
logger = logging.getLogger(__name__)

class WorkflowExecutor:
    """
    Executes workflows by processing nodes in the correct order based on connections.
    Supports both standard execution and streaming with progress updates.
    """
    
    def __init__(self, debug_mode: bool = False):
        self.debug_mode = debug_mode
        # Registry of node executors mapped by node type
        self.node_executors = {
            "model": self._execute_model_node,
            "transform": self._execute_transform_node,
            "input": self._execute_input_node,
            "output": self._execute_output_node,
            "template": self._execute_template_node,
        }
    
    def _get_timestamp(self) -> str:
        """Helper method to get consistent timestamp format for progress updates."""
        return datetime.utcnow().isoformat()
    
    async def execute_workflow(self, 
                        workflow_id: str, 
                        workflow_data: Dict[str, Any], 
                        seed_data: SeedData) -> WorkflowExecutionResult:
        """
        Execute a workflow with the given seed data.
        
        Args:
            workflow_id: The ID of the workflow
            workflow_data: The workflow configuration including nodes and connections
            seed_data: The seed data for the workflow
            
        Returns:
            WorkflowExecutionResult: The results of the workflow execution
        """
        logger.info(f"Starting workflow execution for workflow {workflow_id}")
        start_time = time.time()
        
        # Extract nodes and connections
        nodes = workflow_data.get("nodes", {})
        connections = workflow_data.get("connections", [])
        
        # Build a graph of node dependencies
        # Each node's ID maps to a list of dependent node IDs
        dependency_graph = self._build_dependency_graph(nodes, connections)
        
        # Determine execution order (topological sort)
        execution_order = self._determine_execution_order(dependency_graph)
        logger.info(f"Execution order: {execution_order}")
        
        # Execute nodes in the determined order
        node_results = []
        node_outputs = {}  # Store intermediate outputs for each node
        
        # Initialize with seed data
        initial_data = {
            "seed_data": seed_data.dict(),
            "slots": seed_data.slots
        }
        
        # Track the final output node
        final_node_id = execution_order[-1] if execution_order else None
        final_output = {}
        
        for node_id in execution_order:
            node_config = nodes.get(node_id)
            if not node_config:
                logger.error(f"Node {node_id} not found in workflow configuration")
                continue
                
            # Get node inputs based on connections
            node_inputs = self._get_node_inputs(node_id, connections, node_outputs, initial_data)
            
            # Execute the node
            node_type = node_config.get("type")
            executor = self.node_executors.get(node_type)
            
            if not executor:
                error_msg = f"No executor found for node type: {node_type}"
                logger.error(error_msg)
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    input=node_inputs,
                    output={},
                    execution_time=0,
                    status="error",
                    error_message=error_msg
                )
                node_results.append(node_result)
                continue
            
            # Execute the node
            try:
                logger.info(f"Executing node {node_id} of type {node_type}")
                node_start_time = time.time()
                node_output = await executor(node_config, node_inputs)
                node_execution_time = time.time() - node_start_time
                
                # Store the output for use by downstream nodes
                node_outputs[node_id] = node_output
                
                # Update final output if this is the last node
                if node_id == final_node_id:
                    final_output = node_output
                
                # Record the result
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type,
                    input=node_inputs,
                    output=node_output,
                    execution_time=node_execution_time,
                    status="success"
                )
                node_results.append(node_result)
                
            except Exception as e:
                logger.exception(f"Error executing node {node_id}: {str(e)}")
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    input=node_inputs,
                    output={},
                    execution_time=time.time() - node_start_time,
                    status="error",
                    error_message=str(e)
                )
                node_results.append(node_result)
                # Consider whether to continue execution or stop on error
        
        total_execution_time = time.time() - start_time
        
        # Determine overall workflow status
        if all(result.status == "success" for result in node_results):
            status = "success"
        elif any(result.status == "success" for result in node_results):
            status = "partial_success"
        else:
            status = "error"
        
        logger.info(f"Workflow execution completed in {total_execution_time:.2f}s with status: {status}")
        
        return WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status
        )
    
    def _build_dependency_graph(self, nodes: Dict[str, Any], 
                               connections: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        """
        Build a graph of node dependencies based on connections.
        
        Returns:
            Dict[str, List[str]]: Keys are node IDs, values are lists of dependent node IDs
        """
        # Initialize empty lists for all nodes
        graph = {node_id: [] for node_id in nodes.keys()}
        
        # Add dependencies based on connections
        for connection in connections:
            source_id = connection.get("source_node_id")
            target_id = connection.get("target_node_id")
            
            if source_id and target_id:
                if source_id in graph:
                    graph[source_id].append(target_id)
                else:
                    graph[source_id] = [target_id]
        
        return graph
    
    def _determine_execution_order(self, dependency_graph: Dict[str, List[str]]) -> List[str]:
        """
        Determine the topological order for executing nodes.
        
        Args:
            dependency_graph: A graph of node dependencies
            
        Returns:
            List[str]: Node IDs in topological execution order
        """
        # Find nodes with no dependencies (root nodes)
        incoming_edges = {node: 0 for node in dependency_graph.keys()}
        for node, deps in dependency_graph.items():
            for dep in deps:
                if dep in incoming_edges:
                    incoming_edges[dep] += 1
                else:
                    incoming_edges[dep] = 1
        
        # Start with nodes that have no incoming edges
        execution_order = []
        queue = [node for node, count in incoming_edges.items() if count == 0]
        
        # Process queue
        while queue:
            node = queue.pop(0)
            execution_order.append(node)
            
            for dependent in dependency_graph.get(node, []):
                incoming_edges[dependent] -= 1
                if incoming_edges[dependent] == 0:
                    queue.append(dependent)
        
        # Check for cycles
        if len(execution_order) < len(dependency_graph):
            logger.warning("Cycle detected in workflow graph")
            # Add any remaining nodes (this will allow execution but might not be correct)
            for node in dependency_graph:
                if node not in execution_order:
                    execution_order.append(node)
        
        return execution_order
    
    def _get_node_inputs(self, node_id: str, connections: List[Dict[str, Any]], 
                        node_outputs: Dict[str, Dict[str, Any]], 
                        initial_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Determine the inputs for a node based on connections and previous outputs.
        
        Args:
            node_id: The ID of the node
            connections: The workflow connections
            node_outputs: The outputs from previously executed nodes
            initial_data: Initial data for the workflow
            
        Returns:
            Dict[str, Any]: The inputs for the node
        """
        # Start with initial data
        node_inputs = initial_data.copy()
        
        # Find connections where this node is the target
        input_connections = [
            conn for conn in connections 
            if conn.get("target_node_id") == node_id
        ]
        
        # Add inputs from connected nodes
        for connection in input_connections:
            source_id = connection.get("source_node_id")
            if source_id in node_outputs:
                # Use the entire output of the source node as input to this node
                # In a more advanced implementation, we might use source_handle/target_handle
                # to map specific outputs to specific inputs
                node_inputs.update(node_outputs[source_id])
        
        return node_inputs
    
    async def _execute_model_node(self, node_config: Dict[str, Any], 
                           node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a model node by calling the Ollama API directly.
        
        Args:
            node_config: The node configuration including model, system instruction, etc.
            node_inputs: The inputs for the node
            
        Returns:
            Dict[str, Any]: The outputs from the node
        """
        from ..api.generate import call_ollama_generate
        
        try:
            # Extract model parameters
            model = node_config.get("model")
            if not model:
                raise ValueError("Model node requires a model name")
                
            system_prompt = node_config.get("system_instruction", "")
            
            # Prepare user prompt - use the input value if available
            input_value = ""
            for key in ["output", "user_prompt", "text"]:
                if key in node_inputs:
                    input_value = node_inputs.get(key, "")
                    break
                    
            # If no input found, try using slots
            if not input_value and "slots" in node_inputs:
                slots_str = ", ".join([f"{k}: {v}" for k, v in node_inputs.get("slots", {}).items()])
                input_value = f"Process the following input: {slots_str}"
                
            # Get model parameters if specified
            model_parameters = None
            if node_config.get("model_parameters"):
                from ..api.schemas import ModelParameters
                model_parameters = ModelParameters.parse_obj(node_config.get("model_parameters"))
                
            # Call Ollama API
            result = await call_ollama_generate(
                model=model,
                system_prompt=system_prompt,
                user_prompt=input_value,
                template_params=model_parameters,
                template=None,  # No template used directly
                user_prefs={},  # No user prefs needed
                is_tool_calling=False  # Tool calling not supported in direct model nodes
            )
            
            # Extract response
            output_text = result.get("response", "").strip()
            
            # Return result with standard fields
            return {
                "output": output_text,
                "model": model,
                "system_prompt": system_prompt,
                "input": input_value,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.exception(f"Error executing model node: {str(e)}")
            raise ValueError(f"Model execution failed: {str(e)}")
            
    async def _execute_template_node(self, node_config: Dict[str, Any], 
                           node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a template node using the DatasetForge template system.
        
        Args:
            node_config: The node configuration including template_id
            node_inputs: The inputs for the node
            
        Returns:
            Dict[str, Any]: The outputs from the node
        """
        from ..api.generate import call_ollama_generate
        from sqlmodel import Session, select
        from ..db import get_session_context
        from ..api.models import Template
        
        try:
            # Extract template ID
            template_id = node_config.get("template_id")
            if not template_id:
                raise ValueError("Template node requires a template_id")
                
            # Get slots from input
            slots = node_inputs.get("slots", {})
            if not slots and "seed_data" in node_inputs:
                # Try to extract from seed_data if available
                seed_data = node_inputs.get("seed_data", {})
                slots = seed_data.get("slots", {})
                
            # Get template from database
            async with get_session_context() as session:
                # Get the template
                template = session.get(Template, template_id)
                if not template:
                    raise ValueError(f"Template with ID {template_id} not found")
                    
                # Check if all required slots are provided
                for slot in template.slots:
                    if slot not in slots:
                        raise ValueError(f"Missing value for slot '{slot}' in template")
                        
                # Replace slots in the template
                user_prompt = template.user_prompt
                for slot, value in slots.items():
                    pattern = "{" + slot + "}"
                    user_prompt = user_prompt.replace(pattern, value)
                    
                # Get model
                model = template.model_override
                if not model:
                    raise ValueError("Template does not have a model specified")
                    
                # Extract template-specific model parameters
                template_model_params = None
                if template.model_parameters:
                    from ..api.schemas import ModelParameters
                    try:
                        template_model_params = ModelParameters.parse_obj(template.model_parameters)
                    except Exception as e:
                        logger.warning(f"Failed to parse model_parameters for template {template.id}: {e}")
                        
                # Optional additional instruction from workflow
                instruction = node_config.get("instruction", "")
                system_prompt = template.system_prompt
                if instruction and instruction.strip():
                    # Add instruction to system prompt if provided
                    if "Additional instruction:" not in system_prompt:
                        system_prompt = f"{template.system_prompt}\n\nAdditional instruction: {instruction.strip()}"
                
                # Call Ollama generate
                ollama_response = await call_ollama_generate(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    template=template,
                    template_params=template_model_params,
                    user_prefs={},  # No user prefs needed
                    is_tool_calling=template.is_tool_calling_template,
                    tools=template.tool_definitions if template.is_tool_calling_template else None,
                )
                
                # Extract response
                output = ollama_response.get("response", "").strip()
                
                # Handle tool calls if any
                tool_calls = None
                if template.is_tool_calling_template:
                    # Check for structured tool calls
                    structured_tool_calls = ollama_response.get("tool_calls")
                    if structured_tool_calls and isinstance(structured_tool_calls, list) and len(structured_tool_calls) > 0:
                        tool_calls = structured_tool_calls
                    else:
                        # Try extracting from text
                        from ..api.generate import extract_tool_calls_from_text
                        extracted_calls = extract_tool_calls_from_text(output)
                        if extracted_calls:
                            tool_calls = extracted_calls
                
                # Return result with standard fields
                return {
                    "output": output,
                    "model": model,
                    "system_prompt": system_prompt,
                    "user_prompt": user_prompt,
                    "processed_prompt": user_prompt,
                    "slots": slots,
                    "template_id": template_id,
                    "tool_calls": tool_calls,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.exception(f"Error executing template node: {str(e)}")
            raise ValueError(f"Template execution failed: {str(e)}")
    
    async def _execute_transform_node(self, node_config: Dict[str, Any], 
                               node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a transform node that applies regex or string replacement.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node
            
        Returns:
            Dict[str, Any]: The outputs from the node
        """
        pattern = node_config.get("pattern", "")
        replacement = node_config.get("replacement", "")
        is_regex = node_config.get("is_regex", False)
        apply_to_field = node_config.get("apply_to_field", "output")
        
        # Get the text to transform
        input_text = node_inputs.get(apply_to_field, "")
        if not input_text or not isinstance(input_text, str):
            logger.warning(f"Transform node received invalid input for field {apply_to_field}")
            input_text = str(input_text) if input_text is not None else ""
        
        # Apply the transformation
        if is_regex:
            try:
                output_text = re.sub(pattern, replacement, input_text)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {str(e)}")
        else:
            # Simple string replacement
            output_text = input_text.replace(pattern, replacement)
        
        # Return the results, preserving other input fields
        result = node_inputs.copy()
        result[apply_to_field] = output_text
        result["transform_applied"] = {
            "pattern": pattern,
            "replacement": replacement,
            "is_regex": is_regex,
            "field": apply_to_field,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return result
    
    async def _execute_input_node(self, node_config: Dict[str, Any], 
                           node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an input node - passes through the initial seed data.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node (contains seed data)
            
        Returns:
            Dict[str, Any]: The seed data to pass to downstream nodes
        """
        # Simply pass through the seed data
        result = node_inputs.copy()
        result["_node_info"] = {
            "type": "input",
            "id": node_config.get("id", "input-node"),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return result
        
    async def _execute_output_node(self, node_config: Dict[str, Any], 
                            node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an output node - finalizes the workflow result.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node
            
        Returns:
            Dict[str, Any]: The final output wrapped with metadata
        """
        # Determine which field to use as the final output
        output_field = node_config.get("field", "output")
        
        # Extract the value from the specified field
        output_value = node_inputs.get(output_field, "")
        
        # Create the final result with metadata
        result = {
            "output": output_value,  # Always provide in standard field
            "original_field": output_field,
            "workflow_history": node_inputs.get("workflow_history", []),
            "_node_info": {
                "type": "output",
                "id": node_config.get("id", "output-node"),
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
        return result
    
    async def execute_workflow_with_progress(
        self,
        workflow_id: str,
        workflow_data: Dict[str, Any],
        seed_data: SeedData,
        progress_callback: Callable[[str, str, float, Optional[NodeExecutionResult]], Awaitable[None]]
    ) -> WorkflowExecutionResult:
        """
        Execute a workflow with progress updates sent via callback.
        
        Args:
            workflow_id: The ID of the workflow
            workflow_data: The workflow configuration
            seed_data: The seed data for the workflow
            progress_callback: Async callback function that receives progress updates
                Arguments: node_id, status, progress (0-1), result (optional)
                
        Returns:
            WorkflowExecutionResult: The final workflow execution result
        """
        logger.info(f"Starting workflow execution with progress for workflow {workflow_id}")
        start_time = time.time()
        
        # Extract nodes and connections
        nodes = workflow_data.get("nodes", {})
        connections = workflow_data.get("connections", [])
        
        # Build dependency graph and determine execution order
        dependency_graph = self._build_dependency_graph(nodes, connections)
        execution_order = self._determine_execution_order(dependency_graph)
        
        # Send initial queued status for all nodes
        for node_id in execution_order:
            await progress_callback(node_id, "queued", 0.0)
            # Small delay to ensure messages are processed in order
            await asyncio.sleep(0.05)
        
        # Execute nodes in order with progress updates
        node_results = []
        node_outputs = {}
        
        # Initialize with seed data
        initial_data = {
            "seed_data": seed_data.dict(),
            "slots": seed_data.slots
        }
        
        # Track the final output node
        final_node_id = execution_order[-1] if execution_order else None
        final_output = {}
        
        for index, node_id in enumerate(execution_order):
            node_config = nodes.get(node_id)
            if not node_config:
                logger.error(f"Node {node_id} not found in workflow configuration")
                await progress_callback(node_id, "error", 0.0)
                continue
            
            # Signal that node execution is starting
            await progress_callback(node_id, "running", 0.0)
            
            # Get node inputs
            node_inputs = self._get_node_inputs(node_id, connections, node_outputs, initial_data)
            
            # Get the right executor
            node_type = node_config.get("type")
            executor = self.node_executors.get(node_type)
            
            if not executor:
                error_msg = f"No executor found for node type: {node_type}"
                logger.error(error_msg)
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    input=node_inputs,
                    output={},
                    execution_time=0,
                    status="error",
                    error_message=error_msg
                )
                await progress_callback(node_id, "error", 1.0, node_result)
                node_results.append(node_result)
                continue
            
            # Execute the node with progress updates
            try:
                # Signal 25% progress
                await progress_callback(node_id, "running", 0.25)
                await asyncio.sleep(0.1)  # Delay for visual feedback
                
                node_start_time = time.time()
                
                # Signal 50% progress
                await progress_callback(node_id, "running", 0.5)
                node_output = await executor(node_config, node_inputs)
                
                # Signal 75% progress
                await progress_callback(node_id, "running", 0.75)
                await asyncio.sleep(0.1)  # Delay for visual feedback
                
                node_execution_time = time.time() - node_start_time
                
                # Store the output
                node_outputs[node_id] = node_output
                
                # Update final output if this is the last node
                if node_id == final_node_id:
                    final_output = node_output
                
                # Create and store the result
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type,
                    input=node_inputs,
                    output=node_output,
                    execution_time=node_execution_time,
                    status="success"
                )
                node_results.append(node_result)
                
                # Signal completion (100% progress)
                await progress_callback(node_id, "success", 1.0, node_result)
                
            except Exception as e:
                logger.exception(f"Error executing node {node_id}: {str(e)}")
                node_execution_time = time.time() - node_start_time
                
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    input=node_inputs,
                    output={},
                    execution_time=node_execution_time,
                    status="error",
                    error_message=str(e)
                )
                node_results.append(node_result)
                
                # Signal error
                await progress_callback(node_id, "error", 1.0, node_result)
        
        # Calculate overall execution time and status
        total_execution_time = time.time() - start_time
        
        if all(result.status == "success" for result in node_results):
            status = "success"
        elif any(result.status == "success" for result in node_results):
            status = "partial_success"
        else:
            status = "error"
        
        # Create the final result
        workflow_result = WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status
        )
        
        logger.info(f"Workflow execution with progress completed in {total_execution_time:.2f}s with status: {status}")
        
        return workflow_result