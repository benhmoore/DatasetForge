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
  Position,
  useReactFlow, // <-- Import useReactFlow
  Panel, // <-- Import Panel for potential paste target info
  useStoreApi, // <-- Import useStoreApi
  useNodesInitialized, // <-- Import useNodesInitialized
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'react-toastify';
import isEqual from 'lodash/isEqual';
import cloneDeep from 'lodash/cloneDeep'; // <-- Import cloneDeep for copying
import debounce from 'lodash/debounce'; // <-- Import debounce
import ModelNode from './ModelNode';
import TransformNode from './TransformNode';
import InputNode from './InputNode';
import OutputNode from './OutputNode';
import TextNode from './TextNode';
import CustomSelect from './CustomSelect';
import Icon from './Icons';
import ConfirmationModal from './ConfirmationModal';

// Define node types for selection dropdown and internal logic
const NODE_TYPES = {
  model: 'Model',
  transform: 'Transform',
  input: 'Input',
  output: 'Output',
  text: 'Text'
};

// Define the mapping from internal type to React Flow component type
const nodeComponentMap = {
  model: 'modelNode',
  transform: 'transformNode',
  input: 'inputNode',
  output: 'outputNode',
  text: 'textNode'
};

// Map internal types to actual components for React Flow
const nodeTypes = {
  modelNode: ModelNode,
  transformNode: TransformNode,
  inputNode: InputNode,
  outputNode: OutputNode,
  textNode: TextNode
};

const MAX_HISTORY_SIZE = 50; // Limit history size

/**
 * WorkflowEditor component for visual workflow editing
 * Using forwardRef to expose the saveWorkflow method
 */
