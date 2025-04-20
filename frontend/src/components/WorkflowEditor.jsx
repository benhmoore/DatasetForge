import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  addEdge, 
  useNodesState, 
  useEdgesState,
  MarkerType,
  Handle,
  Position // Import Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'react-toastify';
import isEqual from 'lodash/isEqual'; // Keep for comparing workflow prop content
import ModelNode from './ModelNode'; // Direct import
import TransformNode from './TransformNode'; // Direct import
import InputNode from './InputNode'; // Import the new InputNode
import OutputNode from './OutputNode'; // Import the new OutputNode
import CustomSelect from './CustomSelect';
import Icon from './Icons';

// Define node types for selection dropdown and internal logic
const NODE_TYPES = {
  model: 'Model',
  transform: 'Transform',
  input: 'Input',
  output: 'Output'
};

// Define the mapping from internal type to React Flow component type
const nodeComponentMap = {
  model: 'modelNode',
  transform: 'transformNode',
  input: 'inputNode',
  output: 'outputNode',
};

// --- Node Components ---

// Map internal types to actual components for React Flow
// Use direct components, including the new Input/Output nodes
const nodeTypes = { 
  modelNode: ModelNode, 
  transformNode: TransformNode,
  inputNode: InputNode, // Use imported InputNode
  outputNode: OutputNode // Use imported OutputNode
};

/**
 * WorkflowEditor component for visual workflow editing
 */
