import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
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
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'react-toastify';
import isEqual from 'lodash/isEqual';
import api from '../api/apiClient';
import { apiToReactFlow, reactFlowToApi } from '../utils/workflowTransform';
import ModelNode from './ModelNode';
import TransformNode from './TransformNode';
import InputNode from './InputNode';
import OutputNode from './OutputNode';
import PromptNode from './PromptNode'; // Import the new PromptNode component
import CustomSelect from './CustomSelect';
import Icon from './Icons';
import ConfirmationModal from './ConfirmationModal';
import ContextMenu from './ContextMenu';

// Define node types for selection dropdown and internal logic
const NODE_TYPES = {
  model: 'Model',
  prompt: 'Prompt',    // Add the new prompt type
  transform: 'Transform',
  input: 'Input',
  output: 'Output',
};

// Define node type icons for menus
const NODE_ICONS = {
  model: 'workflow',      // CommandLineIcon
  prompt: 'chat', // Add an icon for prompt node
  transform: 'edit',      // PencilSquareIcon
  input: 'database',      // CircleStackIcon
  output: 'document',     // DocumentTextIcon
};

// Define the mapping from internal type to React Flow component type
const nodeComponentMap = {
  model: 'modelNode',
  prompt: 'promptNode',   // Add the mapping for prompt node
  transform: 'transformNode',
  input: 'inputNode',
  output: 'outputNode',
};

// Map internal types to actual components for React Flow
const nodeTypes = { 
  modelNode: ModelNode, 
  promptNode: PromptNode,  // Add the PromptNode component
  transformNode: TransformNode,
  inputNode: InputNode,
  outputNode: OutputNode,
};

/**
 * WorkflowEditor component for visual workflow editing
 * Using forwardRef to expose the saveWorkflow method
 */
