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
  Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'react-toastify';
import isEqual from 'lodash/isEqual'; // Import isEqual
import ModelNode from './ModelNode';
import TransformNode from './TransformNode';
import CustomSelect from './CustomSelect';
import Icon from './Icons';

// Define node types for selection dropdown and internal logic
const NODE_TYPES = {
  model: 'Model',
  transform: 'Transform',
  // filter: 'Filter', // Example for future expansion
  // custom: 'Custom Function', // Example for future expansion
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

// Basic Input Node Component
const InputNodeComponent = ({ data, isConnectable }) => (
  <div className="p-3 border border-green-500 bg-green-50 rounded-md shadow-sm w-48">
    <div className="font-semibold text-green-800 mb-2">{data.label || 'Input'}</div>
    <Handle 
      type="source" 
      position="right" 
      id="output" 
      isConnectable={isConnectable} 
      className="w-3 h-3 bg-green-500"
    />
    <div className="text-xs text-gray-500 mt-1">Workflow Input</div>
  </div>
);

// Basic Output Node Component
const OutputNodeComponent = ({ data, isConnectable }) => (
  <div className="p-3 border border-purple-500 bg-purple-50 rounded-md shadow-sm w-48">
    <div className="font-semibold text-purple-800 mb-2">{data.label || 'Output'}</div>
    <Handle 
      type="target" 
      position="left" 
      id="input" 
      isConnectable={isConnectable} 
      className="w-3 h-3 bg-purple-500"
    />
     <div className="text-xs text-gray-500 mt-1">Workflow Output</div>
  </div>
);

// Map internal types to actual components for React Flow
const nodeTypes = { 
  modelNode: ModelNode, 
  transformNode: TransformNode,
  inputNode: InputNodeComponent,
  outputNode: OutputNodeComponent
};

/**
 * WorkflowEditor component for visual workflow editing
 */
const WorkflowEditor = ({ 
  workflow, 
  setWorkflow,
  availableTemplates = [], // Assuming templates might be needed for some nodes
  onImport, // Callback for import action
  onExport, // Callback for export action
  disabled = false // Disable editing controls
}) => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null); // For potential future inspector panel
  const [selectedNodeType, setSelectedNodeType] = useState('model'); // Default node type to add
  const [workflowName, setWorkflowName] = useState(workflow?.name || 'New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState(workflow?.description || '');
  
  const nodeIdCounterRef = useRef(1); // Counter for generating unique node IDs
  const isInternalUpdateRef = useRef(false); // Ref to track if updates are due to prop loading
  const previousWorkflowRef = useRef(); // Ref to store previous workflow prop instance

  // Refs to hold current state for stable callback access
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const workflowNameRef = useRef(workflowName);
  const workflowDescriptionRef = useRef(workflowDescription);

  // Update refs whenever state changes
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { workflowNameRef.current = workflowName; }, [workflowName]);
  useEffect(() => { workflowDescriptionRef.current = workflowDescription; }, [workflowDescription]);

  // Effect to load workflow from props
  useEffect(() => {
    // Only run loading logic if the workflow prop *instance* has changed
    if (workflow !== previousWorkflowRef.current) {
      console.log("Workflow prop instance changed.");

      // Construct a representation of the current internal state using refs
      const internalNodesMap = {};
      nodesRef.current.forEach(node => {
        const { onConfigChange, label, ...nodeConfig } = node.data;
        let nodeType;
        // Map React Flow type back to internal type
        Object.entries(nodeComponentMap).forEach(([internalType, componentType]) => {
          if (node.type === componentType) {
            nodeType = internalType;
          }
        });
        nodeType = nodeType || 'model'; // Fallback
        
        const { onConfigChange: _, ...configToSave } = nodeConfig; // Exclude function
        internalNodesMap[node.id] = {
          id: node.id,
          type: nodeType,
          name: label || nodeConfig.name || 'Untitled Node',
          position: node.position,
          ...configToSave
        };
      });
      const internalConnections = edgesRef.current.map(edge => ({
        source_node_id: edge.source,
        target_node_id: edge.target,
        source_handle: edge.sourceHandle,
        target_handle: edge.targetHandle
      }));
      const internalName = workflowNameRef.current;
      const internalDescription = workflowDescriptionRef.current;

      // Extract data from the incoming workflow prop
      const incomingNodesMap = workflow?.nodes || {};
      const incomingConnections = workflow?.connections || [];
      const incomingName = workflow?.name || 'New Workflow';
      const incomingDescription = workflow?.description || '';

      // Clean nodes for comparison (remove non-serializable data like functions)
      const cleanNodes = (nodesObj) => 
        Object.values(nodesObj).map(({ onConfigChange, ...rest }) => rest);

      // Perform deep comparisons
      const nodesAreEqual = isEqual(cleanNodes(internalNodesMap), cleanNodes(incomingNodesMap));
      const connectionsAreEqual = isEqual(internalConnections, incomingConnections);
      const nameAreEqual = internalName === incomingName;
      const descriptionAreEqual = internalDescription === incomingDescription;

      // Only proceed with updating internal state if the incoming prop *content* differs
      if (!nodesAreEqual || !connectionsAreEqual || !nameAreEqual || !descriptionAreEqual) {
         console.log("Workflow prop content differs from internal state. Loading prop.");
         isInternalUpdateRef.current = true; // Mark as internal update START
         
         if (workflow) {
           try {
             const reactFlowNodes = [];
             const reactFlowEdges = [];
             let maxId = 0; // Track max numeric ID part
             
             if (workflow.nodes && typeof workflow.nodes === 'object') {
               Object.entries(workflow.nodes).forEach(([nodeId, nodeConfig]) => {
                 // Update counter based on existing node IDs
                 const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
                 if (!isNaN(idNumber) && idNumber > maxId) {
                   maxId = idNumber;
                 }
                 
                 const position = nodeConfig.position || { x: 100, y: 100 + reactFlowNodes.length * 150 };
                 
                 // Map internal type to React Flow component type
                 const nodeComponentType = nodeComponentMap[nodeConfig.type] || 'modelNode'; // Fallback
                 
                 // Ensure onConfigChange is attached correctly
                 let data = {
                   ...nodeConfig, // Spread first to allow overrides
                   label: nodeConfig.name || `${NODE_TYPES[nodeConfig.type] || 'Node'}`, // Use NODE_TYPES for label
                   onConfigChange: (updatedConfig) => handleNodeConfigChange(nodeId, updatedConfig)
                 };
                 
                 reactFlowNodes.push({ id: nodeId, type: nodeComponentType, position, data });
               });
             }
             nodeIdCounterRef.current = maxId + 1; // Set counter after finding max ID
             
             if (workflow.connections && Array.isArray(workflow.connections)) {
               workflow.connections.forEach((connection, index) => {
                 if (connection.source_node_id && connection.target_node_id) {
                   reactFlowEdges.push({
                     // Generate a more robust edge ID
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
             }
             
             setNodes(reactFlowNodes);
             setEdges(reactFlowEdges);
             setWorkflowName(incomingName); // Use incoming name
             setWorkflowDescription(incomingDescription); // Use incoming description

           } catch (error) {
             console.error('Error loading workflow:', error);
             toast.error('Failed to load workflow diagram');
           }
         } else {
           // Handle null/undefined workflow prop (reset state)
           setNodes([]);
           setEdges([]);
           setWorkflowName('New Workflow');
           setWorkflowDescription('');
           nodeIdCounterRef.current = 1;
         }
         
         // Use setTimeout to reset the flag *after* the current render cycle completes
         setTimeout(() => {
           isInternalUpdateRef.current = false; // Mark as internal update END
           console.log("Internal update flag reset after prop load.");
         }, 0);
      } else {
         console.log("Workflow prop instance changed BUT content matches internal state. Skipping internal state update.");
      }

      // Update the ref to the new prop instance for the next render's comparison
      previousWorkflowRef.current = workflow;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]); // Only depends on the external workflow prop instance change

  // STABLE Callback to update the parent component's workflow state
  // Reads current state from refs, compares with previous prop, calls setWorkflow if changed
  const updateWorkflowObject = useCallback(() => {
    // Skip if the update was triggered by the workflow prop loading effect
    if (isInternalUpdateRef.current) {
      console.log("Skipping updateWorkflowObject: internal update from prop loading in progress.");
      return;
    }
    console.log("Internal state change detected. Running updateWorkflowObject.");
    
    // Log all nodes for debugging
    console.log("Current nodes:", nodesRef.current);

    // Read current state from refs
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentWorkflowName = workflowNameRef.current;
    const currentWorkflowDescription = workflowDescriptionRef.current;

    // Construct the workflow object from current internal state (refs)
    const workflowNodes = {};
    currentNodes.forEach(node => {
      // Extract node data, careful to preserve all properties
      const { onConfigChange, label, ...nodeConfig } = node.data;
      console.log(`Processing node ${node.id}, data:`, node.data);
      
      let nodeType;
      // Map React Flow type back to internal type
      Object.entries(nodeComponentMap).forEach(([internalType, componentType]) => {
        if (node.type === componentType) {
          nodeType = internalType;
        }
      });
      nodeType = nodeType || 'model'; // Fallback
      
      // CRITICAL: We must preserve ALL properties in nodeConfig to prevent data loss
      // First remove functions that can't be serialized
      const { onConfigChange: _, ...configToSave } = nodeConfig;
      
      // Create the node representation to save in the workflow
      // Explicitly include all properties we care about
      workflowNodes[node.id] = {
        id: node.id,
        type: nodeType,
        name: label || nodeConfig.name || 'Untitled Node',
        position: node.position,
        // For ModelNode
        model: nodeConfig.model,
        system_instruction: nodeConfig.system_instruction,
        model_parameters: nodeConfig.model_parameters,
        // For TransformNode
        pattern: nodeConfig.pattern,
        replacement: nodeConfig.replacement,
        is_regex: nodeConfig.is_regex,
        apply_to_field: nodeConfig.apply_to_field,
        // Include all other properties
        ...configToSave
      };
      
      console.log(`Workflow node ${node.id} after processing:`, workflowNodes[node.id]);
    });
    
    const workflowConnections = currentEdges.map(edge => ({
      source_node_id: edge.source,
      target_node_id: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle
    }));

    const updatedWorkflow = {
      // Use the ID from the *previous* workflow prop if available, otherwise generate
      id: previousWorkflowRef.current?.id || `workflow-${Date.now()}`, 
      name: currentWorkflowName, 
      description: currentWorkflowDescription, 
      nodes: workflowNodes,
      connections: workflowConnections,
      updated_at: new Date().toISOString()
    };

    // Compare relevant parts of updatedWorkflow with previousWorkflowRef.current
    const prevWorkflow = previousWorkflowRef.current || {};
    const currentNodesMap = prevWorkflow.nodes || {};
    const currentConnections = prevWorkflow.connections || [];
    const currentName = prevWorkflow.name || '';
    const currentDescription = prevWorkflow.description || '';

    const newNodesMap = updatedWorkflow.nodes || {};
    const newConnections = updatedWorkflow.connections || [];
    const newName = updatedWorkflow.name || '';
    const newDescription = updatedWorkflow.description || '';

    // Prepare nodes for comparison by removing functions/non-serializable data
    // Skip deep comparison entirely - always update the workflow
    console.log("Directly updating workflow with latest nodes:", workflowNodes);
    console.log("Sample node properties (if available):");
    
    // Log some sample node properties for debugging
    const firstNodeId = Object.keys(workflowNodes)[0];
    if (firstNodeId) {
      const sampleNode = workflowNodes[firstNodeId];
      console.log(`- Node ${firstNodeId} system_instruction:`, sampleNode.system_instruction);
      console.log(`- Node ${firstNodeId} model_parameters:`, sampleNode.model_parameters);
    }
    
    // Always update the workflow object
    console.log("ALWAYS updating workflow object");
    setWorkflow(updatedWorkflow); // Call prop function to update parent
  // Only depend on the setWorkflow prop function itself (and potentially previousWorkflowRef if needed, but likely stable)
  }, [setWorkflow]); 

  // useEffect to trigger the STABLE updateWorkflowObject when internal state changes
  useEffect(() => {
    // Check the flag *before* calling updateWorkflowObject
    if (!isInternalUpdateRef.current) {
      // Call the stable update function
      updateWorkflowObject(); 
    } else {
       console.log("Skipping updateWorkflowObject call from internal state effect due to flag.");
    }
  // Depend on the actual state variables + the stable callback instance
  }, [nodes, edges, workflowName, workflowDescription, updateWorkflowObject]); 

  // --- React Flow Handlers ---

  const onConnect = useCallback((params) => {
    if (disabled) return;
    setEdges((eds) => addEdge({ 
      ...params, 
      type: 'smoothstep', 
      animated: true, 
      style: { stroke: '#3b82f6' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#3b82f6' } 
    }, eds));
  }, [setEdges, disabled]);

  const onNodesDelete = useCallback((deletedNodes) => {
    if (disabled) return;
    // Logic to handle node deletion if needed (e.g., confirmation)
    // React Flow's useNodesState handles the state update automatically via onNodesChange
  }, [disabled]);

  const onEdgesDelete = useCallback((deletedEdges) => {
    if (disabled) return;
    // Logic to handle edge deletion if needed
    // React Flow's useEdgesState handles the state update automatically via onEdgesChange
  }, [disabled]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node); // Select node on click
  }, []);

  // --- Custom Handlers ---

  // Handler for changes within a node's configuration (called by child nodes)
  const handleNodeConfigChange = (nodeId, updatedConfig) => {
    if (disabled) return;
    
    console.log('WorkflowEditor: handleNodeConfigChange CALLED for node', nodeId, 'with config:', updatedConfig);
    console.log('CRITICAL CHECK - system_instruction:', updatedConfig.system_instruction);
    
    // Use a direct state update to ensure it's immediately applied
    setNodes(prevNodes => {
      // Find the node we need to update
      const nodeIndex = prevNodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        console.error(`Node with ID ${nodeId} not found!`);
        return prevNodes;
      }
      
      // Create a deep copy of the nodes array
      const newNodes = [...prevNodes];
      
      // Get the target node
      const targetNode = prevNodes[nodeIndex];
      console.log('WorkflowEditor: Current node data before update:', targetNode.data);
      
      // Create a new data object with all properties
      const newData = {
        ...targetNode.data,
        ...updatedConfig,
        // Ensure important fields are explicitly included
        system_instruction: updatedConfig.system_instruction,
        model_parameters: updatedConfig.model_parameters,
        // Update label if name changes
        label: updatedConfig.name !== undefined ? updatedConfig.name : targetNode.data.label,
      };
      
      // Preserve the callback
      newData.onConfigChange = targetNode.data.onConfigChange;
      
      console.log('WorkflowEditor: New node data after update:', newData);
      
      // Create a new node with updated data
      newNodes[nodeIndex] = {
        ...targetNode,
        data: newData
      };
      
      // Force immediate workflow update
      setTimeout(() => {
        console.log('WorkflowEditor: Force updating workflow with:', newNodes);
        // Directly update the nodes ref
        nodesRef.current = newNodes;
        // Call update function immediately
        updateWorkflowObject();
      }, 0);
      
      return newNodes;
    });
  };

  // Handler to add a new node to the canvas
  const handleAddNode = () => {
    if (disabled) return;
    
    const hasInputNode = nodesRef.current.some(node => node.type === 'inputNode');
    const hasOutputNode = nodesRef.current.some(node => node.type === 'outputNode');
    
    // Prevent adding multiple input/output nodes
    if (selectedNodeType === 'input' && hasInputNode) {
      toast.warning('Workflow can only have one input node.'); return;
    }
    if (selectedNodeType === 'output' && hasOutputNode) {
      toast.warning('Workflow can only have one output node.'); return;
    }
    
    // Calculate position for the new node (simple vertical stacking for now)
    const yPos = nodesRef.current.length * 150 + 100;
    const position = { x: 100, y: yPos };
    
    // Generate unique ID, handling special cases for input/output
    const newNodeId = selectedNodeType === 'input' ? 'input-node' : 
                   selectedNodeType === 'output' ? 'output-node' : 
                   `node-${nodeIdCounterRef.current++}`;

    // Get the React Flow component type from the internal type
    const nodeComponentType = nodeComponentMap[selectedNodeType] || 'modelNode'; // Fallback

    // Define initial data based on node type
    let nodeData = { 
      type: selectedNodeType, // Store internal type
      name: `New ${NODE_TYPES[selectedNodeType]}` // Initial name
    }; 

    switch (selectedNodeType) {
      case 'model':
        // Ensure initial data includes all properties ModelNode expects
        nodeData = { 
          ...nodeData, 
          model: '', // Add missing model property
          model_provider: 'ollama', 
          model_name: '', // model_name might be redundant if model holds the identifier
          temperature: 0.7, 
          max_tokens: 1024, 
          prompt: '',
          system_instruction: '', // Add missing system_instruction
          model_parameters: { // Ensure model_parameters object exists
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 1024
          }
        };
        break;
      case 'transform':
        nodeData = { ...nodeData, transform_type: 'replace', pattern: '', replacement: '' };
        break;
      // Input and Output have basic data initially
      case 'input':
      case 'output':
        break; 
      default: 
        // Fallback for potentially unknown types
        nodeData = { ...nodeData, name: 'New Node' };
    }
    
    // Add label and the crucial onConfigChange handler
    nodeData.label = nodeData.name || `${NODE_TYPES[selectedNodeType]} Node`;
    nodeData.onConfigChange = (config) => handleNodeConfigChange(newNodeId, config);

    const newNode = { 
      id: newNodeId, 
      type: nodeComponentType, 
      position, 
      data: nodeData 
    };
    
    setNodes(nds => [...nds, newNode]); // Add the new node to state
    setSelectedNode(newNode); // Optionally select the new node

    // Provide guidance if adding the first non-IO node
    if (nodesRef.current.length === 0 && !['input', 'output'].includes(selectedNodeType)) {
      toast.info('Remember to add Input and Output nodes to complete the workflow.');
    }
  };

  // Handler for deleting the currently selected node
  const handleDeleteNode = () => {
    if (!selectedNode || disabled) return;
    // Prevent deleting Input/Output nodes if they are the only ones of their type? (Optional)
    // if ((selectedNode.id === 'input-node' || selectedNode.id === 'output-node')) {
    //   toast.warning("Cannot delete the core Input/Output nodes.");
    //   return;
    // }
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null); // Deselect after deletion
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-[600px] border rounded-lg shadow-sm bg-gray-50">
      {/* Toolbar */}
      <div className="p-2 border-b bg-white flex items-center space-x-2">
        <input 
          type="text" 
          value={workflowName} 
          onChange={(e) => setWorkflowName(e.target.value)} 
          placeholder="Workflow Name"
          className="flex-grow p-1 border rounded text-sm font-medium"
          disabled={disabled}
        />
        <input 
          type="text" 
          value={workflowDescription} 
          onChange={(e) => setWorkflowDescription(e.target.value)} 
          placeholder="Description (optional)"
          className="flex-grow p-1 border rounded text-sm"
          disabled={disabled}
        />
        <CustomSelect
          options={Object.entries(NODE_TYPES).map(([value, label]) => ({ value, label }))}
          value={selectedNodeType}
          onChange={(value) => setSelectedNodeType(value)}
          disabled={disabled}
          className="w-36 text-sm"
        />
        <button 
          onClick={handleAddNode} 
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          disabled={disabled}
        >
          <Icon name="plus" className="inline-block mr-1 h-4 w-4" /> Add Node
        </button>
        <button 
          onClick={handleDeleteNode} 
          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!selectedNode || disabled}
        >
           <Icon name="trash" className="inline-block mr-1 h-4 w-4" /> Delete
        </button>
        {/* Import/Export Buttons */}
        {onImport && (
          <button 
            onClick={onImport} 
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
            disabled={disabled}
            title="Import Workflow (JSON)"
          >
            <Icon name="upload" className="inline-block mr-1 h-4 w-4" /> Import
          </button>
        )}
        {onExport && (
           <button 
            onClick={onExport} 
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
            disabled={disabled}
            title="Export Workflow (JSON)"
          >
             <Icon name="download" className="inline-block mr-1 h-4 w-4" /> Export
          </button>
        )}
      </div>

      {/* React Flow Canvas */}
      <div className="flex-grow relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes} // Use the mapped components
          fitView
          className="bg-gradient-to-br from-gray-50 to-gray-100" // Subtle background
          deleteKeyCode={disabled ? null : 'Backspace'} // Disable delete key if editor is disabled
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
        >
          <Controls showInteractive={!disabled} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Background variant="dots" gap={16} size={1} color="#ddd" />
        </ReactFlow>
      </div>
    </div>
  );
};

export default WorkflowEditor;