from typing import Dict, List, Any, Optional, Tuple, Callable, Awaitable, AsyncGenerator, Type
import logging
import time
import json
import re
import asyncio
from datetime import datetime
from abc import ABC, abstractmethod

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


class NodeExecutor(ABC):
    """Base class for node executors."""
    
    def __init__(self, debug_mode: bool = False):
        self.debug_mode = debug_mode
    
    @abstractmethod
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the node with the given configuration and inputs."""
        pass


class ModelNodeExecutor(NodeExecutor):
    """Executes model nodes by calling the Ollama API."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a model node by calling the Ollama API directly.
        
        Args:
            node_config: The node configuration including model, model_instruction, etc.
            node_inputs: The inputs for the node, with 'inputs' array containing all inputs
                
        Returns:
            Dict[str, Any]: The outputs from the node
        """
        from ..api.generate import call_ollama_generate
        from ..api.schemas import ModelParameters

        try:
            # --- Configuration ---
            node_id = node_config.get('id', 'unknown_model_node')
            model = node_config.get("model")
            if not model:
                raise ValueError(f"Model name is required for model node '{node_id}'")
            
            # Get the base model instruction from config
            model_instruction_template = node_config.get("model_instruction", "")
            
            # Hardcoded system prompt
            system_prompt = "Follow the user's prompt exactly."
            
            # Get input array from node_inputs
            input_array = node_inputs.get("inputs", [])
            
            if self.debug_mode:
                logger.debug(f"Model node {node_id}: Received {len(input_array)} inputs. Model instruction template: '{model_instruction_template[:100]}...'")

            # Construct final user prompt
            final_user_prompt = self._construct_user_prompt(model_instruction_template, input_array, node_id)

            # Get model parameters
            model_parameters = self._get_model_parameters(node_config, node_id)
            
            if self.debug_mode:
                 logger.debug(f"Model node {node_id}: Final User Prompt: '{final_user_prompt[:500]}...'")
                 logger.debug(f"Model node {node_id}: System Prompt: '{system_prompt}'")
                 logger.debug(f"Model node {node_id}: Model: {model}, Parameters: {model_parameters.dict()}")

            # Call Ollama API
            result = await call_ollama_generate(
                model=model,
                system_prompt=system_prompt,
                user_prompt=final_user_prompt,
                template_params=model_parameters,
                template=None,
                user_prefs={},
                is_tool_calling=False
            )
            
            output_text = result.get("response", "").strip()
            
            if self.debug_mode:
                logger.debug(f"Model node {node_id}: Received response (first 100 chars): '{output_text[:100]}...'")

            # Return result with standard fields
            return {
                "output": output_text,
                "model_used": model,
                "system_prompt_used": system_prompt,
                "final_user_prompt": final_user_prompt,
                "model_instruction_template": model_instruction_template,
                "input_count": len(input_array),
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.exception(f"Error executing model node {node_config.get('id', 'unknown')}: {str(e)}")
            error_details = {
                "error": str(e),
                "node_id": node_config.get('id'),
                "model": node_config.get("model"),
                "inputs_available_count": len(node_inputs.get("inputs", [])),
            }
            return {
                 "error": f"Model execution failed: {json.dumps(error_details)}",
                 "timestamp": datetime.utcnow().isoformat()
            }
    
    def _construct_user_prompt(self, model_instruction_template: str, input_array: List[Any], node_id: str) -> str:
        """Construct the final user prompt based on the template and inputs."""
        if not input_array:
            # No inputs, use the template directly
            if self.debug_mode:
                logger.debug(f"Model node {node_id}: No inputs provided. Using model instruction template directly.")
            return model_instruction_template
            
        # Check for placeholders
        placeholders = set(re.findall(r"\{input_(\d+)\}", model_instruction_template))
        
        if placeholders:
            # Placeholders found, substitute them
            processed_prompt = model_instruction_template
            max_index_referenced = -1
            
            for idx_str in placeholders:
                try:
                    idx = int(idx_str)
                    max_index_referenced = max(max_index_referenced, idx)
                    if idx < len(input_array):
                        placeholder = f"{{input_{idx}}}"
                        input_value = str(input_array[idx])
                        processed_prompt = processed_prompt.replace(placeholder, input_value)
                    else:
                        placeholder = f"{{input_{idx}}}"
                        missing_msg = f"[MISSING INPUT {idx}]"
                        processed_prompt = processed_prompt.replace(placeholder, missing_msg)
                        logger.warning(f"Model node {node_id}: Missing input for placeholder '{placeholder}'")
                except ValueError:
                    logger.warning(f"Model node {node_id}: Invalid input index '{idx_str}' in model instruction template.")
            
            if self.debug_mode:
                logger.debug(f"Model node {node_id}: Substituted {len(placeholders)} placeholders in model instruction.")
                
            # Append any remaining inputs not referenced by placeholders
            remaining_inputs = []
            for i, val in enumerate(input_array):
                if i > max_index_referenced:
                    remaining_inputs.append(str(val))
            
            if remaining_inputs:
                appended_text = "\n\n--- Additional Inputs ---\n" + "\n".join(remaining_inputs)
                processed_prompt += appended_text
                if self.debug_mode:
                    logger.debug(f"Model node {node_id}: Appended {len(remaining_inputs)} remaining inputs not referenced by placeholders.")
            
            return processed_prompt
        else:
            # No placeholders, append all inputs
            if self.debug_mode:
                logger.debug(f"Model node {node_id}: No placeholders found. Appending all {len(input_array)} inputs to model instruction.")
            
            inputs_as_strings = [str(inp) for inp in input_array]
            appended_text = "\n\n--- Inputs ---\n" + "\n".join(inputs_as_strings)
            return model_instruction_template + appended_text
    
    def _get_model_parameters(self, node_config: Dict[str, Any], node_id: str):
        """Extract and validate model parameters from node configuration."""
        from ..api.schemas import ModelParameters
        
        model_parameters_dict = node_config.get("model_parameters")
        model_parameters = ModelParameters()  # Use defaults
        
        if model_parameters_dict and isinstance(model_parameters_dict, dict):
            try:
                # Only pass valid parameters to the Pydantic model
                valid_params = {k: v for k, v in model_parameters_dict.items() if hasattr(ModelParameters, k)}
                model_parameters = ModelParameters(**valid_params)
            except Exception as e:
                logger.warning(f"Model node {node_id}: Invalid model parameters format: {e}. Using defaults.")
        
        return model_parameters


class TemplateNodeExecutor(NodeExecutor):
    """Executes template nodes using the Dataset Forge template system."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
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
            slots = self._extract_slots(node_inputs)
                
            # Get template from database
            async with get_session_context() as session:
                # Get the template
                template = session.get(Template, template_id)
                if not template:
                    raise ValueError(f"Template with ID {template_id} not found")
                    
                # Check required slots
                self._validate_template_slots(template, slots)
                    
                # Replace slots in the template
                user_prompt = self._replace_template_slots(template.user_prompt, slots)
                    
                # Get model
                model = template.model_override
                if not model:
                    raise ValueError("Template does not have a model specified")
                    
                # Extract template-specific model parameters
                template_model_params = self._extract_template_model_params(template)
                    
                # Process system prompt with optional instruction
                system_prompt = self._process_system_prompt(template, node_config)
                
                # Call Ollama generate
                ollama_response = await call_ollama_generate(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    template=template,
                    template_params=template_model_params,
                    user_prefs={},
                    is_tool_calling=template.is_tool_calling_template,
                    tools=template.tool_definitions if template.is_tool_calling_template else None,
                )
                
                # Process response
                result = self._process_ollama_response(ollama_response, template, model, system_prompt, user_prompt, slots, template_id)
                
                return result
                
        except Exception as e:
            logger.exception(f"Error executing template node: {str(e)}")
            raise ValueError(f"Template execution failed: {str(e)}")
    
    def _extract_slots(self, node_inputs: Dict[str, Any]) -> Dict[str, str]:
        """Extract slots from node inputs."""
        slots = node_inputs.get("slots", {})
        if not slots and "seed_data" in node_inputs:
            # Try to extract from seed_data if available
            seed_data = node_inputs.get("seed_data", {})
            slots = seed_data.get("slots", {})
        return slots
    
    def _validate_template_slots(self, template, slots: Dict[str, str]):
        """Validate that all required slots are provided."""
        for slot in template.slots:
            if slot not in slots:
                raise ValueError(f"Missing value for slot '{slot}' in template")
    
    def _replace_template_slots(self, template_text: str, slots: Dict[str, str]) -> str:
        """Replace slot placeholders in template text with values."""
        result = template_text
        for slot, value in slots.items():
            pattern = "{" + slot + "}"
            result = result.replace(pattern, value)
        return result
    
    def _extract_template_model_params(self, template):
        """Extract model parameters from template."""
        from ..api.schemas import ModelParameters
        if not template.model_parameters:
            return None
            
        try:
            return ModelParameters.parse_obj(template.model_parameters)
        except Exception as e:
            logger.warning(f"Failed to parse model_parameters for template {template.id}: {e}")
            return None
    
    def _process_system_prompt(self, template, node_config: Dict[str, Any]) -> str:
        """Process system prompt with optional instruction from workflow."""
        system_prompt = template.system_prompt
        instruction = node_config.get("instruction", "")
        
        if instruction and instruction.strip():
            # Add instruction to system prompt if provided
            if "Additional instruction:" not in system_prompt:
                system_prompt = f"{template.system_prompt}\n\nAdditional instruction: {instruction.strip()}"
        
        return system_prompt
    
    def _process_ollama_response(self, ollama_response, template, model, system_prompt, user_prompt, slots, template_id):
        """Process Ollama API response."""
        from ..api.generate import extract_tool_calls_from_text
        
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


