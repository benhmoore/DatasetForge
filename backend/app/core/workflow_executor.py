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
    SeedData,
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
            "prompt": self._execute_prompt_node,  # Add the prompt node executor
            "transform": self._execute_transform_node,
            "filter": self._execute_filter_node,  # Add filter node executor
            "input": self._execute_input_node,
            "output": self._execute_output_node,
            "template": self._execute_template_node,
            "prompt": self._execute_prompt_node,
        }

        # Enable additional logging if in debug mode
        if debug_mode:
            logger.setLevel(logging.DEBUG)
            logger.debug("Workflow executor initialized in debug mode")

    def _get_timestamp(self) -> str:
        """Helper method to get consistent timestamp format for progress updates."""
        return datetime.utcnow().isoformat()

    async def execute_workflow(
        self, workflow_id: str, workflow_data: Dict[str, Any], seed_data: SeedData
    ) -> WorkflowExecutionResult:
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
                status="error",
            )

        # Analyze the graph
        # Find input and output nodes
        input_nodes = [
            node_id for node_id, node in nodes.items() if node.get("type") == "input"
        ]
        output_nodes = [
            node_id for node_id, node in nodes.items() if node.get("type") == "output"
        ]

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
        initial_data = {"seed_data": seed_data.dict(), "slots": seed_data.slots}

        # Log initial data structure for debugging
        if self.debug_mode:
            debug_info = {
                "input_keys": list(initial_data.keys()),
                "slots": list(initial_data.get("slots", {}).keys()),
            }

            # Add slot values with truncation for long values
            slot_values = {}
            for k, v in initial_data.get("slots", {}).items():
                if isinstance(v, str) and len(v) > 30:
                    slot_values[k] = v[:30] + "..."
                else:
                    slot_values[k] = str(v)
            debug_info["slot_values"] = slot_values

            logger.debug(f"Workflow initial data: {json.dumps(debug_info, indent=2)}")

        # Find the final output node(s) - use the last output node in execution order
        # (or the last node if no output nodes exist)
        output_node_ids = [
            node_id for node_id in execution_order if node_id in output_nodes
        ]
        final_node_id = (
            output_node_ids[-1]
            if output_node_ids
            else execution_order[-1] if execution_order else None
        )

        logger.info(f"Using node {final_node_id} as final output node")
        final_output = {}

        for node_id in execution_order:
            node_config = nodes.get(node_id)
            if not node_config:
                logger.error(f"Node {node_id} not found in workflow configuration")
                continue

            # Get node inputs based on connections
            node_inputs = self._get_node_inputs(
                node_id, connections, node_outputs, initial_data
            )

            # Debug log - especially important for the input node
            if self.debug_mode:
                node_type = node_config.get("type", "unknown")
                if node_type == "input":
                    # For input nodes, log more detailed information
                    debug_info = {
                        "input_keys": list(node_inputs.keys()),
                        "template_output_present": "template_output" in node_inputs,
                        "output_present": "output" in node_inputs,
                        "slot_keys": list(node_inputs.get("slots", {}).keys()),
                    }

                    # Add template output type if present
                    if "template_output" in node_inputs:
                        debug_info["template_output_type"] = type(
                            node_inputs.get("template_output")
                        ).__name__

                    logger.debug(
                        f"Input node {node_id} received inputs: {json.dumps(debug_info, indent=2)}"
                    )
                else:
                    # For other nodes, just log the keys
                    logger.debug(
                        f"Node {node_id} of type {node_type} received inputs with keys: {list(node_inputs.keys())}"
                    )

            # Execute the node
            node_type = node_config.get("type")
            executor = self.node_executors.get(node_type)

            if not executor:
                error_msg = f"No executor found for node type: {node_type}"
                logger.error(error_msg)
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output={},
                    execution_time=0,
                    status="error",
                    error_message=error_msg,
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
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output=node_output,
                    execution_time=node_execution_time,
                    status="success",
                )
                node_results.append(node_result)

            except Exception as e:
                logger.exception(f"Error executing node {node_id}: {str(e)}")
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output={},
                    execution_time=time.time() - node_start_time,
                    status="error",
                    error_message=str(e),
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
                        logger.info(
                            f"Using output from node {output_id} as final output"
                        )
                        break

            # If still no output, try all executed nodes
            if not final_output and node_outputs:
                # Just use the last node that executed successfully
                last_node_id = next(reversed(node_outputs.keys()), None)
                if last_node_id:
                    final_output = node_outputs[last_node_id]
                    logger.info(
                        f"Using output from node {last_node_id} as fallback final output"
                    )

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
                    "_error": error_message,
                }
                logger.warning(
                    f"{error_message} - attempted to use original template output as fallback"
                )
            else:
                final_output = {"output": error_message, "_error": error_message}
                logger.warning(error_message)

        # Collect all output node results
        output_node_results = {}
        for node_id in output_nodes:
            if node_id in node_outputs:
                output_name = nodes.get(node_id, {}).get("name", node_id)
                output_node_results[node_id] = {
                    "name": output_name,
                    "output": node_outputs[node_id].get("output", ""),
                    "node_type": "output",
                    "node_id": node_id,
                }

        # Still select one as the "primary" output for backward compatibility
        if output_node_ids:
            final_node_id = output_node_ids[-1]
            final_output = node_outputs.get(final_node_id, {})
        else:
            final_output = {}

        logger.info(
            f"Workflow execution completed in {total_execution_time:.2f}s with status: {status}"
        )

        # Create the final result with all diagnostic information
        return WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            output_node_results=output_node_results,  # Add this field
            meta={
                "input_nodes": input_nodes,
                "output_nodes": output_nodes,
                "isolated_nodes": isolated_nodes,
                "execution_order": execution_order,
                "selected_output_node": final_node_id,
                "has_connections": len(connections) > 0,
            },
        )

    def _build_dependency_graph(
        self, nodes: Dict[str, Any], connections: List[Dict[str, Any]]
    ) -> Dict[str, List[str]]:
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

    def _determine_execution_order(
        self, dependency_graph: Dict[str, List[str]]
    ) -> List[str]:
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

    def _get_node_inputs(
        self,
        node_id: str,
        connections: List[Dict[str, Any]],
        node_outputs: Dict[str, Dict[str, Any]],
        initial_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Determine the inputs for a node based on connections and previous outputs.
        Simplifies connection handling by collecting all inputs into an array.
        Enhanced with better error handling for None values.
        Now supports named inputs via input_map.

        Args:
            node_id: The ID of the node
            connections: The workflow connections
            node_outputs: The outputs from previously executed nodes
            initial_data: Initial data for the workflow

        Returns:
            Dict[str, Any]: The inputs for the node, with:
                - 'inputs' key containing an array of all inputs (positional)
                - 'input_map' key containing a map of slot names to values (named)
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

                # Also provide it as first element in inputs array for consistency
                node_inputs["inputs"] = [template_output]
                # Initialize the input_map for named inputs
                node_inputs["input_map"] = {"template_output": template_output}

                if self.debug_mode:
                    logger.debug(f"Providing template_output to input node {node_id}")

            return node_inputs

        # For all non-input nodes, initialize with a simple structure
        node_inputs = {
            "inputs": [],  # All inputs will be collected in this array (positional)
            "input_map": {}  # Named inputs will be collected in this map
        }

        # Find connections where this node is the target
        input_connections = [
            conn for conn in connections if conn.get("target_node_id") == node_id
        ]

        # Sort connections to ensure deterministic execution
        # This ensures inputs are ordered consistently
        input_connections.sort(
            key=lambda x: (
                x.get("source_node_id", ""),
                x.get("source_handle", ""),
                x.get("target_handle", ""),
            )
        )

        # Add inputs from connected nodes
        connected_input = False
        for connection in input_connections:
            source_id = connection.get("source_node_id")
            source_handle = connection.get("source_handle", "output")
            target_handle = connection.get("target_handle", "input_0")
            target_slot = connection.get("target_slot")  # Get the slot name if available

            if source_id in node_outputs:
                connected_input = True
                source_output = node_outputs[source_id]

                # Safety check for None source_output
                if source_output is None:
                    logger.warning(
                        f"Node {source_id} produced None output, using empty dict instead"
                    )
                    source_output = {}

                # Extract output value from source node
                output_value = None

                # Get output from source_handle if it exists
                if isinstance(source_output, dict) and source_handle in source_output:
                    output_value = source_output[source_handle]
                # Or use 'output' field as default
                elif isinstance(source_output, dict) and "output" in source_output:
                    output_value = source_output["output"]
                # Or use entire source output as fallback
                else:
                    output_value = source_output

                # Safety check for None output_value
                if output_value is None:
                    logger.warning(
                        f"Node {source_id}.{source_handle} produced None value, using empty string instead"
                    )
                    output_value = ""

                # For string outputs, ensure proper type
                if (
                    not isinstance(output_value, str)
                    and isinstance(output_value, dict)
                    and "output" in output_value
                ):
                    output_value = output_value["output"]
                    # Another safety check for None
                    if output_value is None:
                        output_value = ""

                # Add to the inputs array (positional)
                node_inputs["inputs"].append(output_value)
                
                # Add to input_map using the slot name from the connection or target handle
                if target_slot:
                    # Use the explicit slot name from the connection if available
                    slot_name = target_slot
                    node_inputs["input_map"][slot_name] = output_value
                    if self.debug_mode:
                        logger.debug(
                            f"Added input from {source_id}.{source_handle} to named slot '{slot_name}'"
                        )
                elif target_handle.startswith("input_"):
                    # Extract the slot name from the target handle
                    slot_name = target_handle.replace("input_", "")
                    if slot_name != "default" and not slot_name.isdigit():
                        # This is a named slot in the handle ID
                        node_inputs["input_map"][slot_name] = output_value
                        if self.debug_mode:
                            logger.debug(
                                f"Added input from {source_id}.{source_handle} to named slot '{slot_name}' (from handle)"
                            )
                    else:
                        # Add using the target handle as-is for backward compatibility
                        node_inputs["input_map"][target_handle] = output_value

                if self.debug_mode:
                    if isinstance(output_value, str):
                        preview = (
                            output_value[:30] + "..."
                            if len(output_value) > 30
                            else output_value
                        )
                    else:
                        preview = f"(non-string value): {type(output_value).__name__}"
                    logger.debug(
                        f"Added input from {source_id}.{source_handle} as inputs[{len(node_inputs['inputs'])-1}] with value: {preview}"
                    )

        # Also add 'input' for backwards compatibility
        # Use the first input as the default 'input' value
        if node_inputs["inputs"]:
            node_inputs["input"] = node_inputs["inputs"][0]
        else:
            # Ensure there's always at least an empty string for input
            node_inputs["input"] = ""
            node_inputs["inputs"] = [""]

        # Log a warning for non-input nodes with no connections
        if not connected_input and not input_connections:
            logger.warning(
                f"Node {node_id} has no input connections - it will receive no data"
            )

        return node_inputs

    async def _execute_model_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a model node by calling the Ollama API directly.
        Expects system_prompt and user_prompt as inputs.

        Args:
            node_config: The node configuration including model and model_parameters
            node_inputs: The inputs for the node, with system_prompt and user_prompt

        Returns:
            Dict[str, Any]: The outputs from the node
        """
        from ..api.generate import call_ollama_generate
        from ..api.schemas import ModelParameters

        try:
            # --- Configuration ---
            node_id = node_config.get("id", "unknown_model_node")
            model = node_config.get("model")
            if not model:
                error_msg = f"No model selected for node '{node_id}'. Please select a model in the workflow editor."
                logger.warning(error_msg)
                return {
                    "output": error_msg,
                    "error": "model_missing",
                    "timestamp": self._get_timestamp(),
                }

            # Get input map for named input access
            input_map = node_inputs.get("input_map", {})

            # Get system prompt and user prompt from inputs
            system_prompt = ""
            user_prompt = ""

            # Try different ways to find the system prompt
            if "system_prompt" in input_map:
                system_prompt = str(input_map["system_prompt"])
            elif "input_system_prompt" in input_map:
                system_prompt = str(input_map["input_system_prompt"])

            # Try different ways to find the user prompt
            if "user_prompt" in input_map:
                user_prompt = str(input_map["user_prompt"])
            elif "input_user_prompt" in input_map:
                user_prompt = str(input_map["input_user_prompt"])

            # If no system prompt provided, use a default
            if not system_prompt:
                system_prompt = "Follow the user's prompt exactly."
                if self.debug_mode:
                    logger.debug(f"Model node {node_id}: Using default system prompt")

            # Must have a user prompt
            if not user_prompt:
                # Try to use the first input as a fallback
                if len(node_inputs.get("inputs", [])) > 0:
                    user_prompt = str(node_inputs["inputs"][0])
                    if self.debug_mode:
                        logger.debug(f"Model node {node_id}: Using first input as user prompt")
                else:
                    error_msg = f"No user prompt provided to model node '{node_id}'."
                    logger.warning(error_msg)
                    return {
                        "output": error_msg,
                        "error": "missing_user_prompt",
                        "timestamp": self._get_timestamp(),
                    }

            if self.debug_mode:
                logger.debug(
                    f"Model node {node_id}: System prompt: '{system_prompt[:100]}...'"
                )
                logger.debug(
                    f"Model node {node_id}: User prompt: '{user_prompt[:100]}...'"
                )

            # --- Model Parameters ---
            model_parameters_dict = node_config.get("model_parameters")
            model_parameters = ModelParameters()  # Use defaults
            if model_parameters_dict and isinstance(model_parameters_dict, dict):
                try:
                    # Only pass valid parameters to the Pydantic model
                    valid_params = {
                        k: v
                        for k, v in model_parameters_dict.items()
                        if hasattr(ModelParameters, k)
                    }
                    model_parameters = ModelParameters(**valid_params)
                except Exception as e:
                    logger.warning(
                        f"Model node {node_id}: Invalid model parameters format: {e}. Using defaults."
                    )

            # --- Call Ollama API ---
            result = await call_ollama_generate(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                template_params=model_parameters,
                template=None,  # Not used directly here
                user_prefs={},  # Not used here
                is_tool_calling=False,  # Not used here
            )

            output_text = result.get("response", "").strip()

            if self.debug_mode:
                logger.debug(
                    f"Model node {node_id}: Received response (first 100 chars): '{output_text[:100]}...'"
                )

            # Return result with standard fields
            return {
                "output": output_text,
                "model_used": model,
                "system_prompt_used": system_prompt,
                "user_prompt_used": user_prompt,
                "timestamp": self._get_timestamp(),
            }

        except Exception as e:
            logger.exception(
                f"Error executing model node {node_config.get('id', 'unknown')}: {str(e)}"
            )
            error_details = {
                "error": str(e),
                "node_id": node_config.get("id"),
                "model": node_config.get("model"),
                "inputs_available_count": len(node_inputs.get("inputs", [])),
            }
            error_message = f"Model execution failed: {json.dumps(error_details)}"
            # Avoid raising, return error structure with the error in the output field
            # This ensures compatibility with components expecting a string output
            return {
                "output": error_message,  # Put error in output for rendering
                "error": error_message,
                "timestamp": self._get_timestamp(),
            }

    async def _execute_prompt_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a prompt node that processes a template with variable slots.

        Args:
            node_config: The node configuration including prompt_text
            node_inputs: The inputs for the node, with 'inputs' array containing all inputs

        Returns:
            Dict[str, Any]: The processed prompt text with slots filled
        """
        try:
            # Get the prompt template from config
            prompt_text = node_config.get("prompt_text", "")
            node_id = node_config.get("id", "unknown_prompt_node")

            if not prompt_text:
                logger.warning(f"Prompt node {node_id} has no prompt text")
                return {
                    "output": "",
                    "error": "missing_prompt_text",
                    "timestamp": self._get_timestamp()
                }

            # Get input map (named inputs) from node_inputs
            input_map = node_inputs.get("input_map", {})

            # Process all placeholder slots in the prompt text
            processed_prompt = prompt_text

            # Match all placeholders {slot_name} in the prompt text
            slot_pattern = r"\{([^{}]+)\}"
            slots = re.findall(slot_pattern, prompt_text)

            # Track which slots were found in inputs
            filled_slots = []
            missing_slots = []

            # Replace each slot with its corresponding input value
            for slot in slots:
                placeholder = f"{{{slot}}}"

                # Check if this slot has a value in input_map
                if slot in input_map:
                    value = str(input_map[slot])
                    processed_prompt = processed_prompt.replace(placeholder, value)
                    filled_slots.append(slot)
                else:
                    # Mark missing slots in the output
                    processed_prompt = processed_prompt.replace(
                        placeholder, f"[MISSING: {slot}]"
                    )
                    missing_slots.append(slot)
                    logger.warning(f"Prompt node {node_id}: No value provided for slot '{slot}'")

            if self.debug_mode:
                logger.debug(
                    f"Prompt node {node_id}: Processed {len(filled_slots)} slots. "
                    f"Missing slots: {missing_slots}"
                )

            # Return the processed prompt and metadata
            return {
                "output": processed_prompt,
                "original_template": prompt_text,
                "filled_slots": filled_slots,
                "missing_slots": missing_slots,
                "timestamp": self._get_timestamp(),
            }

        except Exception as e:
            logger.exception(f"Error executing prompt node {node_config.get('id', 'unknown')}: {str(e)}")
            return {
                "output": f"Error in prompt node: {str(e)}",
                "error": str(e),
                "timestamp": self._get_timestamp()
            }

    async def _execute_template_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
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
                        template_model_params = ModelParameters.parse_obj(
                            template.model_parameters
                        )
                    except Exception as e:
                        logger.warning(
                            f"Failed to parse model_parameters for template {template.id}: {e}"
                        )

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
                    tools=(
                        template.tool_definitions
                        if template.is_tool_calling_template
                        else None
                    ),
                )

                # Extract response
                output = ollama_response.get("response", "").strip()

                # Handle tool calls if any
                tool_calls = None
                if template.is_tool_calling_template:
                    # Check for structured tool calls
                    structured_tool_calls = ollama_response.get("tool_calls")
                    if (
                        structured_tool_calls
                        and isinstance(structured_tool_calls, list)
                        and len(structured_tool_calls) > 0
                    ):
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
                    "timestamp": datetime.utcnow().isoformat(),
                }

        except Exception as e:
            logger.exception(f"Error executing template node: {str(e)}")
            raise ValueError(f"Template execution failed: {str(e)}")

    async def _execute_transform_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a transform node that applies regex or string replacement.
        Enhanced to handle different transformation types and input formats.
        Simplified to only operate on the direct input, not other fields.

        Args:
            node_config: The node configuration
            node_inputs: The inputs for the node

        Returns:
            Dict[str, Any]: The outputs from the node
        """
        pattern = node_config.get("pattern", "")
        replacement = node_config.get("replacement", "")
        is_regex = node_config.get("is_regex", False)
        transform_type = node_config.get(
            "transform_type", "replace"
        )  # Get transform type
        case_sensitive = node_config.get(
            "case_sensitive", True
        )  # Get case sensitivity flag

        # Simplified approach: always use the direct input from "input" field
        # This makes the node's behavior more predictable
        input_text = node_inputs.get("input", "")

        logger.info(f"Executing on node with inputs: {node_inputs}")

        # Ensure input is always a string
        if not isinstance(input_text, str):
            if input_text is None:
                logger.warning(
                    "Transform node received None input - using empty string"
                )
                input_text = ""
            else:
                try:
                    # For dicts/lists, use JSON representation
                    if isinstance(input_text, (dict, list)):
                        import json

                        input_text = json.dumps(input_text)
                    else:
                        input_text = str(input_text)
                    logger.info(
                        f"Transform node converted non-string input to string (type: {type(input_text).__name__})"
                    )
                except Exception as e:
                    logger.error(
                        f"Transform node could not convert input to string: {e}"
                    )
                    input_text = str(input_text)

        # Apply the appropriate transformation based on type
        output_text = input_text
        try:
            if transform_type == "replace" or (transform_type == "regex" and is_regex):

                logger.info(
                    f"Transform node {node_config.get('id', 'unknown')} applying replacement: '{pattern}' -> '{replacement}'"
                )
                logger.info(f"Case sensitivity: {case_sensitive}, is_regex: {is_regex}")

                # Apply regex or string replacement
                if pattern:
                    if transform_type == "regex" or is_regex:
                        # Use regex pattern with appropriate flags
                        flags = 0
                        if not case_sensitive:
                            import re

                            flags = re.IGNORECASE
                        output_text = re.sub(
                            pattern, replacement, input_text, flags=flags
                        )
                    else:
                        # Simple string replacement
                        if case_sensitive:
                            # Standard case-sensitive replacement
                            output_text = input_text.replace(pattern, replacement)
                        else:
                            # Case-insensitive replacement using regex for non-regex mode
                            import re

                            # Escape any regex special characters in the pattern
                            escaped_pattern = re.escape(pattern)
                            # Use regex with IGNORECASE flag for case-insensitive replacement
                            output_text = re.sub(
                                escaped_pattern,
                                replacement,
                                input_text,
                                flags=re.IGNORECASE,
                            )

            elif transform_type == "trim":
                # Trim whitespace
                output_text = input_text.strip()

            elif transform_type == "case":
                # Case transformations
                if replacement == "lowercase":
                    output_text = input_text.lower()
                elif replacement == "UPPERCASE":
                    output_text = input_text.upper()
                elif replacement == "Title Case":
                    output_text = " ".join(
                        word.capitalize() for word in input_text.split()
                    )
                elif replacement == "Sentence case":
                    import re

                    # First lowercase everything
                    output_text = input_text.lower()
                    # Then capitalize first letter of each sentence
                    output_text = re.sub(
                        r"(^|\.\s+|\?\s+|\!\s+)([a-z])",
                        lambda m: m.group(1) + m.group(2).upper(),
                        output_text,
                    )
                    # Capitalize the first character of the string if it's not already
                    if output_text and output_text[0].islower():
                        output_text = output_text[0].upper() + output_text[1:]

            elif transform_type == "extract":
                # Extract text patterns
                if pattern:
                    import re

                    flags = 0
                    if not case_sensitive:
                        flags = re.IGNORECASE
                    matches = re.findall(pattern, input_text, flags=flags)
                    if matches:
                        if isinstance(matches[0], tuple):  # If there are capture groups
                            output_text = "\n".join(
                                match[0] if isinstance(match, tuple) else match
                                for match in matches
                            )
                        else:
                            output_text = "\n".join(matches)
                    else:
                        output_text = ""  # No matches found

            elif transform_type == "template":
                # Template formatting with ${variable} style placeholders
                if pattern:
                    import re

                    # Replace ${name} with values from input context
                    # For now, just return the template with placeholders
                    # In a real impl, would need to access actual variables
                    output_text = pattern

        except Exception as e:
            logger.exception(f"Error in transform operation: {e}")
            output_text = f"[Error in transform: {str(e)}]"

        logger.info(
            f"Transform node {node_config.get('id', 'unknown')} applied transformation: {transform_type}"
        )
        logger.info(
            f"Transform node {node_config.get('id', 'unknown')} output: {output_text[:100]}..."
        )

        # Return simplified result structure
        result = {
            "input": input_text,  # Preserve original input
            "output": output_text,  # Set output to the transformed text
            "transform_applied": {
                "pattern": pattern,
                "replacement": replacement,
                "is_regex": is_regex,
                "transform_type": transform_type,
                "case_sensitive": case_sensitive,
                "timestamp": datetime.utcnow().isoformat(),
            },
        }

        return result

    async def _execute_input_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute an input node - passes through the template generation output.

        The Input node is the entry point for workflows. It simply passes
        the template output from the template generation process downstream.

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
            output_length = (
                len(template_output) if isinstance(template_output, str) else 0
            )
            logger.info(
                f"Input node passing through template output (length: {output_length})"
            )
        else:
            logger.warning(
                "Input node received no template output - using empty string"
            )
            template_output = ""

        # Return a minimal clean result
        result = {
            "output": template_output,
            "_node_info": {
                "type": "input",
                "id": node_config.get("id", "input-node"),
                "timestamp": datetime.utcnow().isoformat(),
            },
        }

        # Add debug info only in debug mode
        if self.debug_mode:
            result["_debug"] = {
                "output_length": (
                    len(template_output) if isinstance(template_output, str) else 0
                )
            }

        return result

    async def _execute_output_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
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
                "available_fields": list(node_inputs.keys()),
                "has_input": "input" in node_inputs,
            }

            # Add preview of the input if available
            if "input" in node_inputs:
                input_value = node_inputs.get("input")
                if isinstance(input_value, str):
                    debug_info["input_preview"] = input_value[:100] + (
                        "..." if len(input_value) > 100 else ""
                    )
                    debug_info["input_length"] = len(input_value)

            logger.debug(f"Output node inputs: {json.dumps(debug_info, indent=2)}")

        # Extract the input value - what was passed to this node's input
        output_value = node_inputs.get("input", "")

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
                "timestamp": datetime.utcnow().isoformat(),
            },
        }

        # Add debug info to the result for troubleshooting
        if self.debug_mode:
            result["_debug"] = {
                "input_length": (
                    len(output_value) if isinstance(output_value, str) else 0
                ),
                "input_keys": list(node_inputs.keys()),
            }
            logger.debug(
                f"Output node final result length: {len(output_value) if isinstance(output_value, str) else 0}"
            )

        return result

    async def _execute_filter_node(
        self, node_config: Dict[str, Any], node_inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a filter node that evaluates text against configured rules.
        Routes content to 'pass' or 'fail' outputs based on evaluation results.

        Args:
            node_config: The node configuration including rules and combination_mode
            node_inputs: The inputs for the node

        Returns:
            Dict[str, Any]: The outputs with pass/fail routing information
        """
        try:
            # Get configuration
            rules = node_config.get("rules", [])
            combination_mode = node_config.get("combination_mode", "AND")
            node_id = node_config.get("id", "unknown_filter_node")
            
            # Get the input text to filter
            input_text = node_inputs.get("input", "")
            if not isinstance(input_text, str):
                logger.warning(f"Filter node {node_id} received non-string input - converting to string")
                input_text = str(input_text) if input_text is not None else ""
            
            # If no rules, just pass through
            if not rules:
                logger.info(f"Filter node {node_id} has no rules, passing input through")
                return {
                    "output": input_text,
                    "passed": True,
                    "pass": input_text,  # For the 'pass' handle
                    "fail": "",          # For the 'fail' handle
                    "rule_results": [],
                    "_node_info": {
                        "type": "filter",
                        "id": node_id,
                        "timestamp": self._get_timestamp(),
                    }
                }
            
            # Import filter evaluation functions
            from ..api.filter import evaluate_rule
            
            # Evaluate each enabled rule
            rule_results = []
            for rule in rules:
                if rule.get("enabled", True):
                    result = evaluate_rule(input_text, rule)
                    rule_results.append(result)
            
            # Determine overall pass/fail based on combination mode
            if combination_mode == "AND":
                passed = all(result["passed"] for result in rule_results)
            else:  # "OR"
                passed = any(result["passed"] for result in rule_results)
            
            logger.info(f"Filter node {node_id} evaluation result: {passed}")
            
            # Create result with routing information
            result = {
                "output": input_text,  # Always provide the original input as output
                "passed": passed,      # Overall pass/fail result
                # Route text to the appropriate handle
                "pass": input_text if passed else "",
                "fail": "" if passed else input_text,
                # Include rule evaluation details
                "rule_results": rule_results,
                "_node_info": {
                    "type": "filter",
                    "id": node_id,
                    "timestamp": self._get_timestamp(),
                }
            }
            
            return result
            
        except Exception as e:
            logger.exception(f"Error executing filter node {node_config.get('id', 'unknown')}: {str(e)}")
            # Return error result - route to 'fail' output
            return {
                "output": f"Error in filter node: {str(e)}",
                "passed": False,
                "pass": "",
                "fail": node_inputs.get("input", ""),
                "error": str(e),
                "timestamp": self._get_timestamp()
            }

    async def execute_workflow_with_progress(
        self,
        workflow_id: str,
        workflow_data: Dict[str, Any],
        seed_data: SeedData,
        progress_callback: Callable[
            [str, str, float, Optional[NodeExecutionResult]], Awaitable[None]
        ],
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
        logger.info(
            f"Starting workflow execution with progress for workflow {workflow_id}"
        )
        start_time = time.time()

        # Extract nodes and connections
        nodes = workflow_data.get("nodes", {})
        connections = workflow_data.get("connections", [])

        # Validate connections and nodes
        if not connections:
            logger.warning("Workflow has no connections between nodes!")
            await progress_callback(
                "system",
                "error",
                1.0,
                NodeExecutionResult(
                    node_id="system",
                    node_type="system",
                    input={},
                    output={},
                    execution_time=0,
                    status="error",
                    error_message="Workflow has no connections between nodes",
                ),
            )

        if not nodes:
            logger.warning("Workflow has no nodes!")
            error_result = WorkflowExecutionResult(
                workflow_id=workflow_id,
                results=[],
                seed_data=seed_data,
                final_output={"output": "Workflow contains no nodes"},
                execution_time=0,
                status="error",
            )
            await progress_callback("system", "error", 1.0)
            return error_result

        # Analyze the graph
        # Find input and output nodes
        input_nodes = [
            node_id for node_id, node in nodes.items() if node.get("type") == "input"
        ]
        output_nodes = [
            node_id for node_id, node in nodes.items() if node.get("type") == "output"
        ]

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
        await progress_callback(
            "system",
            "info",
            0.0,
            NodeExecutionResult(
                node_id="system",
                node_type="system",
                input={},
                output={
                    "input_nodes": input_nodes,
                    "output_nodes": output_nodes,
                    "isolated_nodes": isolated_nodes,
                    "execution_order": execution_order,
                },
                execution_time=0,
                status="info",
            ),
        )

        # Send initial queued status for all nodes
        for node_id in execution_order:
            await progress_callback(node_id, "queued", 0.0)
            # Small delay to ensure messages are processed in order
            await asyncio.sleep(0.05)

        # Execute nodes in order with progress updates
        node_results = []
        node_outputs = {}

        # Initialize with seed data
        initial_data = {"seed_data": seed_data.dict(), "slots": seed_data.slots}

        # Log initial data structure for debugging
        if self.debug_mode:
            debug_info = {
                "input_keys": list(initial_data.keys()),
                "slots": list(initial_data.get("slots", {}).keys()),
                "template_output_exists": "template_output"
                in initial_data.get("slots", {}),
                "output_exists": "output" in initial_data.get("slots", {}),
            }
            logger.debug(
                f"Workflow progress execution initial data: {json.dumps(debug_info, indent=2)}"
            )

        # Find the final output node(s) - use the last output node in execution order
        # (or the last node if no output nodes exist)
        output_node_ids = [
            node_id for node_id in execution_order if node_id in output_nodes
        ]
        final_node_id = (
            output_node_ids[-1]
            if output_node_ids
            else execution_order[-1] if execution_order else None
        )

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
            node_inputs = self._get_node_inputs(
                node_id, connections, node_outputs, initial_data
            )

            # Debug log - especially important for the input node
            if self.debug_mode:
                node_type = node_config.get("type", "unknown")
                if node_type == "input":
                    # For input nodes, log more detailed information
                    debug_info = {
                        "input_keys": list(node_inputs.keys()),
                        "template_output_present": "template_output" in node_inputs,
                        "output_present": "output" in node_inputs,
                        "slot_keys": list(node_inputs.get("slots", {}).keys()),
                    }

                    # Add template output type if present
                    if "template_output" in node_inputs:
                        debug_info["template_output_type"] = type(
                            node_inputs.get("template_output")
                        ).__name__

                    logger.debug(
                        f"Input node {node_id} [streaming] received inputs: {json.dumps(debug_info, indent=2)}"
                    )
                else:
                    # For other nodes, just log the keys
                    logger.debug(
                        f"Node {node_id} of type {node_type} [streaming] received inputs with keys: {list(node_inputs.keys())}"
                    )

            # Get the right executor
            node_type = node_config.get("type")
            executor = self.node_executors.get(node_type)

            if not executor:
                error_msg = f"No executor found for node type: {node_type}"
                logger.error(error_msg)
                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output={},
                    execution_time=0,
                    status="error",
                    error_message=error_msg,
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
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output=node_output,
                    execution_time=node_execution_time,
                    status="success",
                )
                node_results.append(node_result)

                # Signal completion (100% progress)
                await progress_callback(node_id, "success", 1.0, node_result)

            except Exception as e:
                logger.exception(f"Error executing node {node_id}: {str(e)}")
                node_execution_time = (
                    time.time() - node_start_time
                    if "node_start_time" in locals()
                    else 0
                )

                node_result = NodeExecutionResult(
                    node_id=node_id,
                    node_type=node_type or "unknown",
                    node_name=node_config.get("name"),  # Add this field
                    input=node_inputs,
                    output={},
                    execution_time=node_execution_time,
                    status="error",
                    error_message=str(e),
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
                        logger.info(
                            f"Using output from node {output_id} as final output"
                        )
                        break

            # If still no output, try all executed nodes
            if not final_output and node_outputs:
                # Just use the last node that executed successfully
                last_node_id = next(reversed(node_outputs.keys()), None)
                if last_node_id:
                    final_output = node_outputs[last_node_id]
                    logger.info(
                        f"Using output from node {last_node_id} as fallback final output"
                    )

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
                    "_error": error_message,
                }
                logger.warning(
                    f"{error_message} - attempted to use original template output as fallback"
                )
            else:
                final_output = {"output": error_message, "_error": error_message}
                logger.warning(error_message)

        # Collect all output node results
        output_node_results = {}
        for node_id in output_nodes:
            if node_id in node_outputs:
                output_name = nodes.get(node_id, {}).get("name", node_id)
                output_node_results[node_id] = {
                    "name": output_name,
                    "output": node_outputs[node_id].get("output", ""),
                    "node_type": "output",
                    "node_id": node_id,
                }

        # Return with output_node_results
        workflow_result = WorkflowExecutionResult(
            workflow_id=workflow_id,
            results=node_results,
            seed_data=seed_data,
            final_output=final_output,
            execution_time=total_execution_time,
            status=status,
            output_node_results=output_node_results,  # Add this field
            meta={
                "input_nodes": input_nodes,
                "output_nodes": output_nodes,
                "isolated_nodes": isolated_nodes,
                "execution_order": execution_order,
                "selected_output_node": final_node_id,
                "has_connections": len(connections) > 0,
            },
        )

        logger.info(
            f"Workflow execution with progress completed in {total_execution_time:.2f}s with status: {status}"
        )

        return workflow_result