const WorkflowEditor = forwardRef(({
  workflow,
  setWorkflow, // Callback to update the parent's workflow state
  onImport,
  onExport,
  onNew,
  disabled = false
}, ref) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState('model');
  const [selectedNodeId, setSelectedNodeId] = useState(null); // Keep track of selection
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isNewConfirmOpen, setIsNewConfirmOpen] = useState(false);
  const [copiedNodes, setCopiedNodes] = useState(null); // <-- State for copied nodes
  const [showJsonEditor, setShowJsonEditor] = useState(false); // <-- State for JSON editor visibility
  const [workflowJson, setWorkflowJson] = useState(''); // <-- State for JSON editor content

  // --- Undo/Redo State ---
  const [history, setHistory] = useState([]); // Array of past states { nodes, edges, name, description }
  const [historyIndex, setHistoryIndex] = useState(-1); // Pointer to current state in history (-1 means initial state)
  const isRestoringHistory = useRef(false); // Flag to prevent saving history during undo/redo actions

  const reactFlowWrapper = useRef(null);
  const nodeIdCounterRef = useRef(1);
  const previousWorkflowRef = useRef(null);
  const { project, getNodes } = useReactFlow(); // <-- Get React Flow instance methods
  const store = useStoreApi(); // Access internal store
  const nodesInitialized = useNodesInitialized(); // Check if nodes are ready

  // --- History Management ---

  // Function to save the current state to history
  const saveHistorySnapshot = useCallback(() => {
    // Don't save if disabled, restoring history, or nodes not yet initialized
    if (disabled || isRestoringHistory.current || !nodesInitialized) {
        // console.log("Skipping history save:", { disabled, isRestoring: isRestoringHistory.current, nodesInitialized });
        return;
    }

    // Get current state (ensure nodes/edges are fully updated)
    const currentState = {
        nodes: store.getState().nodes,
        edges: store.getState().edges,
        name: workflowName,
        description: workflowDescription,
    };

    // console.log("Saving history snapshot. Current index:", historyIndex);

    // Clear the "future" history if we are branching off
    const newHistory = history.slice(0, historyIndex + 1);

    // Avoid saving if the new state is identical to the last saved state
    if (newHistory.length > 0 && isEqual(newHistory[newHistory.length - 1], currentState)) {
        // console.log("Skipping history save: State identical to previous.");
        return;
    }

    // Add the new state
    newHistory.push(cloneDeep(currentState)); // Deep clone

    // Limit history size
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift(); // Remove the oldest entry
    }

    setHistory(newHistory);
    const newIndex = newHistory.length - 1;
    setHistoryIndex(newIndex);
    setHasUnsavedChanges(true); // Any action saved to history implies unsaved changes

    // console.log("History updated. New index:", newIndex, "New size:", newHistory.length);

  }, [history, historyIndex, workflowName, workflowDescription, store, disabled, nodesInitialized]);

  // Debounce the history save function
  const debouncedSaveHistory = useCallback(debounce(saveHistorySnapshot, 500), [saveHistorySnapshot]);


  // --- Undo/Redo Actions ---
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || disabled) {
      return;
    }

    isRestoringHistory.current = true;
    const previousIndex = historyIndex - 1;
    const previousState = history[previousIndex];

    // console.log("Performing UNDO to index:", previousIndex);

    setNodes(cloneDeep(previousState.nodes));
    setEdges(cloneDeep(previousState.edges));
    setWorkflowName(previousState.name);
    setWorkflowDescription(previousState.description);

    setHistoryIndex(previousIndex);
    setHasUnsavedChanges(true); // Undoing is a change relative to the *saved* state

    setTimeout(() => { isRestoringHistory.current = false; }, 0);

  }, [history, historyIndex, setNodes, setEdges, disabled]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || disabled) {
      return;
    }

    isRestoringHistory.current = true;
    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];

    // console.log("Performing REDO to index:", nextIndex);

    setNodes(cloneDeep(nextState.nodes));
    setEdges(cloneDeep(nextState.edges));
    setWorkflowName(nextState.name);
    setWorkflowDescription(nextState.description);

    setHistoryIndex(nextIndex);
    setHasUnsavedChanges(true); // Redoing is a change relative to the *saved* state

    setTimeout(() => { isRestoringHistory.current = false; }, 0);

  }, [history, historyIndex, setNodes, setEdges, disabled]);


  // --- JSON Editor Handlers ---
  const handleJsonChange = (e) => {
    if (disabled) return;
    setWorkflowJson(e.target.value);
    setHasUnsavedChanges(true); // Editing JSON is an unsaved change
  };

  const handleSaveJson = () => {
    if (disabled) return false;
    try {
      const parsed = JSON.parse(workflowJson);
      if (!parsed.name || !parsed.nodes || !parsed.connections) {
        toast.error('Invalid workflow format. Must include name, nodes, and connections.');
        return false;
      }
      parsed.updated_at = new Date().toISOString();
      // Update the main workflow state which will trigger re-render and potentially history save
      setWorkflow(parsed);
      setShowJsonEditor(false); // Switch back to visual editor after saving JSON
      setHasUnsavedChanges(false); // Assume save is successful
      toast.success('Workflow updated from JSON');
      // Note: History might not perfectly reflect the JSON state change unless we manually add a snapshot here.
      // For simplicity, we reset unsaved changes and let the next visual edit create a new history point.
      return true;
    } catch (error) {
      toast.error(`Failed to parse and save workflow JSON: ${error.message}`);
      return false;
    }
  };

  // Expose the saveWorkflow method via ref
  useImperativeHandle(ref, () => ({
    saveWorkflow: () => {
      if (hasUnsavedChanges) {
        return saveWorkflow(); // Call the internal save function
      }
      return false; // Indicate no save was needed
    },
    isJsonEditorActive: () => showJsonEditor // Expose JSON editor state if needed
  }));

  // Handler for changes within a node's configuration
  const handleNodeConfigChange = useCallback((nodeId, updatedConfig) => {
    if (disabled) return;
    // Save history *before* applying the change
    saveHistorySnapshot();
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id === nodeId) {
          const newData = {
            ...node.data,
            ...updatedConfig,
            label: updatedConfig.name !== undefined ? updatedConfig.name : node.data.label,
          };
          return { ...node, data: newData };
        }
        return node;
      })
    );
    // setHasUnsavedChanges(true); // Handled by saveHistorySnapshot
  }, [setNodes, disabled, saveHistorySnapshot]); // <-- Add saveHistorySnapshot dependency

  // Effect to load workflow from props
  useEffect(() => {
    const incomingWorkflow = workflow || { name: 'New Workflow', description: '', nodes: {}, connections: [] };
    const previousWorkflow = previousWorkflowRef.current || { name: 'New Workflow', description: '', nodes: {}, connections: [] };

    // ... (checks for changes remain the same) ...
    const nameChanged = incomingWorkflow.name !== previousWorkflow.name;
    const descriptionChanged = incomingWorkflow.description !== previousWorkflow.description;
    const nodesChanged = !isEqual(incomingWorkflow.nodes, previousWorkflow.nodes);
    const connectionsChanged = !isEqual(incomingWorkflow.connections, previousWorkflow.connections);


    if (workflow !== previousWorkflowRef.current || nameChanged || descriptionChanged || nodesChanged || connectionsChanged) {
      try {
        const reactFlowNodes = [];
        const reactFlowEdges = [];
        let maxId = 0;

        const workflowNodes = incomingWorkflow.nodes || {};
        const workflowConnections = incomingWorkflow.connections || [];

        Object.entries(workflowNodes).forEach(([nodeId, nodeConfig]) => {
          // ... (node parsing logic remains the same) ...
          const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(idNumber) && idNumber > maxId) {
            maxId = idNumber;
          }
          const position = nodeConfig.position || { x: 100, y: 100 + reactFlowNodes.length * 150 };
          const nodeComponentType = nodeComponentMap[nodeConfig.type] || 'modelNode';
          const data = {
            ...nodeConfig,
            label: nodeConfig.name || `${NODE_TYPES[nodeConfig.type] || 'Node'}`,
            onConfigChange: handleNodeConfigChange // Pass the stable callback
          };
          reactFlowNodes.push({ id: nodeId, type: nodeComponentType, position, data });
        });

        nodeIdCounterRef.current = maxId + 1;

        workflowConnections.forEach((connection) => {
          // ... (edge parsing logic remains the same) ...
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

        // Set editor state
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
        setWorkflowName(incomingWorkflow.name);
        setWorkflowDescription(incomingWorkflow.description || '');
        setWorkflowJson(JSON.stringify(incomingWorkflow, null, 2)); // <-- Set initial JSON state

        // Initialize history with the loaded state
        const initialState = {
            nodes: cloneDeep(reactFlowNodes),
            edges: cloneDeep(reactFlowEdges),
            name: incomingWorkflow.name,
            description: incomingWorkflow.description || '',
        };
        setHistory([initialState]);
        setHistoryIndex(0); // Point to the initial state

        setHasUnsavedChanges(false); // Reset unsaved changes flag after loading
        previousWorkflowRef.current = workflow; // Update the ref
        setShowJsonEditor(false); // Default to visual editor on load

        // console.log("Workflow loaded. History initialized.");

      } catch (error) {
        console.error("Error loading workflow into editor:", error);
        toast.error("Failed to load workflow into editor.");
        // Reset state on error
        setNodes([]); setEdges([]); setWorkflowName('Error Loading'); setWorkflowDescription('');
        setHistory([]); setHistoryIndex(-1); // Clear history on error
        setHasUnsavedChanges(false);
        previousWorkflowRef.current = null;
        setWorkflowJson(''); // Clear JSON on error
      }
    }
  }, [workflow, setNodes, setEdges, handleNodeConfigChange]); // Keep dependencies minimal for loading


  // Modal Handlers
  // ... (openNewConfirmModal, closeNewConfirmModal, handleConfirmNew remain the same) ...
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


  // Handle node selection changes and movements
  const handleNodesChange = useCallback((changes) => {
    if (disabled || isRestoringHistory.current) return;

    // Check for significant changes (position end, dimensions change, removal)
    const significantChange = changes.some(c =>
        c.type === 'remove' ||
        (c.type === 'position' && !c.dragging) || // Save on drag end
        c.type === 'dimensions'
    );

    if (significantChange) {
        debouncedSaveHistory(); // Use debounced save for moves/resizes
    }

    // Apply changes using React Flow's handler
    onNodesChange(changes);

    // Update selection state (no history save needed for selection itself)
    const selectionChange = changes.find(change => change.type === 'select');
    if (selectionChange) {
      setSelectedNodeId(selectionChange.selected ? selectionChange.id : null);
    }
    // Unsaved changes are handled by the history save calls
  }, [onNodesChange, disabled, debouncedSaveHistory]); // <-- Add debouncedSaveHistory dependency

  // Handle edge changes (selection, removal)
  const handleEdgesChange = useCallback((changes) => {
    if (disabled || isRestoringHistory.current) return;

    // Save history for edge removals (creation is handled by onConnect)
    if (changes.some(c => c.type === 'remove')) {
      saveHistorySnapshot();
    }

    onEdgesChange(changes);
    // Unsaved changes are handled by the history save calls
  }, [onEdgesChange, disabled, saveHistorySnapshot]); // <-- Add saveHistorySnapshot dependency

  // Handle new connection creation
  const onConnect = useCallback((params) => {
    if (disabled) return;
    // Save history *before* adding the edge
    saveHistorySnapshot();

    const standardizeHandleId = (handleId) => {
      // ... (standardizeHandleId logic) ...
      if (!handleId) return null;
      if (handleId.match(/^input\d+$/)) {
        return handleId.replace(/^input(\d+)$/, 'input_$1');
      }
      return handleId;
    };
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
    // setHasUnsavedChanges(true); // Handled by saveHistorySnapshot

    // Logic to update target ModelNode's handle count
    const match = targetHandle?.match(/^input_(\d+)$/);
    if (match) {
      const inputIndex = parseInt(match[1], 10);
      const targetNodeId = params.target;

      setNodes(prevNodes =>
        prevNodes.map(node => {
          if (node.id === targetNodeId && node.type === 'modelNode') {
            // ... (handle count logic) ...
            const currentCount = node.data._visibleHandleCount || 1;
            const requiredCount = inputIndex + 2;
            const nextCount = Math.min(Math.max(currentCount, requiredCount), 5);

            if (nextCount > currentCount) {
              return {
                ...node,
                data: {
                  ...node.data,
                  _visibleHandleCount: nextCount
                }
              };
            }
          }
          return node;
        })
      );
       // Note: This node update won't be in the same history snapshot as the edge creation.
       // This is generally acceptable, but could be combined if needed by manually creating the next state.
    }
  }, [setEdges, setNodes, disabled, saveHistorySnapshot]); // <-- Add saveHistorySnapshot dependency

  // --- Copy/Paste Logic ---

  // Function to get the next available node ID based on type
  const getNextNodeId = useCallback((nodeTypePrefix) => {
      // console.log("getNextNodeId called with prefix:", nodeTypePrefix);
      const currentNodes = getNodes(); // Get current nodes using the hook
      let maxNum = 0;
      currentNodes.forEach(node => {
          if (node.id.startsWith(`${nodeTypePrefix}-`)) {
              const numPart = node.id.split('-')[1];
              const num = parseInt(numPart, 10);
              if (!isNaN(num) && num > maxNum) {
                  maxNum = num;
              }
          }
      });
      // Ensure the ref counter is also considered and updated
      const nextNum = Math.max(nodeIdCounterRef.current, maxNum + 1);
      nodeIdCounterRef.current = nextNum + 1; // Increment ref for next time
      const nextId = `${nodeTypePrefix}-${nextNum}`;
      // console.log("getNextNodeId generated ID:", nextId);
      return nextId;
  }, [getNodes]); // Depend on getNodes from useReactFlow


  const handleCopy = useCallback(() => {
    // ... (handleCopy logic remains the same) ...
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (selectedNodes.length > 0 && !disabled) {
      const nodesToCopy = selectedNodes.map(node => ({
        ...cloneDeep(node),
        selected: false,
      }));
      setCopiedNodes(nodesToCopy);
      toast.info(`${selectedNodes.length} node${selectedNodes.length > 1 ? 's' : ''} copied.`);
      // console.log("Copied nodes:", nodesToCopy);
    }
  }, [getNodes, disabled]); // Depend on getNodes

  const handlePaste = useCallback(() => {
    // console.log("handlePaste triggered.");
    if (disabled || !copiedNodes || copiedNodes.length === 0) {
      // console.log("Paste condition not met.");
      return;
    }

    // Save history *before* pasting
    saveHistorySnapshot();

    // console.log("Pasting nodes:", copiedNodes);
    const PADDING = 25;
    const newNodes = copiedNodes.map((node, index) => {
      // console.log(`Processing node ${index} for pasting:`, node);
      let baseType = 'unknown';
      if (node.type) {
         const typeEntry = Object.entries(nodeComponentMap).find(([key, value]) => value === node.type);
         if (typeEntry) baseType = typeEntry[0];
      } else if (node.id) {
         baseType = node.id.split('-')[0];
      }
      // console.log(`Determined baseType: ${baseType}`);

      const newNodeId = getNextNodeId(baseType || 'node');
      // console.log(`Generated new ID: ${newNodeId}`);

      const newPosition = {
        x: node.position.x + PADDING * (index + 1) + PADDING,
        y: node.position.y + PADDING * (index + 1) + PADDING,
      };
      // console.log(`Calculated new position:`, newPosition);

      const newData = {
        ...node.data,
        onConfigChange: handleNodeConfigChange, // Re-assign the callback
        name: `${node.data.name || node.data.label || 'Node'} (Copy)`,
        label: `${node.data.name || node.data.label || 'Node'} (Copy)`
      };
      // console.log(`Created new data object:`, newData);

      const finalNewNode = {
        ...node,
        id: newNodeId,
        position: newPosition,
        data: newData,
        selected: false,
        // dragHandle: node.dragHandle, // Ensure dragHandle is copied if used
      };
      // console.log(`Final new node object for state:`, finalNewNode);
      return finalNewNode;
    });

    // console.log("Attempting to setNodes with:", newNodes);
    setNodes((nds) => [...nds, ...newNodes]);
    // setHasUnsavedChanges(true); // Handled by saveHistorySnapshot
    toast.success(`${newNodes.length} node${newNodes.length > 1 ? 's' : ''} pasted.`);

  }, [copiedNodes, disabled, project, setNodes, getNextNodeId, handleNodeConfigChange, saveHistorySnapshot]); // <-- Add saveHistorySnapshot dependency

  // Function to get the latest workflow data based on current state
  const getLatestWorkflowData = useCallback(() => {
    if (hasUnsavedChanges) {
      if (showJsonEditor) {
        try {
          const parsed = JSON.parse(workflowJson);
          if (!parsed.name || !parsed.nodes || !parsed.connections) {
            toast.error('Cannot export: Invalid workflow format in JSON editor.');
            return null; // Indicate failure
          }
          // Use the potentially unsaved name/description from JSON if present
          return {
             ...(workflow || {}), // Preserve other potential workflow properties
             ...parsed,
             updated_at: new Date().toISOString() // Mark as potentially updated
          };
        } catch (error) {
          toast.error(`Cannot export: Failed to parse workflow JSON: ${error.message}`);
          return null; // Indicate failure
        }
      } else {
        // Construct from visual editor state
        const currentNodes = nodes;
        const currentEdges = edges;
        const currentName = workflowName;
        const currentDescription = workflowDescription;

        const updatedNodes = {};
        currentNodes.forEach(node => {
          const { label, onConfigChange, ...configData } = node.data;
          updatedNodes[node.id] = {
            ...configData,
            position: node.position
          };
        });

        const updatedConnections = currentEdges.map(edge => ({
          source_node_id: edge.source,
          source_handle: edge.sourceHandle || null,
          target_node_id: edge.target,
          target_handle: edge.targetHandle || null
        }));

        return {
          ...(workflow || {}), // Preserve other potential workflow properties
          name: currentName,
          description: currentDescription,
          nodes: updatedNodes,
          connections: updatedConnections,
          updated_at: new Date().toISOString() // Mark as potentially updated
        };
      }
    } else {
      // No unsaved changes, use the prop (which should be the saved state)
      return workflow;
    }
  }, [
      workflow, hasUnsavedChanges, showJsonEditor, workflowJson,
      nodes, edges, workflowName, workflowDescription
  ]);

  // Effect for Keyboard Shortcuts (Copy/Paste/Undo/Redo/Save)
  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement.tagName === 'INPUT' ||
                             activeElement.tagName === 'TEXTAREA' ||
                             activeElement.isContentEditable;
      const isFlowFocused = reactFlowWrapper.current && reactFlowWrapper.current.contains(activeElement);

      // --- Undo ---
      // Check for Undo (Cmd/Ctrl + Z, but NOT Shift + Z)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
        if (!isInputFocused) { // Don't interfere with text input undo
          // console.log("Handling Undo shortcut.");
          event.preventDefault();
          handleUndo();
        } else {
          // console.log("Ignoring Undo shortcut (input focused).");
        }
      }
      // --- Redo ---
      // Check for Redo (Cmd/Ctrl + Shift + Z) or (Cmd/Ctrl + Y)
      else if (
         ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') || // Cmd/Ctrl + Shift + Z
         ((event.ctrlKey || event.metaKey) && event.key === 'y') // Cmd/Ctrl + Y (common alternative)
        ) {
         if (!isInputFocused) { // Don't interfere with text input redo
            // console.log("Handling Redo shortcut.");
            event.preventDefault();
            handleRedo();
         } else {
            // console.log("Ignoring Redo shortcut (input focused).");
         }
      }
      // --- Copy ---
      else if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
         const selectedNodes = getNodes().filter((node) => node.selected);
         if (selectedNodes.length > 0 && !isInputFocused){
            // console.log("Handling node copy keyboard shortcut.");
            event.preventDefault();
            handleCopy();
         } else {
            // console.log("Ignoring node copy shortcut (no selection or input focused).");
         }
      }
      // --- Paste ---
      else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
         if (isFlowFocused && !isInputFocused) {
              // console.log("Handling node paste keyboard shortcut.");
              event.preventDefault();
              handlePaste();
          } else {
             // console.log("Ignoring node paste shortcut (not focused on flow or input focused).");
          }
      }
      // --- Save/Export (Ctrl/Cmd + S) ---
      else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        // Prevent browser's default save action
        event.preventDefault();
        if (!disabled && onExport) {
          // console.log("Handling Save/Export shortcut.");
          const dataToExport = getLatestWorkflowData();
          if (dataToExport) {
            onExport(dataToExport);
            // Optionally provide feedback, e.g., toast.info('Workflow exported.');
          } else {
            // console.log("Save shortcut ignored: No data to export.");
          }
        } else {
          // console.log("Save shortcut ignored (disabled or no onExport handler).");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Add onExport and getLatestWorkflowData to dependencies
  }, [handleCopy, handlePaste, getNodes, handleUndo, handleRedo, onExport, getLatestWorkflowData, disabled]);


  // --- Original Workflow Actions ---

  // Add a new node to the canvas
  const addNode = useCallback(() => {
    if (disabled) return;
    // Save history *before* adding the node
    saveHistorySnapshot();

    const newNodeId = getNextNodeId(selectedNodeType);
    const nodeLabel = `${NODE_TYPES[selectedNodeType]} ${newNodeId.split('-').pop()}`;
    const nodeComponentType = nodeComponentMap[selectedNodeType];

    // Create a position with a fallback if project function is not ready
    let position;
    try {
      // Try to use project function if available
      if (typeof project === 'function' && reactFlowWrapper.current) {
        position = project({
          x: reactFlowWrapper.current.clientWidth / 2,
          y: reactFlowWrapper.current.clientHeight / 3
        });
      } else {
        // Fallback positioning if project function unavailable
        position = { 
          x: Math.random() * 400 + 100, 
          y: Math.random() * 200 + 100 
        };
      }
    } catch (error) {
      console.warn("Failed to use project function, using fallback position", error);
      // Fallback if project function throws error
      position = { 
        x: Math.random() * 400 + 100, 
        y: Math.random() * 200 + 100 
      };
    }

    let defaultConfig = {};
     if (selectedNodeType === 'model') {
       defaultConfig = { type: 'model', name: nodeLabel, model: '', system_instruction: '', model_parameters: { temperature: 0.7, top_p: 1.0, max_tokens: 1000 } };
     } else if (selectedNodeType === 'transform') {
       defaultConfig = { type: 'transform', name: nodeLabel, pattern: '', replacement: '', is_regex: false, apply_to_field: 'output' };
     } else if (selectedNodeType === 'input') {
       defaultConfig = { type: 'input', name: 'Input' };
     } else if (selectedNodeType === 'output') {
       defaultConfig = { type: 'output', name: 'Output' };
     } else if (selectedNodeType === 'text') {
       defaultConfig = { type: 'text', name: 'Text', text_content: '' };
     } else {
       console.error(`Unknown node type: ${selectedNodeType}`);
       return;
     }

    const newNode = {
      id: newNodeId,
      type: nodeComponentType,
      position,
      data: {
        ...defaultConfig,
        label: nodeLabel,
        onConfigChange: handleNodeConfigChange
      }
    };

    setNodes((nds) => nds.concat(newNode));
    // setHasUnsavedChanges(true); // Handled by saveHistorySnapshot
  }, [selectedNodeType, setNodes, handleNodeConfigChange, disabled, project, getNextNodeId, saveHistorySnapshot]);

  // Save the current workflow state
  const saveWorkflow = useCallback(() => {
    if (disabled) return false;

    if (showJsonEditor) {
      // If JSON editor is active, try saving from its content
      return handleSaveJson();
    } else {
      // If visual editor is active, save from nodes/edges state
      const currentNodes = nodes;
      const currentEdges = edges;
      const currentName = workflowName;
      const currentDescription = workflowDescription;

      // ... (rest of the visual save logic remains the same) ...
      const updatedNodes = {};
      currentNodes.forEach(node => {
        const { label, onConfigChange, ...configData } = node.data;
        updatedNodes[node.id] = {
          ...configData,
          position: node.position // Ensure latest position is saved
        };
      });

      const updatedConnections = currentEdges.map(edge => ({
        source_node_id: edge.source,
        source_handle: edge.sourceHandle || null,
        target_node_id: edge.target,
        target_handle: edge.targetHandle || null
      }));

      const updatedWorkflow = {
        ...(workflow || {}), // Preserve other potential workflow properties
        name: currentName,
        description: currentDescription,
        nodes: updatedNodes,
        connections: updatedConnections,
        updated_at: new Date().toISOString()
      };

      setWorkflow(updatedWorkflow); // Call parent update function
      setHasUnsavedChanges(false); // Reset unsaved changes flag
      toast.success(`Workflow '${currentName}' saved.`);
      // Optional: Reset history (as before)
      // const savedState = { nodes: cloneDeep(currentNodes), edges: cloneDeep(currentEdges), name: currentName, description: currentDescription };
      // setHistory([savedState]);
      // setHistoryIndex(0);
      return true; // Indicate save was successful
    }
  }, [
      nodes, edges, workflowName, workflowDescription, setWorkflow, workflow, disabled,
      showJsonEditor, workflowJson, handleSaveJson // <-- Add JSON state dependencies
  ]);

  // Handle workflow name change
  const handleNameChange = (e) => {
    if (disabled) return;
    const newName = e.target.value;
    // Use debounced save for text input to avoid excessive history entries
    debouncedSaveHistory();
    setWorkflowName(newName);
    // setHasUnsavedChanges(true); // Handled by history save
  };

  // Handle workflow description change
  const handleDescriptionChange = (e) => {
    if (disabled) return;
    const newDescription = e.target.value;
    // Use debounced save for text input
    debouncedSaveHistory();
    setWorkflowDescription(newDescription);
    // setHasUnsavedChanges(true); // Handled by history save
  };

  // Options for the node type selector
  const nodeTypeOptions = Object.entries(NODE_TYPES).map(([key, label]) => ({
    value: key,
    label: label
  }));

  // Define the Add Node button element
  const addNodeButton = (
    <button
      onClick={addNode}
      className="p-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
      title="Add Selected Node Type"
    >
      <Icon name="plus" className="w-5 h-5" />
    </button>
  );


  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden"> {/* Changed h-[70vh] to h-full */}
      {/* Toolbar */}
      <div className="p-2 border-b bg-gray-50 flex items-center space-x-4 justify-between flex-shrink-0"> {/* Added flex-shrink-0 */}
        {/* Left Group: Workflow Info */}
        <div className="flex items-center space-x-2 flex-grow mr-4">
           <input
             type="text"
             value={workflowName}
             onChange={handleNameChange} // Now uses debouncedSaveHistory
             placeholder="Workflow Name"
             className="px-2 py-1 border rounded text-sm font-medium focus:ring-blue-500 focus:border-blue-500"
             disabled={disabled}
           />
           <input
             type="text"
             value={workflowDescription}
             onChange={handleDescriptionChange} // Now uses debouncedSaveHistory
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
            actionButton={addNodeButton} // addNode now saves history
            className="w-48"
          />
        </div>

        {/* Right Group: Workflow Actions (Add Undo/Redo/JSON Toggle) */}
        <div className="flex items-center space-x-2 pl-4">
            {/* Undo Button */}
            <button
              onClick={handleUndo}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              disabled={disabled || historyIndex <= 0} // Disable if at start of history or disabled
              title="Undo (Ctrl+Z)"
            >
               <Icon name="undo" className="w-4 h-4" />
            </button>
             {/* Redo Button */}
            <button
              onClick={handleRedo}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              disabled={disabled || historyIndex >= history.length - 1} // Disable if at end of history or disabled
              title="Redo (Ctrl+Y)"
            >
               <Icon name="redo" className="w-4 h-4" />
            </button>

            {/* JSON Editor Toggle Button */}
            {/* Hidden for phase-out at a later date, once node editor is stable */}
            {/* <button
              onClick={() => setShowJsonEditor(!showJsonEditor)}
              className={`px-3 py-1 ${showJsonEditor ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'} hover:bg-blue-700 hover:text-white rounded transition text-sm disabled:opacity-50 flex items-center space-x-1`}
              disabled={disabled}
              title={showJsonEditor ? "Switch to Visual Editor" : "Switch to JSON Editor"}
            >
              {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
            </button> */}

            {/* Existing Buttons */}
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
                onClick={() => {
                  const dataToExport = getLatestWorkflowData();
                  if (dataToExport) {
                    onExport(dataToExport);
                  }
                }}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm disabled:opacity-50 flex items-center space-x-1"
                disabled={disabled || (!workflow && !hasUnsavedChanges)} // Disable if no base workflow and no unsaved changes to construct from
                title="Export Workflow to JSON"
              >
                 <Icon name="download" className="w-4 h-4" />
              </button>
            )}
        </div>
      </div>

      {/* Conditional Rendering: React Flow Canvas or JSON Editor */}
      {showJsonEditor ? (
        <div className="flex-grow p-3 space-y-3 overflow-auto flex flex-col"> {/* Added flex flex-col */}
          <p className="text-sm text-gray-500 flex-shrink-0"> {/* Added flex-shrink-0 */}
            Edit the workflow JSON directly. Be careful to maintain valid JSON format. Saving here will update the workflow and switch back to the visual editor. Undo/Redo history is not tracked while editing JSON.
          </p>
          <textarea
            className="w-full flex-grow p-2 font-mono text-sm border rounded focus:ring-blue-500 focus:border-blue-500" // Changed height to flex-grow
            value={workflowJson}
            onChange={handleJsonChange}
            disabled={disabled}
            spellCheck="false"
          />
          <div className="flex justify-end space-x-2 flex-shrink-0"> {/* Added flex-shrink-0 */}
            <button
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition text-sm"
              onClick={() => {
                  setShowJsonEditor(false);
                  // Optionally reset JSON to last known good state if changes are discarded
                  setWorkflowJson(JSON.stringify(workflow || {}, null, 2));
                  setHasUnsavedChanges(false); // Discard changes made in JSON editor
              }}
              disabled={disabled}
            >
              Cancel (Discard JSON Edits)
            </button>
            <button
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition text-sm disabled:opacity-50"
              onClick={handleSaveJson}
              disabled={disabled || !workflowJson.trim() || !hasUnsavedChanges}
            >
              Save JSON & Switch to Visual
            </button>
          </div>
        </div>
      ) : (
        /* React Flow Canvas */
        <div className="flex-grow relative" ref={reactFlowWrapper} tabIndex={0} /* Make div focusable for events */ >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange} // Now calls debouncedSaveHistory for moves/resizes
            onEdgesChange={handleEdgesChange} // Now calls saveHistorySnapshot for removals
            onConnect={onConnect}           // Now calls saveHistorySnapshot
            nodeTypes={nodeTypes}
            fitView
            className="bg-gradient-to-br from-blue-50 to-indigo-100"
            // Let React Flow handle deletion via onNodesChange/onEdgesChange after we save history
            deleteKeyCode={disabled ? null : 'Backspace'}
            nodesDraggable={!disabled}
            nodesConnectable={!disabled}
            elementsSelectable={!disabled}
            selectNodesOnDrag={!disabled}
            // Handle deletions specifically to save history *before* the change occurs
            onNodesDelete={(deletedNodes) => {
                if (!disabled && !isRestoringHistory.current && deletedNodes.length > 0) {
                    // console.log("Handling node delete for history.");
                    saveHistorySnapshot(); // Save state *before* deletion is applied by onNodesChange
                }
            }}
            onEdgesDelete={(deletedEdges) => {
                 if (!disabled && !isRestoringHistory.current && deletedEdges.length > 0) {
                    // console.log("Handling edge delete for history.");
                    saveHistorySnapshot(); // Save state *before* deletion is applied by onEdgesChange
                }
            }}
          >
            <Controls showInteractive={!disabled} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background variant="dots" gap={16} size={1} color="#ccc" />
            {/* <Panel position="top-right">History Index: {historyIndex}</Panel> */}
          </ReactFlow>
        </div>
      )}

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