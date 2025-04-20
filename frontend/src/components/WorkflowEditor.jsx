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

// Node type definitions
const NODE_TYPES = {
  model: 'Model',
  transform: 'Transform',
  filter: 'Filter',
  custom: 'Custom Function',
  input: 'Input',
  output: 'Output'
};

/**
 * Custom node components for ReactFlow
 */
const ModelNodeComponent = ({ data, isConnectable }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-blue-500 min-w-[250px] relative">
      {/* Input handle */}
      <Handle
        type="target"
        position="left"
        style={{ background: '#3b82f6', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
      
      <h4 className="font-medium text-sm mb-2 text-blue-700">{data.label}</h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Model:</span> {data.model || 'Not set'}
        </div>
        {data.system_instruction && (
          <div className="mb-1 truncate max-w-xs">
            <span className="font-medium">Instruction:</span> {data.system_instruction.substring(0, 30)}...
          </div>
        )}
      </div>
      
      {/* Output handle */}
      <Handle
        type="source"
        position="right"
        style={{ background: '#3b82f6', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const TransformNodeComponent = ({ data, isConnectable }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-green-500 min-w-[250px] relative">
      {/* Input handle */}
      <Handle
        type="target"
        position="left"
        style={{ background: '#10b981', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
      
      <h4 className="font-medium text-sm mb-2 text-green-700">{data.label}</h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Field:</span> {data.apply_to_field || 'output'}
        </div>
        <div className="mb-1">
          <span className="font-medium">{data.is_regex ? 'Regex:' : 'Find:'}</span> {data.pattern || 'Not set'}
        </div>
        <div className="mb-1">
          <span className="font-medium">Replace with:</span> {data.replacement || ''}
        </div>
      </div>
      
      {/* Output handle */}
      <Handle
        type="source"
        position="right"
        style={{ background: '#10b981', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// Input and Output node components
const InputNodeComponent = ({ data, isConnectable }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-purple-500 min-w-[200px] relative">
      <h4 className="font-medium text-sm mb-2 text-purple-700">
        <Icon name="database" className="w-4 h-4 inline-block mr-1" />
        Template Output
      </h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Source:</span> Template Generation
        </div>
        <div className="mb-1">
          <span className="font-medium">Contains:</span> Model output from selected template
        </div>
      </div>
      
      {/* Output handle only */}
      <Handle
        type="source"
        position="right"
        style={{ background: '#8b5cf6', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

const OutputNodeComponent = ({ data, isConnectable }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-orange-500 min-w-[200px] relative">
      {/* Input handle only */}
      <Handle
        type="target"
        position="left"
        style={{ background: '#f97316', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
      
      <h4 className="font-medium text-sm mb-2 text-orange-700">
        <Icon name="check" className="w-4 h-4 inline-block mr-1" />
        Final Output
      </h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Destination:</span> Generation Results
        </div>
        <div className="mb-1">
          <span className="font-medium">Receiving field:</span> {data.field || 'output'}
        </div>
      </div>
    </div>
  );
};

// Template node is no longer used - removed

/**
 * WorkflowEditor component for visual workflow editing
 */
const WorkflowEditor = ({ 
  workflow, 
  setWorkflow,
  availableTemplates = [],
  onImport,
  onExport,
  disabled = false
}) => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedNodeType, setSelectedNodeType] = useState('model');
  const [workflowName, setWorkflowName] = useState(workflow?.name || 'New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState(workflow?.description || '');
  
  const nodeIdCounterRef = useRef(1);
  const isInternalUpdateRef = useRef(false); // Ref to track internal updates
  const previousWorkflowRef = useRef(workflow); // Ref to store previous workflow prop

  useEffect(() => {
    // Store the current workflow prop for comparison in the next render
    previousWorkflowRef.current = workflow;
  });

  useEffect(() => {
    // Only run loading logic if the workflow prop *instance* has changed
    if (workflow !== previousWorkflowRef.current) { 
      isInternalUpdateRef.current = true; // Mark as internal update START
      if (workflow) {
        try {
          const reactFlowNodes = [];
          const reactFlowEdges = [];
          
          nodeIdCounterRef.current = 1;
          
          if (workflow.nodes && typeof workflow.nodes === 'object') {
            Object.entries(workflow.nodes).forEach(([nodeId, nodeConfig]) => {
              const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
              if (!isNaN(idNumber) && idNumber >= nodeIdCounterRef.current) {
                nodeIdCounterRef.current = idNumber + 1;
              }
              
              const position = nodeConfig.position || { x: 100, y: 100 + reactFlowNodes.length * 150 };
              
              let nodeComponent = '';
              let data = {
                label: nodeConfig.name || `${nodeConfig.type} Node`,
                ...nodeConfig,
                onConfigChange: (updatedConfig) => handleNodeConfigChange(nodeId, updatedConfig)
              };
              
              switch (nodeConfig.type) {
                case 'model':
                  nodeComponent = 'modelNode';
                  break;
                case 'transform':
                  nodeComponent = 'transformNode';
                  break;
                case 'template':
                  nodeComponent = 'templateNode';
                  break;
                case 'input':
                  nodeComponent = 'inputNode';
                  break;
                case 'output':
                  nodeComponent = 'outputNode';
                  break;
                default:
                  nodeComponent = 'modelNode';
              }
              
              reactFlowNodes.push({
                id: nodeId,
                type: nodeComponent,
                position,
                data
              });
            });
          }
          
          if (workflow.connections && Array.isArray(workflow.connections)) {
            workflow.connections.forEach((connection, index) => {
              if (connection.source_node_id && connection.target_node_id) {
                reactFlowEdges.push({
                  id: `edge-${index}`,
                  source: connection.source_node_id,
                  target: connection.target_node_id,
                  sourceHandle: connection.source_handle || null,
                  targetHandle: connection.target_handle || null,
                  type: 'smoothstep',
                  animated: true,
                  style: { stroke: '#3b82f6' },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 15,
                    height: 15,
                    color: '#3b82f6',
                  },
                });
              }
            });
          }
          
          setNodes(reactFlowNodes);
          setEdges(reactFlowEdges);
          setWorkflowName(workflow.name || 'New Workflow');
          setWorkflowDescription(workflow.description || '');
          
          // Reset the flag *after* state updates
          isInternalUpdateRef.current = false; 

        } catch (error) {
          console.error('Error loading workflow:', error);
          toast.error('Failed to load workflow diagram');
        }
      } else {
        isInternalUpdateRef.current = true;
        setNodes([]);
        setEdges([]);
        setWorkflowName('New Workflow');
        setWorkflowDescription('');
        nodeIdCounterRef.current = 1;
        // Reset the flag *after* state updates
        isInternalUpdateRef.current = false; 
      }
      // Use setTimeout to reset the flag *after* the current render cycle completes
      // This prevents the other useEffect from running immediately due to these state updates
      setTimeout(() => {
        isInternalUpdateRef.current = false; // Mark as internal update END
      }, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]); // Only depends on the external workflow prop instance change

  // Update workflow object when nodes/edges/name/description change internally
  const updateWorkflowObject = useCallback(() => {
    // Skip if the update was triggered by the workflow prop loading
    if (isInternalUpdateRef.current) {
      console.log("Skipping updateWorkflowObject: internal update from prop loading.");
      return;
    }
    
    console.log("updateWorkflowObject called with:", { 
      nodeCount: nodes.length, 
      edgeCount: edges.length,
      workflowId: workflow ? workflow.id : 'none', // Read current workflow ID here
      workflowName,
      workflowDescription
    });

    const workflowNodes = {};
    nodes.forEach(node => {
      // ... existing node processing ...
      const {
        onConfigChange, 
        label, 
        ...nodeConfig
      } = node.data;
      
      let nodeType;
      switch (node.type) {
        case 'modelNode': nodeType = 'model'; break;
        case 'transformNode': nodeType = 'transform'; break;
        case 'inputNode': nodeType = 'input'; break;
        case 'outputNode': nodeType = 'output'; break;
        default: nodeType = nodeConfig.type || 'model';
      }
      
      // Exclude onConfigChange from saved data
      const { onConfigChange: _, ...configToSave } = nodeConfig;
      workflowNodes[node.id] = {
        id: node.id,
        type: nodeType,
        name: label || nodeConfig.name || 'Untitled Node',
        position: node.position, // Save the latest position
        ...configToSave
      };
    });
    
    const workflowConnections = edges.map(edge => ({
      source_node_id: edge.source,
      target_node_id: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle
    }));
    
    const updatedWorkflow = {
      // Use the current workflow ID if available, otherwise generate a new one
      id: previousWorkflowRef.current?.id || `workflow-${Date.now()}`,
      name: workflowName,
      description: workflowDescription,
      nodes: workflowNodes,
      connections: workflowConnections,
      updated_at: new Date().toISOString()
    };
    
    console.log("Creating updated workflow:", {
      id: updatedWorkflow.id,
      nodeCount: Object.keys(workflowNodes).length,
      connectionCount: workflowConnections.length,
    });
    
    // Deep compare the relevant parts of the new object with the previous workflow prop
    // We exclude updated_at from the comparison
    const { updated_at: current_updated_at, ...currentComparable } = previousWorkflowRef.current || {};
    const { updated_at: new_updated_at, ...newComparable } = updatedWorkflow;

    if (!isEqual(currentComparable, newComparable)) {
      console.log("Workflow changed, calling setWorkflow:", { 
        id: updatedWorkflow.id,
        nodeCount: Object.keys(workflowNodes).length,
        connectionCount: workflowConnections.length,
      });
      setWorkflow(updatedWorkflow);
    } else {
      console.log("Skipping setWorkflow: No actual change detected.");
    }
  // Remove `workflow` from dependencies, keep others
  }, [nodes, edges, workflowName, workflowDescription, setWorkflow]); 

  // useEffect to trigger updateWorkflowObject when internal state changes
  useEffect(() => {
    // This effect runs after nodes, edges, name, or description change.
    // We call updateWorkflowObject here to propagate changes upwards.
    // The check inside updateWorkflowObject prevents updates triggered by prop loading.
    // The check here prevents running immediately after prop loading finishes.
    if (!isInternalUpdateRef.current) {
      updateWorkflowObject();
    }
  }, [nodes, edges, workflowName, workflowDescription, updateWorkflowObject]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);
  
  const onEdgeClick = useCallback((event, edge) => {
    if (window.confirm('Delete this connection?')) {
      setEdges(eds => eds.filter(e => e.id !== edge.id));
    }
  }, [setEdges]);
  
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#3b82f6' },
    }, eds));
  }, [setEdges]);
  
  const handleAddNode = () => {
    if (disabled) return;
    
    const hasInputNode = nodes.some(node => node.type === 'inputNode');
    const hasOutputNode = nodes.some(node => node.type === 'outputNode');
    
    if (selectedNodeType === 'input' && hasInputNode) {
      toast.warning('Workflow already has an input node.'); return;
    }
    if (selectedNodeType === 'output' && hasOutputNode) {
      toast.warning('Workflow already has an output node.'); return;
    }
    
    let position;
    if (selectedNodeType === 'input') { position = { x: 50, y: 150 }; } 
    else if (selectedNodeType === 'output') {
      const maxX = Math.max(...nodes.map(n => n.position.x), 300);
      position = { x: maxX + 250, y: 150 };
    } else {
      position = { x: 250, y: 100 + nodes.length * 50 };
    }
    
    const nodeId = selectedNodeType === 'input' ? 'input-node' : 
                   selectedNodeType === 'output' ? 'output-node' : 
                   `node-${nodeIdCounterRef.current++}`;

    let nodeType = '';
    let nodeData = { };
    switch (selectedNodeType) {
      case 'model':
        nodeType = 'modelNode';
        nodeData = { };
        break;
      case 'transform':
        nodeType = 'transformNode';
        nodeData = { };
        break;
      case 'input':
        nodeType = 'inputNode';
        nodeData = { };
        break;
      case 'output':
        nodeType = 'outputNode';
        nodeData = { };
        break;
      default: nodeType = 'modelNode';
    }
    nodeData.onConfigChange = (updatedConfig) => handleNodeConfigChange(nodeId, updatedConfig);
    nodeData.label = `${NODE_TYPES[selectedNodeType]} Node`;
    nodeData.type = selectedNodeType;

    const newNode = { id: nodeId, type: nodeType, position, data: nodeData };
    
    setNodes(nds => [...nds, newNode]);
    setSelectedNode(newNode);

    if (nodes.length === 0 && !['input', 'output'].includes(selectedNodeType)) {
      toast.info('Remember to add input and output nodes.');
    }
  };
  
  const handleDeleteNode = () => {
    if (!selectedNode || disabled) return;
    
    const nodeIdToDelete = selectedNode.id;
    setNodes(nds => nds.filter(n => n.id !== nodeIdToDelete));
    setEdges(eds => eds.filter(e => e.source !== nodeIdToDelete && e.target !== nodeIdToDelete));
    setSelectedNode(null);
  };
  
  const handleKeyDown = useCallback((event) => {
  }, []);
  
  const handleNodeConfigChange = (nodeId, updatedConfig) => {
    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            ...updatedConfig,
            label: updatedConfig.name !== undefined ? updatedConfig.name : node.data.label,
            onConfigChange: node.data.onConfigChange
          }
        };
      }
      return node;
    }));
  };
  
  const handleInitializeWorkflow = () => {
    if (disabled) return;
    if (nodes.length > 0 && !window.confirm('Replace existing workflow?')) {
      return;
    }
    
    const inputNode = { };
    const modelNode = { };
    const outputNode = { };
    const initialEdges = [ ];
    
    inputNode.data.onConfigChange = (config) => handleNodeConfigChange(inputNode.id, config);
    modelNode.data.onConfigChange = (config) => handleNodeConfigChange(modelNode.id, config);
    outputNode.data.onConfigChange = (config) => handleNodeConfigChange(outputNode.id, config);

    setNodes([inputNode, modelNode, outputNode]);
    setEdges(initialEdges);
    nodeIdCounterRef.current = 2; 
    setSelectedNode(null);
    setWorkflowName('New Initialized Workflow');
    setWorkflowDescription('');
    
    toast.success('Initialized new workflow');
  };
  
  const handleExport = () => {
    if (!workflow) {
      toast.error("Cannot export empty workflow.");
      return;
    }

    const dataStr = JSON.stringify(workflow, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name || 'workflow'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (onExport) onExport(workflow);
    toast.success('Workflow exported successfully');
  };
  
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedWorkflow = JSON.parse(event.target.result);
        if (!importedWorkflow.nodes || !importedWorkflow.connections) {
          throw new Error('Invalid workflow format');
        }
        
        setWorkflow(importedWorkflow); 
        if (onImport) onImport(importedWorkflow);
        toast.success(`Imported workflow: ${importedWorkflow.name}`);
      } catch (error) {
        console.error('Failed to import workflow:', error);
        toast.error(`Failed to import workflow: ${error.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };
  
  const nodeTypes = {
    modelNode: ModelNodeComponent,
    transformNode: TransformNodeComponent,
    inputNode: InputNodeComponent,
    outputNode: OutputNodeComponent,
  };
  
  const nodeTypeOptions = Object.entries(NODE_TYPES).map(([value, label]) => ({ value, label }));
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div className="space-y-2 flex-grow">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="Workflow Name"
            className="font-medium text-lg p-2 border rounded w-full disabled:bg-gray-100"
            disabled={disabled}
          />
          <input
            type="text"
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            placeholder="Description (optional)"
            className="text-sm p-2 border rounded w-full disabled:bg-gray-100"
            disabled={disabled}
          />
        </div>
        
        <div className="flex flex-wrap space-x-2">
          <button
            className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition disabled:opacity-50 mb-2"
            onClick={handleInitializeWorkflow}
            disabled={disabled}
            title="Initialize with input/output nodes"
          >
            <Icon name="refresh" className="h-3 w-3 inline-block mr-1" />
            Initialize
          </button>
          
          <label className="cursor-pointer px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition disabled:opacity-50 disabled:cursor-not-allowed">
            Import
            <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={disabled} />
          </label>
          <button
            className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded transition disabled:opacity-50"
            onClick={handleExport}
            disabled={!workflow || disabled}
          >
            Export
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow border rounded overflow-hidden" style={{ height: '500px' }} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid={true}
            snapGrid={[15, 15]}
            zoomOnScroll={false} 
            preventScrolling={false}
          >
            <Background color="#aaa" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        
        <div className="w-full md:w-80 lg:w-96 border rounded p-4 overflow-auto" style={{ maxHeight: '500px' }}>
          <div className="mb-6 space-y-3">
            <h3 className="font-medium">Add Nodes</h3>
            <div className="flex space-x-2 items-center">
              <div className="flex-grow">
                <CustomSelect options={nodeTypeOptions} value={selectedNodeType} onChange={setSelectedNodeType} disabled={disabled} />
              </div>
              <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50" onClick={handleAddNode} disabled={disabled}>
                Add Node
              </button>
            </div>
            
            {selectedNode && (
              <button
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 w-full rounded transition disabled:opacity-50"
                onClick={handleDeleteNode}
                disabled={disabled || !selectedNode}
              >
                Delete Selected Node ({selectedNode.data.label || selectedNode.id})
              </button>
            )}
          </div>
          
          {selectedNode && (
            <div className="space-y-3">
              <h3 className="font-medium">Node Properties: {selectedNode.data.label || selectedNode.id}</h3>
              
              {selectedNode.type === 'modelNode' && (
                <ModelNode
                  nodeConfig={selectedNode.data}
                  onConfigChange={(config) => handleNodeConfigChange(selectedNode.id, config)}
                  disabled={disabled}
                  availableTemplates={availableTemplates}
                />
              )}
              
              {selectedNode.type === 'transformNode' && (
                <TransformNode
                  nodeConfig={selectedNode.data}
                  onConfigChange={(config) => handleNodeConfigChange(selectedNode.id, config)}
                  disabled={disabled}
                />
              )}
              
              {selectedNode.type === 'inputNode' && (
                <div className="text-sm p-2 bg-gray-50 rounded border">Input node configuration (if any) goes here.</div>
              )}
              {selectedNode.type === 'outputNode' && (
                 <div className="text-sm p-2 bg-gray-50 rounded border">Output node configuration (if any) goes here.</div>
              )}
            </div>
          )}
        </div> {/* Closing tag for sidebar content */}
      </div> {/* Closing tag for flex row (editor + sidebar) */}
    </div> // Closing tag for main component div
  );
};

export default WorkflowEditor;