class TransformNodeExecutor(NodeExecutor):
    """Executes transform nodes that apply regex or string replacement."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
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
        output_text = self._apply_transformation(input_text, pattern, replacement, is_regex)
        
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
    
    def _apply_transformation(self, input_text: str, pattern: str, replacement: str, is_regex: bool) -> str:
        """Apply the transformation to the input text."""
        if is_regex:
            try:
                return re.sub(pattern, replacement, input_text)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {str(e)}")
        else:
            # Simple string replacement
            return input_text.replace(pattern, replacement)


class InputNodeExecutor(NodeExecutor):
    """Executes input nodes which are entry points for workflows."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an input node - passes through the template generation output.
        
        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node (contains template generation output)
            
        Returns:
            Dict[str, Any]: Just the output as a simple structure
        """
        # Extract template output from input - this should be in the slots
        template_output = node_inputs.get("slots", {}).get("template_output", "")
        
        if not template_output and "template_output" in node_inputs:
            # Direct access as fallback
            template_output = node_inputs["template_output"]
        
        # Log appropriate information
        if template_output:
            output_length = len(template_output) if isinstance(template_output, str) else 0
            logger.info(f"Input node passing through template output (length: {output_length})")
        else:
            logger.warning("Input node received no template output - using empty string")
            template_output = ""
        
        # Return a minimal clean result
        result = {
            "output": template_output,
            "_node_info": {
                "type": "input",
                "id": node_config.get("id", "input-node"),
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
        # Add debug info only in debug mode
        if self.debug_mode:
            result["_debug"] = {
                "output_length": len(template_output) if isinstance(template_output, str) else 0
            }
        
        return result


class OutputNodeExecutor(NodeExecutor):
    """Executes output nodes which finalize workflow results."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
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