const WorkflowEditor = ({ 
  workflow, 
  setWorkflow, // Callback to update the parent's workflow state
  onImport, // Callback for import action
  onExport, // Callback for export action
  disabled = false // Disable editing controls
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState('model'); // Default node type to add
  const [selectedNodeId, setSelectedNodeId] = useState(null); // Track selected node ID
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const reactFlowWrapper = useRef(null);
  const nodeIdCounterRef = useRef(1); // Counter for generating unique node IDs
  const previousWorkflowRef = useRef(null); // Ref to store previous workflow prop instance

  // --- State Synchronization ---

  // Handler for changes within a node's configuration (called by child nodes)
  // This function is passed down to each node via its `data` prop.
  const handleNodeConfigChange = useCallback((nodeId, updatedConfig) => {
    if (disabled) return;
    
    console.log(`WorkflowEditor: Node config change received for node ${nodeId}`, updatedConfig);
    
    setNodes(prevNodes => 
      prevNodes.map(node => {
        if (node.id === nodeId) {
          // Create a new data object, merging the existing data with the updates
          const newData = {
            ...node.data,
            ...updatedConfig,
            // Update label if name changes (ensure name exists in updatedConfig)
            label: updatedConfig.name !== undefined ? updatedConfig.name : node.data.label,
          };
          // Return a *new* node object with the updated data
          return { ...node, data: newData };
        }
        return node; // Return unchanged nodes
      })
    );
    
    setHasUnsavedChanges(true); // Mark changes as unsaved
  }, [setNodes, disabled]);

  // Effect to load workflow from props
  useEffect(() => {
    // Only run loading logic if the workflow prop *instance* has changed
    // Or if the workflow prop content has changed (using deep comparison)
    const incomingWorkflow = workflow || { name: 'New Workflow', description: '', nodes: {}, connections: [] };
    const previousWorkflow = previousWorkflowRef.current || { name: 'New Workflow', description: '', nodes: {}, connections: [] };

    // Compare relevant parts to see if an update is needed
    const nameChanged = incomingWorkflow.name !== previousWorkflow.name;
    const descriptionChanged = incomingWorkflow.description !== previousWorkflow.description;
    // Use isEqual for deep comparison of nodes and connections objects/arrays
    const nodesChanged = !isEqual(incomingWorkflow.nodes, previousWorkflow.nodes);
    const connectionsChanged = !isEqual(incomingWorkflow.connections, previousWorkflow.connections);

    if (workflow !== previousWorkflowRef.current || nameChanged || descriptionChanged || nodesChanged || connectionsChanged) {
      console.log("Workflow prop changed or content differs. Loading into editor.");

      try {
        const reactFlowNodes = [];
        const reactFlowEdges = [];
        let maxId = 0; // Track max numeric ID part
        
        const workflowNodes = incomingWorkflow.nodes || {};
        const workflowConnections = incomingWorkflow.connections || [];

        Object.entries(workflowNodes).forEach(([nodeId, nodeConfig]) => {
          // Update counter based on existing node IDs
          const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(idNumber) && idNumber > maxId) {
            maxId = idNumber;
          }
          
          const position = nodeConfig.position || { x: 100, y: 100 + reactFlowNodes.length * 150 };
          const nodeComponentType = nodeComponentMap[nodeConfig.type] || 'modelNode'; // Fallback
          
          // Prepare node data, ensuring onConfigChange is attached
          // Pass the *entire* nodeConfig from the workflow into the data object
          // Also include the label derived from name/type
          const data = {
            ...nodeConfig, // Spread the whole config here
            label: nodeConfig.name || `${NODE_TYPES[nodeConfig.type] || 'Node'}`,
            onConfigChange: handleNodeConfigChange // Pass the stable callback
          };
          
          reactFlowNodes.push({ 
            id: nodeId, 
            type: nodeComponentType, 
            position, 
            data // Pass the prepared data object
          });
        });
        
        nodeIdCounterRef.current = maxId + 1; // Set counter after finding max ID
        
        workflowConnections.forEach((connection) => {
          if (connection.source_node_id && connection.target_node_id) {
            reactFlowEdges.push({
              id: `edge-${connection.source_node_id}-${connection.source_handle || 'default'}-${connection.target_node_id}-${connection.target_handle || 'default'}`, 
              source: connection.source_node_id,
              target: connection.target_node_id,
              sourceHandle: connection.source_handle || null,
              targetHandle: connection.target_handle || null,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#3b82f6' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#3b82f6' },
            });
          }
        });
        
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
        setWorkflowName(incomingWorkflow.name);
        setWorkflowDescription(incomingWorkflow.description || '');
        setHasUnsavedChanges(false); // Reset unsaved changes flag after loading
        previousWorkflowRef.current = workflow; // Update the ref to the current workflow prop
        
        console.log("Workflow loaded into editor state:", { 
          nodeCount: reactFlowNodes.length, 
          edgeCount: reactFlowEdges.length,
          name: incomingWorkflow.name
        });

      } catch (error) {
        console.error("Error loading workflow into editor:", error);
        toast.error("Failed to load workflow into editor.");
        // Optionally reset state to a safe default
        setNodes([]);
        setEdges([]);
        setWorkflowName('Error Loading');
        setWorkflowDescription('');
        setHasUnsavedChanges(false);
        previousWorkflowRef.current = null;
      }
    }
  // Depend on workflow prop instance and the stable callback
  }, [workflow, setNodes, setEdges, handleNodeConfigChange]); 

  // --- React Flow Handlers ---

  // Handle node selection changes
  const handleNodesChange = useCallback((changes) => {
    if (disabled) return;
    onNodesChange(changes); // Apply changes using React Flow's handler
    
    // Update selected node ID if a node is selected/deselected
    const selectionChange = changes.find(change => change.type === 'select');
    if (selectionChange) {
      setSelectedNodeId(selectionChange.selected ? selectionChange.id : null);
    }
    
    // Mark changes if nodes moved or were deleted
    if (changes.some(c => c.type === 'position' || c.type === 'remove')) {
      setHasUnsavedChanges(true);
    }
  }, [onNodesChange, disabled]);

  // Handle edge changes (creation, deletion)
  const handleEdgesChange = useCallback((changes) => {
    if (disabled) return;
    onEdgesChange(changes); // Apply changes using React Flow's handler
    setHasUnsavedChanges(true); // Any edge change is considered an unsaved change
  }, [onEdgesChange, disabled]);

  // Handle new connection creation
  const onConnect = useCallback((params) => {
    if (disabled) return;
    
    console.log("Creating new edge:", params);
    
    // Clean up handle IDs - convert legacy format (inputN) to new format (input_N)
    // This standardizes all handle IDs to the underscore format
    const standardizeHandleId = (handleId) => {
      if (!handleId) return null;
      
      // Handle legacy format conversion (inputN → input_N)
      if (handleId.match(/^input\d+$/)) {
        return handleId.replace(/^input(\d+)$/, 'input_$1');
      }
      return handleId;
    };
    
    // Apply standardized handle IDs
    const sourceHandle = standardizeHandleId(params.sourceHandle);
    const targetHandle = standardizeHandleId(params.targetHandle);
    
    const newEdge = { 
      ...params, 
      sourceHandle,
      targetHandle,
      id: `edge-${params.source}-${sourceHandle || 'default'}-${params.target}-${targetHandle || 'default'}`,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#3b82f6' },
    };
    setEdges((eds) => addEdge(newEdge, eds));
    setHasUnsavedChanges(true);
  }, [setEdges, disabled]);

  // --- Workflow Actions ---

  // Add a new node to the canvas
  const addNode = useCallback(() => {
    if (disabled) return;
    
    const newNodeId = `${selectedNodeType}-${nodeIdCounterRef.current++}`;
    const nodeLabel = `${NODE_TYPES[selectedNodeType]} ${nodeIdCounterRef.current - 1}`;
    const nodeComponentType = nodeComponentMap[selectedNodeType];
    
    // Determine position (e.g., center of viewport or offset)
    // This requires access to the reactFlowInstance, which might not be ready immediately.
    // A simpler approach is a fixed offset or relative position.
    const position = { 
      x: Math.random() * 400 + 100, // Random position for now
      y: Math.random() * 200 + 100 
    }; 
    
    // Define default configuration based on node type
    let defaultConfig = {};
    if (selectedNodeType === 'model') {
      defaultConfig = {
        type: 'model',
        name: nodeLabel,
        model: '', // Default empty model
        system_instruction: '',
        model_parameters: { temperature: 0.7, top_p: 1.0, max_tokens: 1000 }
      };
    } else if (selectedNodeType === 'transform') {
      defaultConfig = {
        type: 'transform',
        name: nodeLabel,
        pattern: '',
        replacement: '',
        is_regex: false,
        apply_to_field: 'output'
      };
    } else if (selectedNodeType === 'input') {
      defaultConfig = { type: 'input', name: 'Input' };
    } else if (selectedNodeType === 'output') {
      defaultConfig = { type: 'output', name: 'Output' };
    }
    
    const newNode = {
      id: newNodeId,
      type: nodeComponentType,
      position,
      data: {
        ...defaultConfig, // Spread the default config
        label: nodeLabel, // Set initial label
        onConfigChange: handleNodeConfigChange // Pass the callback
      }
    };
    
    console.log("Adding new node:", newNode);
    setNodes((nds) => nds.concat(newNode));
    setHasUnsavedChanges(true);
  }, [selectedNodeType, setNodes, handleNodeConfigChange, disabled]);

  // Save the current workflow state
  const saveWorkflow = useCallback(() => {
    if (disabled) return;
    
    // Transform React Flow state back into the workflow structure
    const updatedNodes = {};
    nodes.forEach(node => {
      // Extract the core configuration from node.data, excluding React Flow specific stuff like 'label' and 'onConfigChange'
      const { label, onConfigChange, ...configData } = node.data;
      updatedNodes[node.id] = {
        ...configData, // The actual configuration
        position: node.position // Save the position
      };
    });
    
    const updatedConnections = edges.map(edge => ({
      source_node_id: edge.source,
      source_handle: edge.sourceHandle || null, // Ensure null if undefined
      target_node_id: edge.target,
      target_handle: edge.targetHandle || null // Ensure null if undefined
    }));
    
    const updatedWorkflow = {
      ...(workflow || {}), // Preserve existing ID and other top-level fields
      name: workflowName,
      description: workflowDescription,
      nodes: updatedNodes,
      connections: updatedConnections,
      updated_at: new Date().toISOString() // Add/update timestamp
    };
    
    console.log("Saving workflow:", { 
      id: updatedWorkflow.id, 
      name: updatedWorkflow.name, 
      nodeCount: Object.keys(updatedNodes).length, 
      connectionCount: updatedConnections.length 
    });
    
    setWorkflow(updatedWorkflow); // Call the parent's update function
    setHasUnsavedChanges(false); // Reset flag after saving
    toast.success(`Workflow '${workflowName}' saved.`);
    
  }, [nodes, edges, workflowName, workflowDescription, setWorkflow, workflow, disabled]);

  // Handle workflow name change
  const handleNameChange = (e) => {
    if (disabled) return;
    setWorkflowName(e.target.value);
    setHasUnsavedChanges(true);
  };

  // Handle workflow description change
  const handleDescriptionChange = (e) => {
    if (disabled) return;
    setWorkflowDescription(e.target.value);
    setHasUnsavedChanges(true);
  };

  // Options for the node type selector
  const nodeTypeOptions = Object.entries(NODE_TYPES).map(([key, label]) => ({
    value: key,
    label: label
  }));

  return (
    <div className="flex flex-col h-[70vh] border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="p-2 border-b bg-gray-50 flex items-center space-x-4">
        {/* Workflow Name & Description */}
        <div className="flex-grow flex items-center space-x-2">
           <input 
             type="text"
             value={workflowName}
             onChange={handleNameChange}
             placeholder="Workflow Name"
             className="px-2 py-1 border rounded text-sm font-medium focus:ring-blue-500 focus:border-blue-500"
             disabled={disabled}
           />
           <input 
             type="text"
             value={workflowDescription}
             onChange={handleDescriptionChange}
             placeholder="Workflow Description (optional)"
             className="px-2 py-1 border rounded text-sm flex-grow focus:ring-blue-500 focus:border-blue-500"
             disabled={disabled}
           />
        </div>
        
        {/* Node Adder */}
        <div className="flex items-center space-x-2">
          <CustomSelect
            options={nodeTypeOptions}
            value={selectedNodeType}
            onChange={setSelectedNodeType}
            disabled={disabled}
            className="w-36" // Adjust width as needed
          />
          <button 
            onClick={addNode} 
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm flex items-center space-x-1 disabled:opacity-50"
            disabled={disabled}
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Add Node</span>
          </button>
        </div>
        
        {/* Save Button */}
        <button 
          onClick={saveWorkflow} 
          className={`px-3 py-1 rounded transition text-sm flex items-center space-x-1 ${hasUnsavedChanges ? 'bg-green-500 hover:bg-green-600 text-white animate-pulse' : 'bg-gray-200 text-gray-600 cursor-not-allowed'}`}
          disabled={!hasUnsavedChanges || disabled}
        >
          <Icon name="save" className="w-4 h-4" />
          <span>Save Workflow</span>
        </button>
        
        {/* Import/Export Buttons (Optional) */}
        {onImport && (
          <button 
            onClick={() => { /* Trigger import logic */ }} 
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50"
            disabled={disabled}
          >
            Import
          </button>
        )}
        {onExport && (
          <button 
            onClick={() => onExport(workflow)} // Pass current workflow state for export
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50"
            disabled={disabled}
          >
            Export
          </button>
        )}
      </div>

      {/* React Flow Canvas */}
      <div className="flex-grow relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange} // Use the combined handler
          onEdgesChange={handleEdgesChange} // Use the combined handler
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gradient-to-br from-blue-50 to-indigo-100" // Example background
          deleteKeyCode={disabled ? null : 'Backspace'} // Disable delete if editor is disabled
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
        >
          <Controls showInteractive={!disabled} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Background variant="dots" gap={16} size={1} color="#ccc" />
        </ReactFlow>
      </div>
    </div>
  );
};

export default WorkflowEditor;