const WorkflowEditor = forwardRef(({ 
  workflow, 
  setWorkflow, // Callback to update the parent's workflow state
  onImport, // Callback for import action
  onExport, // Callback for export action
  onNew, // Callback for creating a new workflow
  disabled = false // Disable editing controls
}, ref) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState('model');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isNewConfirmOpen, setIsNewConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  const reactFlowWrapper = useRef(null);
  const nodeIdCounterRef = useRef(1);
  const previousWorkflowRef = useRef(null);
  const reactFlowInstance = useRef(null);

  // Expose the saveWorkflow method via ref
  useImperativeHandle(ref, () => ({
    saveWorkflow: () => {
      if (hasUnsavedChanges) {
        console.log("WorkflowEditor: Saving workflow via exposed ref method");
        saveWorkflow();
        return true; // Return true if changes were saved
      }
      return false; // Return false if no changes to save
    }
  }));

  // --- State Synchronization ---

  // Helper function to extract slots from instructions
  const extractSlots = (instructionText) => {
    if (!instructionText) return { slots: [] };
    
    // Match patterns like {slotName}
    const slotRegex = /{([^{}]+)}/g;
    const matches = [...(instructionText.matchAll(slotRegex) || [])];
    
    // Extract slot names and remove duplicates
    const slots = [...new Set(matches.map(match => match[1]))];
    
    return { slots };
  };

  // Handler for changes within a node's configuration (called by child nodes)
  const handleNodeConfigChange = useCallback((nodeId, updatedConfig) => {
    if (disabled) return;
    
    console.log(`WorkflowEditor: Node config change received for node ${nodeId}`, updatedConfig);
    
    // Process model_instruction to log extracted slots for debugging
    if (updatedConfig.model_instruction) {
      // Extract slots for debugging purposes
      const { slots } = extractSlots(updatedConfig.model_instruction);
      console.log(`WorkflowEditor: Node ${nodeId} has slots:`, slots);
    }
    
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

  // Effect to load workflow from props using transformation utility
  useEffect(() => {
    // Only run loading logic if the workflow prop *instance* has changed
    // Or if the workflow prop content has changed (using deep comparison)
    const incomingWorkflow = workflow || { name: 'New Workflow', description: '', nodes: {}, connections: [] };
    const previousWorkflow = previousWorkflowRef.current || { name: 'New Workflow', description: '', nodes: {}, connections: [] };

    // Deep debug log the input workflow structure 
    console.log("WorkflowEditor - DETAILED DEBUG: Incoming workflow structure:", {
      workflowId: incomingWorkflow.id,
      hasDataProperty: !!incomingWorkflow.data,
      hasDirectNodesProperty: !!incomingWorkflow.nodes,
      dataNodesCount: incomingWorkflow.data?.nodes ? Object.keys(incomingWorkflow.data.nodes).length : 0,
      dataConnectionsCount: incomingWorkflow.data?.connections?.length || 0,
      topLevelNodesCount: incomingWorkflow.nodes ? Object.keys(incomingWorkflow.nodes).length : 0,
      fullData: incomingWorkflow
    });
    
    // Normalize the workflow structure - ensure we're getting nodes from either data.nodes or nodes property
    let normalizedWorkflow = {...incomingWorkflow};
    
    // If nodes/connections are inside data property (API format), bring them to top level for comparison
    if (incomingWorkflow.data?.nodes && !incomingWorkflow.nodes) {
      console.log("WorkflowEditor: Moving nodes/connections from data property to top level for processing");
      normalizedWorkflow.nodes = incomingWorkflow.data.nodes;
      normalizedWorkflow.connections = incomingWorkflow.data.connections || [];
    }

    // Compare relevant parts to see if an update is needed
    const nameChanged = normalizedWorkflow.name !== previousWorkflow.name;
    const descriptionChanged = normalizedWorkflow.description !== previousWorkflow.description;
    // Use isEqual for deep comparison of nodes and connections objects/arrays
    const nodesChanged = !isEqual(normalizedWorkflow.nodes, previousWorkflow.nodes);
    const connectionsChanged = !isEqual(normalizedWorkflow.connections, previousWorkflow.connections);

    console.log("WorkflowEditor: Change detection", {
      nameChanged,
      descriptionChanged,
      nodesChanged,
      connectionsChanged,
      isNewWorkflowInstance: workflow !== previousWorkflowRef.current
    });

    if (workflow !== previousWorkflowRef.current || nameChanged || descriptionChanged || nodesChanged || connectionsChanged) {
      console.log("Workflow prop changed or content differs. Loading into editor.");

      try {
        // Find the highest node ID to update counter
        let maxId = 0;
        const nodeKeys = Object.keys(normalizedWorkflow.nodes || {});
        console.log("WorkflowEditor: Processing node IDs", {
          nodeCount: nodeKeys.length,
          nodeIds: nodeKeys
        });
        
        nodeKeys.forEach(nodeId => {
          const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(idNumber) && idNumber > maxId) {
            maxId = idNumber;
          }
        });
        
        nodeIdCounterRef.current = maxId + 1;
        console.log(`WorkflowEditor: Set node ID counter to ${nodeIdCounterRef.current}`);
        
        // Use our utility to transform from API format to React Flow format
        console.log("WorkflowEditor: Calling apiToReactFlow with:", {
          hasNodes: !!normalizedWorkflow.nodes,
          nodeCount: Object.keys(normalizedWorkflow.nodes || {}).length,
          connectionCount: (normalizedWorkflow.connections || []).length
        });
        
        const { nodes: reactFlowNodes, edges: reactFlowEdges } = 
          apiToReactFlow(normalizedWorkflow, nodeComponentMap, handleNodeConfigChange);
        
        console.log("WorkflowEditor: apiToReactFlow result:", {
          reactFlowNodesCount: reactFlowNodes.length,
          reactFlowEdgesCount: reactFlowEdges.length,
          firstNodePreview: reactFlowNodes[0] ? {
            id: reactFlowNodes[0].id, 
            type: reactFlowNodes[0].type,
            data: reactFlowNodes[0].data
          } : 'no nodes'
        });
        
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
        setWorkflowName(normalizedWorkflow.name);
        setWorkflowDescription(normalizedWorkflow.description || '');
        setHasUnsavedChanges(false); // Reset unsaved changes flag after loading
        previousWorkflowRef.current = workflow; // Update the ref to the current workflow prop
        
        console.log("Workflow loaded into editor state:", { 
          nodeCount: reactFlowNodes.length, 
          edgeCount: reactFlowEdges.length,
          name: normalizedWorkflow.name
        });

      } catch (error) {
        console.error("Error loading workflow into editor:", error);
        
        // Log the failing data structure for debugging
        console.error("Failed workflow data:", normalizedWorkflow);
        
        // Provide more specific error message based on error type
        if (error.message?.includes("nodes")) {
          toast.error("Failed to load workflow: Invalid node structure");
        } else if (error.message?.includes("connections")) {
          toast.error("Failed to load workflow: Invalid connection structure");
        } else {
          toast.error("Failed to load workflow into editor: " + (error.message || "Unknown error"));
        }
        
        // Reset state to a safe default
        setNodes([]);
        setEdges([]);
        setWorkflowName('Error Loading');
        setWorkflowDescription('');
        setHasUnsavedChanges(false);
        previousWorkflowRef.current = null;
      }
    }
  }, [workflow, setNodes, setEdges, handleNodeConfigChange]); 

  // --- Modal Handlers ---
  const openNewConfirmModal = () => {
    if (disabled) return;
    setIsNewConfirmOpen(true); 
  };

  const closeNewConfirmModal = () => {
    setIsNewConfirmOpen(false);
  };

  const handleConfirmNew = () => {
    if (onNew) {
      onNew();
    }
    closeNewConfirmModal();
  };

  // --- React Flow Handlers ---

  // Handle node selection changes
  const handleNodesChange = useCallback((changes) => {
    if (disabled) return;
    onNodesChange(changes);
    
    // Update selected node ID if a node is selected/deselected
    const selectionChange = changes.find(change => change.type === 'select');
    if (selectionChange) {
      setSelectedNodeId(selectionChange.selected ? selectionChange.id : null);
    }
    
    // Mark any node change (move, select, remove) as unsaved
    setHasUnsavedChanges(true); 
  }, [onNodesChange, disabled]);

  // Handle edge changes (creation, deletion)
  const handleEdgesChange = useCallback((changes) => {
    if (disabled) return;
    onEdgesChange(changes);
    setHasUnsavedChanges(true);
  }, [onEdgesChange, disabled]);

  // Handle new connection creation
  const onConnect = useCallback((params) => {
    if (disabled) return;
    
    console.log("Creating new edge:", params);
    
    // Find source and target nodes
    const sourceNode = nodes.find(node => node.id === params.source);
    const targetNode = nodes.find(node => node.id === params.target); 
    
    // Standardize handle IDs
    const standardizeHandleId = (handleId) => {
      if (!handleId) return null;
      // Match handles like 'input0', 'input1', etc. and convert to 'input_0', 'input_1'
      if (handleId.match(/^input\d+$/)) {
        return handleId.replace(/^input(\d+)$/, 'input_$1');
      }
      // Match handles like 'output0', 'output1', etc. and convert to 'output_0', 'output_1'
      if (handleId.match(/^output\d+$/)) {
        return handleId.replace(/^output(\d+)$/, 'output_$1');
      }
      return handleId;
    };
    
    const sourceHandle = standardizeHandleId(params.sourceHandle);
    const targetHandle = standardizeHandleId(params.targetHandle);
    
    // Extract slot information for Model nodes
    let slotInfo = {};
    if (targetNode && targetNode.type === 'modelNode' && targetHandle.startsWith('input_')) {
      // Extract the slot name directly from the handle ID
      const slotName = targetHandle.replace('input_', '');
      
      // Skip if it's the default handle with no slot
      if (slotName !== 'default') {
        slotInfo = {
          slotName,
          targetSlot: slotName
        };
        console.log(`Connection to slot name: ${slotName} for node ${targetNode.id}`);
      }
    }
    
    // Create and add the new edge
    const newEdge = { 
      ...params, 
      sourceHandle,
      targetHandle,
      id: `edge-${params.source}-${sourceHandle || 'default'}-${params.target}-${targetHandle || 'default'}`,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#3b82f6' },
      ...slotInfo // Add slot information to the edge
    };
    
    setEdges((eds) => addEdge(newEdge, eds));
    setHasUnsavedChanges(true);
  }, [setEdges, disabled, nodes]);

  // --- Workflow Actions ---
  
  // Store the React Flow instance reference
  const onInit = useCallback((instance) => {
    reactFlowInstance.current = instance;
    console.log('ReactFlow instance initialized');
  }, []);

  
  // Handle right-click on the canvas
  const onPaneContextMenu = useCallback((event) => {
    // Prevent default browser context menu
    event.preventDefault();
    
    if (disabled) return;
    
    // Get the bounding box of the flow canvas
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    
    let flowPosition;
    if (reactFlowInstance.current) {
      // Get screen coordinates relative to the canvas
      const screenPoint = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top
      };
      
      // Convert to flow coordinates (accounting for pan and zoom)
      flowPosition = reactFlowInstance.current.screenToFlowPosition(screenPoint);
      console.log('Converted to flow coordinates:', flowPosition);
    } else {
      // Fallback if instance isn't available
      flowPosition = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top
      };
      console.log('Using fallback coordinates (no instance):', flowPosition);
    }
    
    // Show context menu at the mouse position (browser coordinates)
    setContextMenu({
      position: { 
        x: event.clientX, 
        y: event.clientY 
      },
      flowPosition: flowPosition
    });
  }, [disabled]);
  
  // Handle click on canvas to close context menu
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);
  
  // Add a new node to the canvas with optional position
  const addNode = useCallback((nodeType = null, position = null) => {
    if (disabled) return;
    
    // Use provided node type or fallback to the selected one
    const typeToAdd = nodeType || selectedNodeType;
    
    const newNodeId = `${typeToAdd}-${nodeIdCounterRef.current++}`;
    const nodeLabel = `${NODE_TYPES[typeToAdd]} ${nodeIdCounterRef.current - 1}`;
    const nodeComponentType = nodeComponentMap[typeToAdd];
    
    // Determine position - use provided position or random position
    const nodePosition = position || { 
      x: Math.random() * 400 + 100,
      y: Math.random() * 200 + 100 
    }; 
    
    // Define default configuration based on node type
    let defaultConfig = {};
    if (typeToAdd === 'model') {
      defaultConfig = {
        type: 'model',
        name: nodeLabel,
        model: '',
        system_instruction: '',
        model_parameters: { temperature: 0.7, top_p: 1.0, max_tokens: 1000 }
      };
    } else if (typeToAdd === 'prompt') { // Add case for prompt node
      defaultConfig = {
        type: 'prompt',
        name: nodeLabel,
        prompt_template: '',
        input_variables: []
      };
    } else if (typeToAdd === 'transform') {
      defaultConfig = {
        type: 'transform',
        name: nodeLabel,
        pattern: '',
        replacement: '',
        is_regex: false,
        apply_to_field: 'output'
      };
    } else if (typeToAdd === 'input') {
      defaultConfig = { type: 'input', name: 'Input' };
    } else if (typeToAdd === 'output') {
      defaultConfig = { type: 'output', name: 'Output' };
    } else {
      console.error(`Unknown node type: ${typeToAdd}`);
      return;
    }
    
    const newNode = {
      id: newNodeId,
      type: nodeComponentType,
      position: nodePosition,
      data: {
        ...defaultConfig,
        label: nodeLabel,
        onConfigChange: handleNodeConfigChange
      }
    };
    
    console.log(`Adding new ${typeToAdd} node at position:`, nodePosition);
    setNodes((nds) => nds.concat(newNode));
    setHasUnsavedChanges(true);
  }, [selectedNodeType, setNodes, handleNodeConfigChange, disabled]);
  
  // Handle node selection from context menu
  const handleContextMenuSelect = useCallback((nodeType) => {
    if (contextMenu) {
      addNode(nodeType, contextMenu.flowPosition);
    }
  }, [addNode, contextMenu]);

  // Save the current workflow state
  const saveWorkflow = useCallback(async () => {
    if (disabled || isSaving) return;
    
    setIsSaving(true);
    
    try {
      // Use our utility to transform React Flow state back into API format
      const apiFormatData = reactFlowToApi(nodes, edges, nodeComponentMap);
      
      // Prepare the workflow data for saving
      const workflowData = {
        name: workflowName,
        description: workflowDescription,
        data: apiFormatData
      };
      
      let savedWorkflow;
      
      // Check if we're updating an existing workflow or creating a new one
      if (workflow?.id) {
        console.log(`Updating existing workflow (ID: ${workflow.id})`);
        savedWorkflow = await api.updateWorkflow(workflow.id, workflowData);
        toast.success(`Workflow "${savedWorkflow.name}" updated to v${savedWorkflow.version}`);
      } else {
        console.log('Creating new workflow');
        savedWorkflow = await api.createWorkflow(workflowData);
        toast.success(`Workflow "${savedWorkflow.name}" created`);
      }
      
      // Update state with the saved workflow
      setWorkflow(savedWorkflow);
      setHasUnsavedChanges(false);
      previousWorkflowRef.current = savedWorkflow;
      
      console.log("Workflow saved successfully:", { 
        id: savedWorkflow.id, 
        name: savedWorkflow.name, 
        version: savedWorkflow.version
      });
      
    } catch (error) {
      console.error("Error saving workflow:", error);
      
      // Handle version conflict errors specially
      if (error.response?.status === 409) {
        toast.error("Workflow was modified elsewhere. Please refresh and try again.");
      } else {
        toast.error(`Failed to save workflow: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    nodes, 
    edges, 
    workflowName, 
    workflowDescription, 
    workflow, 
    setWorkflow, 
    disabled, 
    isSaving, 
    nodeComponentMap
  ]);

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

  // Define the Add Node button element to pass to CustomSelect
  const addNodeButton = (
    <button 
      onClick={() => addNode()} // Wrap addNode call in an anonymous function
      className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
      title="Add Selected Node Type"
    >
      <Icon name="plus" className="w-5 h-5" />
    </button>
  );

  // Add 'beforeunload' event listener to warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        // Standard mechanism to trigger the browser's native confirmation dialog
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    // Cleanup function to remove the listener when component unmounts
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="p-2 border-b bg-gray-50 flex items-center space-x-4 justify-between">
        {/* Left Group: Workflow Info */}
        <div className="flex items-center space-x-2 flex-grow mr-4">
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
        
        {/* Center Group: Node Management */}
        <div className="flex items-center border-l border-r px-4">
          <CustomSelect
            options={nodeTypeOptions}
            value={selectedNodeType}
            onChange={setSelectedNodeType}
            disabled={disabled}
            actionButton={addNodeButton}
            className="w-48"
          />
        </div>
        
        {/* Right Group: Workflow Actions */}
        <div className="flex items-center space-x-2 pl-4">
          {/* Save Button */}
          <button
            onClick={saveWorkflow}
            disabled={disabled || isSaving || !hasUnsavedChanges}
            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
            title={hasUnsavedChanges ? "Save workflow changes" : "No changes to save"}
          >
            {isSaving ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
          
          {/* Other Action Buttons */} 
          {onNew && (
            <button 
              onClick={openNewConfirmModal}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-sm disabled:opacity-50 flex items-center space-x-1"
              disabled={disabled}
              title="Create New Workflow"
            >
              New Workflow
            </button>
          )}
          {onImport && (
            <button 
              onClick={onImport} 
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50 flex items-center space-x-1"
              disabled={disabled}
              title="Import Workflow from JSON"
            >
              <Icon name="upload" className="w-4 h-4" />
            </button>
          )}
          {onExport && (
            <button 
              onClick={() => onExport(workflow)} 
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50 flex items-center space-x-1"
              disabled={disabled || !workflow} 
              title="Export Workflow to JSON"
            >
              <Icon name="download" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-grow relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onContextMenu={onPaneContextMenu}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-800"
          deleteKeyCode={disabled ? null : 'Backspace'}
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
        >
          <Controls showInteractive={!disabled} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Background variant="dots" gap={16} size={1} color="rgb(100,100,100)" />
        </ReactFlow>
        
        {/* Context Menu */}
        {contextMenu && !disabled && (
          <ContextMenu
            items={Object.entries(NODE_TYPES).map(([type, label]) => ({
              label,
              value: type,
              icon: NODE_ICONS[type]
            }))}
            position={contextMenu.position}
            onSelect={handleContextMenuSelect}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      {/* Confirmation Modal for New Workflow */}
      <ConfirmationModal
        isOpen={isNewConfirmOpen}
        onClose={closeNewConfirmModal}
        onConfirm={handleConfirmNew}
        title="Discard Unsaved Changes?"
        message="Creating a new workflow will discard any unsaved changes to the current one. Consider exporting first if you want to save it."
        confirmButtonText="Discard and Create New"
        confirmButtonVariant="danger"
      />
    </div>
  );
});

export default WorkflowEditor;