class TextNodeExecutor(NodeExecutor):
    """Executes text nodes which simply return their configured text content."""
    
    async def execute(self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a text node - no inputs, just returns the text.

        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node (not used)
        Returns:
            Dict[str, Any]: The text from the node configuration
        """
        # Get the text from the node configuration
        text = node_config.get("text_content", "")
        if not text:
            logger.warning("Text node received no text - using empty string")
            text = ""

        # Return the text as output
        result = {
            "output": text,
            "_node_info": {
                "type": "text",
                "id": node_config.get("id", "text-node"),
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        # Add debug info only in debug mode
        if self.debug_mode:
            result["_debug"] = {
                "text_length": len(text) if isinstance(text, str) else 0
            }
            logger.debug(f"Text node final result length: {len(text) if isinstance(text, str) else 0}")
        return result


class WorkflowExecutor:
    """
    Executes workflows by processing nodes in the correct order based on connections.
    Supports both standard execution and streaming with progress updates.
    """
    
    def __init__(self, debug_mode: bool = False):
        self.debug_mode = debug_mode
        
        # Initialize node executors
        self.node_executors = self._initialize_node_executors()
        
        # Enable additional logging if in debug mode
        if debug_mode:
            logger.setLevel(logging.DEBUG)
            logger.debug("Workflow executor initialized in debug mode")
    
    def _initialize_node_executors(self) -> Dict[str, NodeExecutor]:
        """Initialize node executors for each node type."""
        return {
            "model": ModelNodeExecutor(self.debug_mode),
            "transform": TransformNodeExecutor(self.debug_mode),
            "input": InputNodeExecutor(self.debug_mode),
            "output": OutputNodeExecutor(self.debug_mode),
            "template": TemplateNodeExecutor(self.debug_mode),
            "text": TextNodeExecutor(self.debug_mode),
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
        
        # Validate the workflow
        if not self._validate_workflow(nodes, connections):
            return WorkflowExecutionResult(
                workflow_id=workflow_id,
                results=[],
                seed_data=seed_data,
                final_output={"output": "Invalid workflow configuration"},
                execution_time=0,
                status="error"
            )
        
        # Analyze the workflow structure
        workflow_structure = self._analyze_workflow_structure(nodes, connections)
        execution_order = workflow_structure["execution_order"]
        input_nodes = workflow_structure["input_nodes"]
        output_nodes = workflow_structure["output_nodes"]
        isolated_nodes = workflow_structure["isolated_nodes"]
        
        # Execute nodes in the determined order
        node_results, node_outputs, final_output = await self._execute_nodes_in_order(
            nodes,
            connections,
            execution_order,
            output_nodes,
            seed_data
        )
        
        # Calculate total execution time and determine overall status
        total_execution_time = time.time() - start_time
        status = self._determine_workflow_status(node_results)
        
        # Collect all output node results
        output_node_results = self._collect_output_node_results(nodes, output_nodes, node_outputs)
        
        # Create the final result
        result = WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            output_node_results=output_node_results,
            meta=workflow_structure
        )
        
        logger.info(f"Workflow execution completed in {total_execution_time:.2f}s with status: {status}")
        return result
    
    def _validate_workflow(self, nodes: Dict[str, Any], connections: List[Dict[str, Any]]) -> bool:
        """Validate that the workflow has necessary components."""
        if not connections:
            logger.warning("Workflow has no connections between nodes!")
        
        if not nodes:
            logger.warning("Workflow has no nodes!")
            return False
        
        return True
    
    def _analyze_workflow_structure(self, nodes: Dict[str, Any], connections: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze the workflow structure and determine execution order."""
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
        
        # Find isolated nodes
        isolated_nodes = self._find_isolated_nodes(nodes, dependency_graph, input_nodes)
        
        # Find the final output node
        final_node_id = self._determine_final_output_node(execution_order, output_nodes)
        
        return {
            "input_nodes": input_nodes,
            "output_nodes": output_nodes,
            "isolated_nodes": isolated_nodes,
            "execution_order": execution_order,
            "selected_output_node": final_node_id,
            "has_connections": len(connections) > 0
        }
    
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
    
    def _find_isolated_nodes(self, nodes: Dict[str, Any], dependency_graph: Dict[str, List[str]], input_nodes: List[str]) -> List[str]:
        """Find nodes that have no incoming or outgoing connections."""
        isolated_nodes = []
        for node_id in nodes:
            incoming = any(node_id in deps for deps in dependency_graph.values())
            outgoing = node_id in dependency_graph and dependency_graph[node_id]
            if not incoming and not outgoing and node_id not in input_nodes:
                isolated_nodes.append(node_id)
                logger.warning(f"Node {node_id} is isolated (no connections)")
        return isolated_nodes
    
    def _determine_final_output_node(self, execution_order: List[str], output_nodes: List[str]) -> Optional[str]:
        """Determine which node should be used as the final output node."""
        # Use the last output node in execution order, or the last node if no output nodes
        output_node_ids = [node_id for node_id in execution_order if node_id in output_nodes]
        final_node_id = output_node_ids[-1] if output_node_ids else execution_order[-1] if execution_order else None
        
        logger.info(f"Using node {final_node_id} as final output node")
        return final_node_id
    
    async def _execute_nodes_in_order(
        self,
        nodes: Dict[str, Any],
        connections: List[Dict[str, Any]],
        execution_order: List[str],
        output_nodes: List[str],
        seed_data: SeedData
    ) -> Tuple[List[NodeExecutionResult], Dict[str, Dict[str, Any]], Dict[str, Any]]:
        """Execute nodes in the determined order."""
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
        
        # Find the final output node
        final_node_id = self._determine_final_output_node(execution_order, output_nodes)
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
                self._log_node_inputs(node_id, node_config, node_inputs)
            
            # Execute the node
            node_result = await self._execute_single_node(node_id, node_config, node_inputs)
            node_results.append(node_result)
            
            # If success, store the output
            if node_result.status == "success":
                node_outputs[node_id] = node_result.output
                
                # Update final output if this is the last node
                if node_id == final_node_id:
                    final_output = node_result.output
        
        # Ensure we have a final output
        if not final_output:
            final_output = self._generate_final_output(
                nodes, node_outputs, execution_order, output_nodes, final_node_id, initial_data
            )
        
        return node_results, node_outputs, final_output
    
    def _get_node_inputs(self, node_id: str, connections: List[Dict[str, Any]], 
                        node_outputs: Dict[str, Dict[str, Any]], 
                        initial_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Determine the inputs for a node based on connections and previous outputs.
        Simplifies connection handling by collecting all inputs into an array.
        """
        # Special case for input nodes
        if node_id.startswith("input"):
            return self._get_input_node_inputs(node_id, initial_data)
        
        # For all non-input nodes
        return self._get_regular_node_inputs(node_id, connections, node_outputs)
    
    def _get_input_node_inputs(self, node_id: str, initial_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get inputs specifically for input nodes."""
        node_inputs = {}
        
        # Only input nodes get access to slots and seed data
        if "slots" in initial_data:
            node_inputs["slots"] = initial_data.get("slots", {})
        
        if "seed_data" in initial_data:
            node_inputs["seed_data"] = initial_data.get("seed_data", {})
        
        # Template output is provided to input nodes only
        if "template_output" in initial_data.get("slots", {}):
            template_output = initial_data["slots"]["template_output"]
            node_inputs["template_output"] = template_output
            node_inputs["output"] = template_output
            
            # Also provide it as first element in inputs array for consistency
            node_inputs["inputs"] = [template_output]
            
            if self.debug_mode:
                logger.debug(f"Providing template_output to input node {node_id}")
        
        return node_inputs
    
    def _get_regular_node_inputs(self, node_id: str, connections: List[Dict[str, Any]], 
                                node_outputs: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Get inputs for regular (non-input) nodes."""
        # Initialize with a simple structure
        node_inputs = {
            "inputs": []  # All inputs will be collected in this array
        }
        
        # Find connections where this node is the target
        input_connections = [
            conn for conn in connections 
            if conn.get("target_node_id") == node_id
        ]
        
        # Sort connections to ensure deterministic execution
        input_connections.sort(key=lambda x: (
            x.get("source_node_id", ""), 
            x.get("source_handle", ""),
            x.get("target_handle", "")
        ))
        
        # Add inputs from connected nodes
        connected_input = False
        for connection in input_connections:
            source_id = connection.get("source_node_id")
            source_handle = connection.get("source_handle", "output")
            
            if source_id in node_outputs:
                connected_input = True
                source_output = node_outputs[source_id]
                
                # Extract output value from source node
                output_value = self._extract_output_value(source_output, source_handle)
                    
                # Add to the inputs array
                node_inputs["inputs"].append(output_value)
                
                if self.debug_mode:
                    self._log_input_connection(source_id, source_handle, output_value, len(node_inputs["inputs"])-1)
        
        # Also add 'input' for backwards compatibility
        # Use the first input as the default 'input' value
        if node_inputs["inputs"]:
            node_inputs["input"] = node_inputs["inputs"][0]
        
        # Log a warning for non-input nodes with no connections
        if not connected_input and not input_connections:
            logger.warning(f"Node {node_id} has no input connections - it will receive no data")
        
        return node_inputs
    
    def _extract_output_value(self, source_output: Dict[str, Any], source_handle: str) -> Any:
        """Extract the output value from a source node's output."""
        output_value = None
        
        # Get output from source_handle if it exists
        if source_handle in source_output:
            output_value = source_output[source_handle]
        # Or use 'output' field as default
        elif "output" in source_output:
            output_value = source_output["output"]
        # Or use entire source output as fallback
        else:
            output_value = source_output
        
        # For string outputs, ensure proper type
        if not isinstance(output_value, str) and isinstance(output_value, dict) and "output" in output_value:
            output_value = output_value["output"]
        
        return output_value
    
    def _log_input_connection(self, source_id: str, source_handle: str, output_value: Any, index: int):
        """Log details about an input connection."""
        if isinstance(output_value, str):
            preview = output_value[:30] + "..." if len(output_value) > 30 else output_value
        else:
            preview = f"(non-string value): {type(output_value).__name__}"
        logger.debug(f"Added input from {source_id}.{source_handle} as inputs[{index}] with value: {preview}")
    
    def _log_node_inputs(self, node_id: str, node_config: Dict[str, Any], node_inputs: Dict[str, Any]):
        """Log detailed information about a node's inputs."""
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
    
    async def _execute_single_node(self, node_id: str, node_config: Dict[str, Any], 
                              node_inputs: Dict[str, Any]) -> NodeExecutionResult:
        """Execute a single node and return its result."""
        node_type = node_config.get("type")
        executor = self.node_executors.get(node_type)
        
        if not executor:
            error_msg = f"No executor found for node type: {node_type}"
            logger.error(error_msg)
            return NodeExecutionResult(
                node_id=node_id,
                node_type=node_type or "unknown",
                node_name=node_config.get("name"),
                input=node_inputs,
                output={},
                execution_time=0,
                status="error",
                error_message=error_msg
            )
        
        # Execute the node
        try:
            logger.info(f"Executing node {node_id} of type {node_type}")
            node_start_time = time.time()
            node_output = await executor.execute(node_config, node_inputs)
            node_execution_time = time.time() - node_start_time
            
            # Record the result
            return NodeExecutionResult(
                node_id=node_id,
                node_type=node_type,
                node_name=node_config.get("name"),
                input=node_inputs,
                output=node_output,
                execution_time=node_execution_time,
                status="success"
            )
            
        except Exception as e:
            logger.exception(f"Error executing node {node_id}: {str(e)}")
            node_execution_time = time.time() - node_start_time if 'node_start_time' in locals() else 0
            
            return NodeExecutionResult(
                node_id=node_id,
                node_type=node_type or "unknown",
                node_name=node_config.get("name"),
                input=node_inputs,
                output={},
                execution_time=node_execution_time,
                status="error",
                error_message=str(e)
            )
    
    def _determine_workflow_status(self, node_results: List[NodeExecutionResult]) -> str:
        """Determine the overall workflow status based on node results."""
        if all(result.status == "success" for result in node_results):
            return "success"
        elif any(result.status == "success" for result in node_results):
            return "partial_success"
        else:
            return "error"
    
    def _generate_final_output(
        self,
        nodes: Dict[str, Any],
        node_outputs: Dict[str, Dict[str, Any]],
        execution_order: List[str],
        output_nodes: List[str],
        final_node_id: Optional[str],
        initial_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate a final output when no clear output was produced."""
        final_output = {}
        
        # Try to get the output from the intended final node
        if final_node_id:
            final_output = node_outputs.get(final_node_id, {})
        
        # Try any output node if still no output
        if not final_output and output_nodes:
            for output_id in output_nodes:
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
        
        # If still no final output, provide diagnostics
        if not final_output or not final_output.get("output"):
            # Determine what went wrong
            error_message = self._generate_error_message(nodes, output_nodes, execution_order)
            
            if "template_output" in initial_data.get("slots", {}):
                final_output = {
                    "output": error_message,
                    "original_template_output": initial_data["slots"]["template_output"],
                    "_error": error_message
                }
                logger.warning(f"{error_message} - attempted to use original template output as fallback")
            else:
                final_output = {"output": error_message, "_error": error_message}
                logger.warning(error_message)
        
        return final_output
    
    def _generate_error_message(self, nodes: Dict[str, Any], output_nodes: List[str], execution_order: List[str]) -> str:
        """Generate an error message explaining what went wrong with the workflow."""
        if not execution_order:
            return "No output from workflow - No nodes could be executed. Please ensure your workflow is correctly configured."
        elif not output_nodes:
            return "No output from workflow - Missing output node. Please add an output node to your workflow."
        elif not nodes:
            return "No output from workflow - No nodes defined in the workflow."
        else:
            return "No output from workflow - Execution failed to produce a valid output."
    
    def _collect_output_node_results(
        self,
        nodes: Dict[str, Any],
        output_nodes: List[str],
        node_outputs: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """Collect results from all output nodes."""
        output_node_results = {}
        
        for node_id in output_nodes:
            if node_id in node_outputs:
                output_name = nodes.get(node_id, {}).get("name", node_id)
                output_node_results[node_id] = {
                    "name": output_name,
                    "output": node_outputs[node_id].get("output", ""),
                    "node_type": "output",
                    "node_id": node_id
                }
        
        return output_node_results
    
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
        
        # Validate the workflow
        if not self._validate_workflow(nodes, connections):
            await progress_callback("system", "error", 1.0, 
                                   NodeExecutionResult(
                                       node_id="system",
                                       node_type="system",
                                       input={},
                                       output={},
                                       execution_time=0,
                                       status="error",
                                       error_message="Invalid workflow configuration"
                                   ))
            return WorkflowExecutionResult(
                workflow_id=workflow_id,
                results=[],
                seed_data=seed_data,
                final_output={"output": "Invalid workflow configuration"},
                execution_time=0,
                status="error"
            )
        
        # Analyze the workflow structure
        workflow_structure = self._analyze_workflow_structure(nodes, connections)
        execution_order = workflow_structure["execution_order"]
        
        # Send workflow analysis info
        await progress_callback("system", "info", 0.0, 
                              NodeExecutionResult(
                                  node_id="system",
                                  node_type="system",
                                  input={},
                                  output=workflow_structure,
                                  execution_time=0,
                                  status="info"
                              ))
        
        # Send initial queued status for all nodes
        for node_id in execution_order:
            await progress_callback(node_id, "queued", 0.0)
            # Small delay to ensure messages are processed in order
            await asyncio.sleep(0.05)
        
        # Execute nodes with progress updates
        node_results, node_outputs, final_output = await self._execute_nodes_with_progress(
            nodes,
            connections,
            execution_order,
            workflow_structure["output_nodes"],
            seed_data,
            progress_callback
        )
        
        # Calculate total execution time and determine overall status
        total_execution_time = time.time() - start_time
        status = self._determine_workflow_status(node_results)
        
        # Collect all output node results
        output_node_results = self._collect_output_node_results(
            nodes, workflow_structure["output_nodes"], node_outputs
        )
        
        # Create the final result
        result = WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            output_node_results=output_node_results,
            meta=workflow_structure
        )
        
        logger.info(f"Workflow execution with progress completed in {total_execution_time:.2f}s with status: {status}")
        return result
    
    async def _execute_nodes_with_progress(
        self,
        nodes: Dict[str, Any],
        connections: List[Dict[str, Any]],
        execution_order: List[str],
        output_nodes: List[str],
        seed_data: SeedData,
        progress_callback: Callable[[str, str, float, Optional[NodeExecutionResult]], Awaitable[None]]
    ) -> Tuple[List[NodeExecutionResult], Dict[str, Dict[str, Any]], Dict[str, Any]]:
        """Execute nodes with progress updates."""
        node_results = []
        node_outputs = {}
        
        # Initialize with seed data
        initial_data = {
            "seed_data": seed_data.dict(),
            "slots": seed_data.slots
        }
        
        # Find the final output node
        final_node_id = self._determine_final_output_node(execution_order, output_nodes)
        final_output = {}
        
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
            
            # Signal 25% progress
            await progress_callback(node_id, "running", 0.25)
            await asyncio.sleep(0.1)  # Delay for visual feedback
            
            # Debug log - especially important for the input node
            if self.debug_mode:
                self._log_node_inputs(node_id, node_config, node_inputs)
            
            # Signal 50% progress
            await progress_callback(node_id, "running", 0.5)
            
            # Execute the node
            node_result = await self._execute_single_node(node_id, node_config, node_inputs)
            
            # Signal 75% progress
            await progress_callback(node_id, "running", 0.75)
            await asyncio.sleep(0.1)  # Delay for visual feedback
            
            # Store the result
            node_results.append(node_result)
            
            # If success, store the output
            if node_result.status == "success":
                node_outputs[node_id] = node_result.output
                
                # Update final output if this is the last node
                if node_id == final_node_id:
                    final_output = node_result.output
                
                # Signal completion with success
                await progress_callback(node_id, "success", 1.0, node_result)
            else:
                # Signal completion with error
                await progress_callback(node_id, "error", 1.0, node_result)
        
        # Ensure we have a final output
        if not final_output:
            final_output = self._generate_final_output(
                nodes, node_outputs, execution_order, output_nodes, final_node_id, initial_data
            )
        
        return node_results, node_outputs, final_output