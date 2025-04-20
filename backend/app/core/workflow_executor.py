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
        
        # Enable additional logging if in debug mode
        if debug_mode:
            logger.setLevel(logging.DEBUG)
            logger.debug("Workflow executor initialized in debug mode")
    
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
        
        # Validate connections and nodes
        if not connections:
            logger.warning("Workflow has no connections between nodes!")
        
        if not nodes:
            logger.warning("Workflow has no nodes!")
            return WorkflowExecutionResult(
                workflow_id=workflow_id,
                results=[],
                seed_data=seed_data,
                final_output={"output": "Workflow contains no nodes"},
                execution_time=0,
                status="error"
            )
        
        # Analyze the graph
        # Find input and output nodes
        input_nodes = [node_id for node_id, node in nodes.items() if node.get("type") == "input"]
        output_nodes = [node_id for node_id, node in nodes.items() if node.get("type") == "output"]
        
        if not input_nodes:
            logger.warning("Workflow has no input nodes!")
        
        if not output_nodes:
            logger.warning("Workflow has no output nodes!")
        
        # Build a graph of node dependencies (directed from input to output)
        dependency_graph = self._build_dependency_graph(nodes, connections)
        
        # Check for nodes that have no incoming or outgoing connections
        isolated_nodes = []
        for node_id in nodes:
            incoming = any(node_id in deps for deps in dependency_graph.values())
            outgoing = node_id in dependency_graph and dependency_graph[node_id]
            if not incoming and not outgoing and node_id not in input_nodes:
                isolated_nodes.append(node_id)
                logger.warning(f"Node {node_id} is isolated (no connections)")
            
        # Determine execution order (topological sort)
        execution_order = self._determine_execution_order(dependency_graph)
        logger.info(f"Execution order: {execution_order}")
        
        # Execute nodes in the determined order
        node_results = []
        node_outputs = {}  # Store intermediate outputs for each node
        
        # Initialize with seed data and log for debugging
        initial_data = {
            "seed_data": seed_data.dict(),
            "slots": seed_data.slots
        }
        
        # Log initial data structure for debugging
        if self.debug_mode:
            debug_info = {
                'input_keys': list(initial_data.keys()),
                'slots': list(initial_data.get('slots', {}).keys())
            }
            
            # Add slot values with truncation for long values
            slot_values = {}
            for k, v in initial_data.get('slots', {}).items():
                if isinstance(v, str) and len(v) > 30:
                    slot_values[k] = v[:30] + '...'
                else:
                    slot_values[k] = str(v)
            debug_info['slot_values'] = slot_values
            
            logger.debug(f"Workflow initial data: {json.dumps(debug_info, indent=2)}")
        
        # Find the final output node(s) - use the last output node in execution order
        # (or the last node if no output nodes exist)
        output_node_ids = [node_id for node_id in execution_order if node_id in output_nodes]
        final_node_id = output_node_ids[-1] if output_node_ids else execution_order[-1] if execution_order else None
        
        logger.info(f"Using node {final_node_id} as final output node")
        final_output = {}
        
        for node_id in execution_order:
            node_config = nodes.get(node_id)
            if not node_config:
                logger.error(f"Node {node_id} not found in workflow configuration")
                continue
                
            # Get node inputs based on connections
            node_inputs = self._get_node_inputs(node_id, connections, node_outputs, initial_data)
            
            # Debug log - especially important for the input node
            if self.debug_mode:
                node_type = node_config.get("type", "unknown")
                if node_type == "input":
                    # For input nodes, log more detailed information
                    debug_info = {
                        'input_keys': list(node_inputs.keys()),
                        'template_output_present': 'template_output' in node_inputs,
                        'output_present': 'output' in node_inputs,
                        'slot_keys': list(node_inputs.get('slots', {}).keys())
                    }
                    
                    # Add template output type if present
                    if 'template_output' in node_inputs:
                        debug_info['template_output_type'] = type(node_inputs.get('template_output')).__name__
                    
                    logger.debug(f"Input node {node_id} received inputs: {json.dumps(debug_info, indent=2)}")
                else:
                    # For other nodes, just log the keys
                    logger.debug(f"Node {node_id} of type {node_type} received inputs with keys: {list(node_inputs.keys())}")
            
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
            
        # Ensure we have a final output
        if not final_output and final_node_id:
            # Try to get the output from the intended final node
            final_output = node_outputs.get(final_node_id, {})
            
            if not final_output and output_node_ids:
                # Try any output node
                for output_id in output_node_ids:
                    if output_id in node_outputs:
                        final_output = node_outputs[output_id]
                        logger.info(f"Using output from node {output_id} as final output")
                        break
                        
            # If still no output, try all executed nodes
            if not final_output and node_outputs:
                # Just use the last node that executed successfully
                last_node_id = next(reversed(node_outputs.keys()), None)
                if last_node_id:
                    final_output = node_outputs[last_node_id]
                    logger.info(f"Using output from node {last_node_id} as fallback final output")
        
        # If still no final output, provide diagnostics about what went wrong
        if not final_output or not final_output.get("output"):
            # Determine what went wrong with the workflow execution
            error_message = "No output from workflow"
            
            # Check for specific issues
            if not connections:
                error_message = "No output from workflow - Missing connections between nodes. Please connect your nodes."
            elif not output_nodes:
                error_message = "No output from workflow - Missing output node. Please add an output node to your workflow."
            elif isolated_nodes:
                error_message = f"No output from workflow - Detected isolated nodes: {', '.join(isolated_nodes)}. Please connect all nodes."
            
            if "template_output" in initial_data:
                final_output = {
                    "output": error_message,
                    "original_template_output": initial_data["template_output"],
                    "_error": error_message
                }
                logger.warning(f"{error_message} - attempted to use original template output as fallback")
            else:
                final_output = {"output": error_message, "_error": error_message}
                logger.warning(error_message)
        
        logger.info(f"Workflow execution completed in {total_execution_time:.2f}s with status: {status}")
        
        # Create the final result with all diagnostic information
        return WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            # Include diagnostic information in the result
            meta={
                "input_nodes": input_nodes,
                "output_nodes": output_nodes,
                "isolated_nodes": isolated_nodes,
                "execution_order": execution_order,
                "selected_output_node": final_node_id,
                "has_connections": len(connections) > 0
            }
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
        # Special case for input nodes: give them template_output directly
        if node_id.startswith("input"):
            node_inputs = {}
            if "slots" in initial_data:
                # Only input nodes get access to slots for context
                node_inputs["slots"] = initial_data.get("slots", {})
                
            if "seed_data" in initial_data:
                # Only input nodes get access to seed data
                node_inputs["seed_data"] = initial_data.get("seed_data", {})
                
            # Template output is provided to input nodes only
            if "template_output" in initial_data.get("slots", {}):
                template_output = initial_data["slots"]["template_output"]
                node_inputs["template_output"] = template_output
                node_inputs["output"] = template_output
                
                if self.debug_mode:
                    logger.debug(f"Providing template_output to input node {node_id}")
                    
            return node_inputs
        
        # For all other nodes, start with an empty dict - they get NOTHING by default
        node_inputs = {}
        
        # Find connections where this node is the target
        input_connections = [
            conn for conn in connections 
            if conn.get("target_node_id") == node_id
        ]
        
        # Add inputs from connected nodes (only if there are connections)
        connected_input = False
        for connection in input_connections:
            source_id = connection.get("source_node_id")
            source_handle = connection.get("source_handle", "output")
            target_handle = connection.get("target_handle", "input")
            
            if source_id in node_outputs:
                connected_input = True
                source_output = node_outputs[source_id]
                
                # Handle named connections - map the source handle output to the target handle input
                if source_handle and target_handle:
                    # If the source node's output has exactly this field, use it
                    if source_handle in source_output:
                        node_inputs[target_handle] = source_output[source_handle]
                        if self.debug_mode:
                            logger.debug(f"Connected {source_id}.{source_handle} → {node_id}.{target_handle}")
                    # Otherwise, try to connect the whole output object
                    else:
                        node_inputs[target_handle] = source_output
                        if self.debug_mode:
                            logger.debug(f"Connected {source_id} (whole output) → {node_id}.{target_handle}")
                # For default connections without explicit handles, use the 'output' field from source
                else:
                    if "output" in source_output:
                        node_inputs["input"] = source_output["output"]
                        if self.debug_mode:
                            logger.debug(f"Connected {source_id}.output → {node_id}.input (default connection)")
                    else:
                        # If no output field, use the entire output object
                        node_inputs["input"] = source_output
                        if self.debug_mode:
                            logger.debug(f"Connected {source_id} (whole object) → {node_id}.input (default connection)")
        
        # Log a warning for non-input nodes with no connections
        if not connected_input and not input_connections:
            logger.warning(f"Node {node_id} has no input connections - it will receive no data")
        
        return node_inputs
    
    async def _execute_model_node(self, node_config: Dict[str, Any],
                           node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a model node by calling the Ollama API directly.
        Handles multiple inputs referenced in system_instruction.
        
        Args:
            node_config: The node configuration including model, system_instruction, etc.
            node_inputs: The inputs for the node, with keys matching input handle IDs
                
        Returns:
            Dict[str, Any]: The outputs from the node
        """
        from ..api.generate import call_ollama_generate
        from ..api.schemas import ModelParameters

        try:
            # Extract model parameters
            model = node_config.get("model")
            if not model:
                raise ValueError("Model name is required for model node")
                
            # Get system instruction directly from node config
            system_instruction = node_config.get("system_instruction", "")
            
            # Get defined inputs from node config
            inputs = node_config.get("inputs", [])
            
            # Collect all input texts from connected nodes
            input_texts = {}
            for input_config in inputs:
                input_id = input_config.get("id")
                if input_id and input_id in node_inputs:
                    # Get the value from connected node output
                    value = node_inputs[input_id]
                    if not isinstance(value, str):
                        # Handle non-string inputs (convert or extract output field)
                        if isinstance(value, dict) and "output" in value:
                            value = value["output"]
                        else:
                            value = str(value)
                    
                    input_texts[input_id] = value
                    if self.debug_mode:
                        logger.debug(f"Model node {node_config.get('id')}: Using input '{input_id}' with text length {len(value)}")
            
            # If there are no inputs, log a notice and use an empty user prompt
            user_prompt = "Say hello!"
            if not input_texts:
                logger.info(f"Model node {node_config.get('id')} has no connected inputs - using empty user prompt")
                # Use empty string for user_prompt, rely only on system_instruction
            else:
                # If there is only one input, use it directly as user prompt
                if len(input_texts) == 1:
                    # With one input, use it directly as the user prompt
                    user_prompt = next(iter(input_texts.values()))
                    if self.debug_mode:
                        logger.debug(f"Model node {node_config.get('id')}: Using single input directly as user prompt")
                else:
                    # With multiple inputs, substitute them into the system instruction
                    # First check if system_instruction has placeholders
                    placeholders = set(re.findall(r"\{([^{}]+)\}", system_instruction))
                    
                    if placeholders:
                        # Prepare substitution dictionary
                        substitutions = {}
                        missing_inputs = []
                        
                        # Check for placeholders that match our input IDs
                        for placeholder in placeholders:
                            if placeholder in input_texts:
                                substitutions[placeholder] = input_texts[placeholder]
                            else:
                                missing_inputs.append(placeholder)
                                logger.warning(f"Model node {node_config.get('id')}: Missing input for placeholder '{{{placeholder}}}' referenced in system instruction")
                                substitutions[placeholder] = f"[MISSING: {placeholder}]"
                        
                        # Process system instruction - replace placeholders with input values
                        processed_system = system_instruction
                        for key, value in substitutions.items():
                            placeholder = f"{{{key}}}"
                            processed_system = processed_system.replace(placeholder, value)
                        
                        # Update system instruction with processed version
                        system_instruction = processed_system
                        
                        if self.debug_mode:
                            logger.debug(f"Model node {node_config.get('id')}: Processed system instruction with substitutions")
                    
                    # Combine any inputs not referenced in system instruction as user prompt
                    unreferenced_inputs = []
                    for input_id, text in input_texts.items():
                        if input_id not in placeholders:
                            unreferenced_inputs.append(text)
                    
                    # Join unreferenced inputs as user prompt
                    if unreferenced_inputs:
                        user_prompt = "\n\n".join(unreferenced_inputs)
                        if self.debug_mode:
                            logger.debug(f"Model node {node_config.get('id')}: Combined {len(unreferenced_inputs)} unreferenced inputs as user prompt")
            
            # Process model parameters - convert dict to ModelParameters if needed
            model_parameters = node_config.get("model_parameters")
            if model_parameters and isinstance(model_parameters, dict):
                try:
                    model_parameters = ModelParameters(**model_parameters)
                except Exception as e:
                    logger.warning(f"Invalid model parameters format: {e}. Using defaults.")
                    model_parameters = ModelParameters()
            elif not model_parameters:
                model_parameters = ModelParameters()  # Use defaults
            
            # Call Ollama API
            result = await call_ollama_generate(
                model=model,
                system_prompt=system_instruction,
                user_prompt=user_prompt,
                template_params=model_parameters,
                template=None,
                user_prefs={},
                is_tool_calling=False
            )
            
            # Extract response
            output_text = result.get("response", "").strip()
            
            # Return result with standard fields
            return {
                "output": output_text,
                "model": model,
                "system_instruction": system_instruction,
                "user_prompt": user_prompt,
                "inputs_provided": list(input_texts.keys()),
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.exception(f"Error executing model node {node_config.get('id')}: {str(e)}")
            error_details = {
                "error": str(e),
                "model": node_config.get("model"),
                "inputs_available": list(node_inputs.keys())
            }
            raise ValueError(f"Model execution failed: {json.dumps(error_details)}")

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
        Execute an input node - passes through the template generation output.
        
        The Input node is the entry point for workflows. In the frontend, the generation process
        is run as normal (with templates and the Ollama API), and the output of that process
        is provided as template_output to this node.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node (contains template generation output)
            
        Returns:
            Dict[str, Any]: The processed template output to pass to downstream nodes
        """
        if self.debug_mode:
            debug_data = {
                'keys_available': list(node_inputs.keys()),
                'slots_available': list(node_inputs.get('slots', {}).keys()),
                'has_template_output': 'template_output' in node_inputs,
                'has_output': 'output' in node_inputs
            }
            
            # Add type info separately to avoid syntax errors
            if 'template_output' in node_inputs:
                debug_data['template_output_type'] = type(node_inputs.get('template_output')).__name__
                
            logger.debug(f"Input node received raw inputs: {json.dumps(debug_data, indent=2)}")
        
        # We expect template_output to be provided directly by the frontend as a string
        # This is the output from the template+seed+model generation process
        if 'template_output' in node_inputs and isinstance(node_inputs['template_output'], str):
            # Store the template output as 'output' - the standard field for node outputs
            output_text = node_inputs['template_output']
            logger.info(f"Input node using template_output as workflow input (length: {len(output_text)})")
            
            # Make sure we have the template output in both original and standard fields
            node_inputs['output'] = output_text
            node_inputs['original_template_output'] = output_text  # Preserve the original for downstream nodes
        
        # If not found in template_output, look for it in the 'output' field
        elif 'output' in node_inputs and node_inputs['output']:
            # Output already available, nothing to do
            logger.info("Input node using existing output field")
            pass
        
        # Check other possible locations as fallbacks
        elif isinstance(node_inputs.get('template_output'), dict) and 'output' in node_inputs['template_output']:
            # If template_output is a dict with output field, use that
            node_inputs['output'] = node_inputs['template_output']['output']
            logger.info(f"Using template_output.output as the input to workflow")
        
        elif 'generation_output' in node_inputs:
            # Try to use generation_output as fallback
            node_inputs['output'] = node_inputs['generation_output']
            logger.info(f"Using generation_output as fallback for workflow input")
        
        else:
            # Ensure we have an output field, even if empty
            logger.warning("Input node received no template output data - using empty string")
            node_inputs['output'] = ""
        
        # Mark the source as the input node
        result = node_inputs.copy()
        result["_node_info"] = {
            "type": "input",
            "id": node_config.get("id", "input-node"),
            "source": "template_output",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Add more detailed debug info
        if self.debug_mode:
            output_value = result.get('output', '')
            
            # Prepare a preview of the output
            if isinstance(output_value, str):
                if len(output_value) > 100:
                    output_preview = output_value[:100] + '...'
                else:
                    output_preview = output_value
            else:
                output_preview = str(output_value)
            
            # Determine the input source
            if isinstance(node_inputs.get('template_output'), str):
                input_source = "direct_template_output"
            elif isinstance(node_inputs.get('template_output'), dict):
                input_source = "object_template_output"
            elif 'output' in node_inputs:
                input_source = "output_field"
            elif 'generation_output' in node_inputs:
                input_source = "generation_output"
            else:
                input_source = "none"
            
            # Create the debug info object
            debug_info = {
                "input_source": input_source,
                "output_length": len(output_value) if isinstance(output_value, str) else 0,
                "output_preview": output_preview
            }
            
            # Add type info separately to avoid syntax errors
            if 'template_output' in node_inputs:
                debug_info["template_output_type"] = type(node_inputs.get('template_output')).__name__
            
            result["_debug"] = debug_info
            logger.debug(f"Input node producing output: {json.dumps(debug_info, indent=2)}")
        
        return result
        
    async def _execute_output_node(self, node_config: Dict[str, Any], 
                            node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an output node - finalizes the workflow result.
        The output node simply takes whatever was passed to its input.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node
            
        Returns:
            Dict[str, Any]: The final output wrapped with metadata
        """
        # Debug log the available inputs
        if self.debug_mode:
            debug_info = {
                'available_fields': list(node_inputs.keys()),
                'has_input': 'input' in node_inputs,
            }
            
            # Add preview of the input if available
            if 'input' in node_inputs:
                input_value = node_inputs.get('input')
                if isinstance(input_value, str):
                    debug_info['input_preview'] = input_value[:100] + ('...' if len(input_value) > 100 else '')
                    debug_info['input_length'] = len(input_value)
            
            logger.debug(f"Output node inputs: {json.dumps(debug_info, indent=2)}")
        
        # Extract the input value - what was passed to this node's input
        output_value = node_inputs.get('input', "")
        
        # If no input was provided, log a warning and use empty string
        if not output_value:
            logger.warning(f"Output node received no input. Using empty string.")
            output_value = ""
        
        # Create the final result with metadata
        result = {
            "output": output_value,  # Always provide in standard field
            "workflow_history": node_inputs.get("workflow_history", []),
            "_node_info": {
                "type": "output",
                "id": node_config.get("id", "output-node"),
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
        # Add debug info to the result for troubleshooting
        if self.debug_mode:
            result["_debug"] = {
                "input_length": len(output_value) if isinstance(output_value, str) else 0,
                "input_keys": list(node_inputs.keys())
            }
            logger.debug(f"Output node final result length: {len(output_value) if isinstance(output_value, str) else 0}")
        
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
        
        # Validate connections and nodes
        if not connections:
            logger.warning("Workflow has no connections between nodes!")
            await progress_callback("system", "error", 1.0, 
                                   NodeExecutionResult(
                                       node_id="system",
                                       node_type="system",
                                       input={},
                                       output={},
                                       execution_time=0,
                                       status="error",
                                       error_message="Workflow has no connections between nodes"
                                   ))
        
        if not nodes:
            logger.warning("Workflow has no nodes!")
            error_result = WorkflowExecutionResult(
                workflow_id=workflow_id,
                results=[],
                seed_data=seed_data,
                final_output={"output": "Workflow contains no nodes"},
                execution_time=0,
                status="error"
            )
            await progress_callback("system", "error", 1.0)
            return error_result
        
        # Analyze the graph
        # Find input and output nodes
        input_nodes = [node_id for node_id, node in nodes.items() if node.get("type") == "input"]
        output_nodes = [node_id for node_id, node in nodes.items() if node.get("type") == "output"]
        
        if not input_nodes:
            logger.warning("Workflow has no input nodes!")
        
        if not output_nodes:
            logger.warning("Workflow has no output nodes!")
            
        # Build dependency graph and determine execution order
        dependency_graph = self._build_dependency_graph(nodes, connections)
        execution_order = self._determine_execution_order(dependency_graph)
        
        # Check for isolated nodes
        isolated_nodes = []
        for node_id in nodes:
            incoming = any(node_id in deps for deps in dependency_graph.values())
            outgoing = node_id in dependency_graph and dependency_graph[node_id]
            if not incoming and not outgoing and node_id not in input_nodes:
                isolated_nodes.append(node_id)
                logger.warning(f"Node {node_id} is isolated (no connections)")
                
        # Send this information to the client
        await progress_callback("system", "info", 0.0, 
                              NodeExecutionResult(
                                  node_id="system",
                                  node_type="system",
                                  input={},
                                  output={
                                      "input_nodes": input_nodes,
                                      "output_nodes": output_nodes,
                                      "isolated_nodes": isolated_nodes,
                                      "execution_order": execution_order
                                  },
                                  execution_time=0,
                                  status="info"
                              ))
        
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
        
        # Log initial data structure for debugging
        if self.debug_mode:
            debug_info = {
                'input_keys': list(initial_data.keys()),
                'slots': list(initial_data.get('slots', {}).keys()),
                'template_output_exists': 'template_output' in initial_data.get('slots', {}),
                'output_exists': 'output' in initial_data.get('slots', {})
            }
            logger.debug(f"Workflow progress execution initial data: {json.dumps(debug_info, indent=2)}")
        
        # Find the final output node(s) - use the last output node in execution order
        # (or the last node if no output nodes exist)
        output_node_ids = [node_id for node_id in execution_order if node_id in output_nodes]
        final_node_id = output_node_ids[-1] if output_node_ids else execution_order[-1] if execution_order else None
        
        logger.info(f"Using node {final_node_id} as final output node")
        final_output = {}
        
        # Fixed loop: iterate through execution_order which is a list of node IDs
        for node_id in execution_order:
            node_config = nodes.get(node_id)
            if not node_config:
                logger.error(f"Node {node_id} not found in workflow configuration")
                await progress_callback(node_id, "error", 0.0)
                continue
            
            # Signal that node execution is starting
            await progress_callback(node_id, "running", 0.0)
            
            # Get node inputs
            node_inputs = self._get_node_inputs(node_id, connections, node_outputs, initial_data)
            
            # Debug log - especially important for the input node
            if self.debug_mode:
                node_type = node_config.get("type", "unknown")
                if node_type == "input":
                    # For input nodes, log more detailed information
                    debug_info = {
                        'input_keys': list(node_inputs.keys()),
                        'template_output_present': 'template_output' in node_inputs,
                        'output_present': 'output' in node_inputs,
                        'slot_keys': list(node_inputs.get('slots', {}).keys())
                    }
                    
                    # Add template output type if present
                    if 'template_output' in node_inputs:
                        debug_info['template_output_type'] = type(node_inputs.get('template_output')).__name__
                    
                    logger.debug(f"Input node {node_id} [streaming] received inputs: {json.dumps(debug_info, indent=2)}")
                else:
                    # For other nodes, just log the keys
                    logger.debug(f"Node {node_id} of type {node_type} [streaming] received inputs with keys: {list(node_inputs.keys())}")
            
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
                node_execution_time = time.time() - node_start_time if 'node_start_time' in locals() else 0
                
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
            
        # Ensure we have a final output
        if not final_output and final_node_id:
            # Try to get the output from the intended final node
            final_output = node_outputs.get(final_node_id, {})
            
            if not final_output and output_node_ids:
                # Try any output node
                for output_id in output_node_ids:
                    if output_id in node_outputs:
                        final_output = node_outputs[output_id]
                        logger.info(f"Using output from node {output_id} as final output")
                        break
                        
            # If still no output, try all executed nodes
            if not final_output and node_outputs:
                # Just use the last node that executed successfully
                last_node_id = next(reversed(node_outputs.keys()), None)
                if last_node_id:
                    final_output = node_outputs[last_node_id]
                    logger.info(f"Using output from node {last_node_id} as fallback final output")
        
        # If still no final output, provide diagnostics about what went wrong
        if not final_output or not final_output.get("output"):
            # Determine what went wrong with the workflow execution
            error_message = "No output from workflow"
            
            # Check for specific issues
            if not connections:
                error_message = "No output from workflow - Missing connections between nodes. Please connect your nodes."
            elif not output_nodes:
                error_message = "No output from workflow - Missing output node. Please add an output node to your workflow."
            elif isolated_nodes:
                error_message = f"No output from workflow - Detected isolated nodes: {', '.join(isolated_nodes)}. Please connect all nodes."
            
            if "template_output" in initial_data:
                final_output = {
                    "output": error_message,
                    "original_template_output": initial_data["template_output"],
                    "_error": error_message
                }
                logger.warning(f"{error_message} - attempted to use original template output as fallback")
            else:
                final_output = {"output": error_message, "_error": error_message}
                logger.warning(error_message)
        
        # Create the final result with all diagnostic information
        workflow_result = WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            # Include diagnostic information in the result
            meta={
                "input_nodes": input_nodes,
                "output_nodes": output_nodes,
                "isolated_nodes": isolated_nodes,
                "execution_order": execution_order,
                "selected_output_node": final_node_id,
                "has_connections": len(connections) > 0
            }
        )
        
        logger.info(f"Workflow execution with progress completed in {total_execution_time:.2f}s with status: {status}")
        
        return workflow_result