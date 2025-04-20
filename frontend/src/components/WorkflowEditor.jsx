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
import ModelNode from './ModelNode';
import TransformNode from './TransformNode';
import TemplateNode from './TemplateNode';
import CustomSelect from './CustomSelect';
import Icon from './Icons';

// Node type definitions
const NODE_TYPES = {
  model: 'Model',
  transform: 'Transform',
  template: 'Template',
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
        Seed Input
      </h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Source:</span> Seed Bank
        </div>
        <div className="mb-1">
          <span className="font-medium">Available Fields:</span> {data.fields?.join(', ') || 'All fields'}
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

const TemplateNodeComponent = ({ data, isConnectable }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg p-3 border-2 border-indigo-500 min-w-[250px] relative">
      {/* Input handle */}
      <Handle
        type="target"
        position="left"
        style={{ background: '#6366f1', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
      
      <h4 className="font-medium text-sm mb-2 text-indigo-700">{data.label}</h4>
      <div className="text-xs">
        <div className="mb-1">
          <span className="font-medium">Template ID:</span> {data.template_id || 'Not set'}
        </div>
        {data.instruction && (
          <div className="mb-1 truncate max-w-xs">
            <span className="font-medium">Additional Instruction:</span> {data.instruction.substring(0, 30)}...
          </div>
        )}
      </div>
      
      {/* Output handle */}
      <Handle
        type="source"
        position="right"
        style={{ background: '#6366f1', width: '12px', height: '12px' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

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
  
  // Node counter for unique IDs
  const nodeIdCounterRef = useRef(1);
  
  // Load workflow data into ReactFlow format
  // Keyboard event handling will be implemented in a future version
  
  useEffect(() => {
    if (workflow) {
      // Convert workflow nodes to ReactFlow format
      try {
        const reactFlowNodes = [];
        const reactFlowEdges = [];
        
        // Reset node counter
        nodeIdCounterRef.current = 1;
        
        // Process nodes
        if (workflow.nodes && typeof workflow.nodes === 'object') {
          Object.entries(workflow.nodes).forEach(([nodeId, nodeConfig]) => {
            // Track highest node ID number to avoid duplicates later
            const idNumber = parseInt(nodeId.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(idNumber) && idNumber >= nodeIdCounterRef.current) {
              nodeIdCounterRef.current = idNumber + 1;
            }
            
            // Create ReactFlow node
            const position = nodeConfig.position || { x: 100, y: 100 + reactFlowNodes.length * 150 };
            
            // Node type-specific settings
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
                nodeComponent = 'modelNode'; // Default fallback
            }
            
            reactFlowNodes.push({
              id: nodeId,
              type: nodeComponent,
              position,
              data
            });
          });
        }
        
        // Process connections
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
        
      } catch (error) {
        console.error('Error loading workflow:', error);
        toast.error('Failed to load workflow diagram');
      }
    } else {
      // Create empty workflow
      setNodes([]);
      setEdges([]);
      setWorkflowName('New Workflow');
      setWorkflowDescription('');
      nodeIdCounterRef.current = 1;
    }
  }, [workflow, setNodes, setEdges]);
  
  // Update workflow object when nodes/edges change
  const updateWorkflowObject = useCallback(() => {
    // Filter out changes that don't affect the workflow definition
    // (like selection state or ephemeral UI properties)
    const workflowNodes = {};
    const workflowConnections = [];
    
    // Process nodes
    nodes.forEach(node => {
      // Extract only the configuration properties (not the React components or handlers)
      // that should be saved in the workflow JSON
      const {
        onConfigChange, // Remove callback
        label, // Keep label as name
        ...nodeConfig
      } = node.data;
      
      // Convert ReactFlow node types back to internal node types
      let nodeType;
      switch (node.type) {
        case 'modelNode':
          nodeType = 'model';
          break;
        case 'transformNode':
          nodeType = 'transform';
          break;
        case 'templateNode':
          nodeType = 'template';
          break;
        case 'inputNode':
          nodeType = 'input';
          break;
        case 'outputNode':
          nodeType = 'output';
          break;
        default:
          nodeType = nodeConfig.type || 'model';
      }
      
      workflowNodes[node.id] = {
        id: node.id,
        type: nodeType,
        name: label || nodeConfig.name || 'Untitled Node',
        position: node.position,
        ...nodeConfig
      };
    });
    
    // Process edges
    edges.forEach(edge => {
      workflowConnections.push({
        source_node_id: edge.source,
        target_node_id: edge.target,
        source_handle: edge.sourceHandle,
        target_handle: edge.targetHandle
      });
    });
    
    // Create updated workflow object
    const updatedWorkflow = {
      id: workflow?.id || `workflow-${Date.now()}`,
      name: workflowName,
      description: workflowDescription,
      nodes: workflowNodes,
      connections: workflowConnections,
      updated_at: new Date().toISOString()
    };
    
    // Only set if there are actual changes
    if (JSON.stringify(updatedWorkflow) !== JSON.stringify(workflow)) {
      setWorkflow(updatedWorkflow);
    }
  }, [nodes, edges, workflow, workflowName, workflowDescription, setWorkflow]);
  
  // Update workflow when nodes/edges change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateWorkflowObject();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [nodes, edges, workflowName, workflowDescription, updateWorkflowObject]);
  
  // Handle node selection
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);
  
  // Handle edge selection
  const onEdgeClick = useCallback((event, edge) => {
    // If it's just a click (not a drag), offer to delete the edge
    if (window.confirm('Delete this connection?')) {
      handleDeleteEdge(edge.id);
    }
  }, []);
  
  // Handle connection creation
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
        color: '#3b82f6',
      },
    }, eds));
  }, [setEdges]);
  
  // Add new node to workflow
  const handleAddNode = () => {
    if (disabled) return;
    
    // Count existing input/output nodes to ensure uniqueness
    const hasInputNode = nodes.some(node => node.type === 'inputNode');
    const hasOutputNode = nodes.some(node => node.type === 'outputNode');
    
    // Check if trying to add a duplicate input/output node
    if (selectedNodeType === 'input' && hasInputNode) {
      toast.warning('Workflow already has an input node. Only one input node is allowed.');
      return;
    }
    
    if (selectedNodeType === 'output' && hasOutputNode) {
      toast.warning('Workflow already has an output node. Only one output node is allowed.');
      return;
    }
    
    // Determine node position based on type
    let position;
    if (selectedNodeType === 'input') {
      // Place input node at the left
      position = { x: 50, y: 150 };
    } else if (selectedNodeType === 'output') {
      // Place output node at the right
      const maxX = Math.max(...nodes.map(n => n.position.x), 300);
      position = { x: maxX + 250, y: 150 };
    } else {
      // Standard position for other nodes
      position = { x: 250, y: 100 + nodes.length * 150 };
    }
    
    const nodeId = selectedNodeType === 'input' ? 'input-node' : 
                   selectedNodeType === 'output' ? 'output-node' : 
                   `node-${nodeIdCounterRef.current++}`;
    
    let nodeType = '';
    let nodeData = {
      label: `${NODE_TYPES[selectedNodeType]} Node`,
      type: selectedNodeType,
      onConfigChange: (updatedConfig) => handleNodeConfigChange(nodeId, updatedConfig)
    };
    
    // Node type-specific settings
    switch (selectedNodeType) {
      case 'model':
        nodeType = 'modelNode';
        nodeData = {
          ...nodeData,
          model: '',
          system_instruction: '',
          model_parameters: {
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 1000
          }
        };
        break;
      case 'transform':
        nodeType = 'transformNode';
        nodeData = {
          ...nodeData,
          pattern: '',
          replacement: '',
          is_regex: false,
          apply_to_field: 'output'
        };
        break;
      case 'template':
        nodeType = 'templateNode';
        nodeData = {
          ...nodeData,
          template_id: null,
          instruction: ''
        };
        break;
      case 'input':
        nodeType = 'inputNode';
        nodeData = {
          ...nodeData,
          label: 'Seed Input',
          fields: ['slots', 'seed_data'],
        };
        break;
      case 'output':
        nodeType = 'outputNode';
        nodeData = {
          ...nodeData,
          label: 'Final Output',
          field: 'output',
        };
        break;
      default:
        nodeType = 'modelNode'; // Default fallback
    }
    
    const newNode = {
      id: nodeId,
      type: nodeType,
      position,
      data: nodeData
    };
    
    setNodes(nds => [...nds, newNode]);
    setSelectedNode(newNode);
    
    // If this is the first node, suggest adding input/output nodes
    if (nodes.length === 0 && !['input', 'output'].includes(selectedNodeType)) {
      toast.info('Remember to add input and output nodes to complete your workflow.');
    }
  };
  
  // Delete selected node
  const handleDeleteNode = () => {
    if (!selectedNode || disabled) return;
    
    // Remove node
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    
    // Remove associated edges
    setEdges(eds => eds.filter(e => 
      e.source !== selectedNode.id && e.target !== selectedNode.id
    ));
    
    setSelectedNode(null);
  };
  
  // Delete selected edge
  const handleDeleteEdge = (edgeId) => {
    if (disabled) return;
    
    // Remove the edge
    setEdges(eds => eds.filter(e => e.id !== edgeId));
  };
  
  // Simple keyboard event handler - to be expanded in future versions
  const handleKeyDown = useCallback((event) => {
    // This will be implemented in a future version
    // We'll support keyboard-based deletion and navigation
  }, []);
  
  // Update node configuration
  const handleNodeConfigChange = (nodeId, updatedConfig) => {
    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            ...updatedConfig,
            onConfigChange: node.data.onConfigChange // Preserve the callback
          }
        };
      }
      return node;
    }));
  };
  
  // Initialize a new workflow with input and output nodes
  const handleInitializeWorkflow = () => {
    if (disabled) return;
    
    // Confirm if there are existing nodes
    if (nodes.length > 0) {
      if (!window.confirm('This will replace your existing workflow. Continue?')) {
        return;
      }
    }
    
    // Create input node
    const inputNode = {
      id: 'input-node',
      type: 'inputNode',
      position: { x: 50, y: 150 },
      data: {
        label: 'Seed Input',
        type: 'input',
        fields: ['slots', 'seed_data'],
        onConfigChange: (updatedConfig) => handleNodeConfigChange('input-node', updatedConfig)
      }
    };
    
    // Create model node (in the middle)
    const modelNode = {
      id: 'node-1',
      type: 'modelNode',
      position: { x: 300, y: 150 },
      data: {
        label: 'Model Node',
        type: 'model',
        model: '',
        system_instruction: '',
        template_id: null,
        model_parameters: {
          temperature: 0.7,
          top_p: 1.0,
          max_tokens: 1000
        },
        onConfigChange: (updatedConfig) => handleNodeConfigChange('node-1', updatedConfig)
      }
    };
    
    // Create output node
    const outputNode = {
      id: 'output-node',
      type: 'outputNode',
      position: { x: 550, y: 150 },
      data: {
        label: 'Final Output',
        type: 'output',
        field: 'output',
        onConfigChange: (updatedConfig) => handleNodeConfigChange('output-node', updatedConfig)
      }
    };
    
    // Create edges connecting the nodes
    const edges = [
      {
        id: 'edge-input-model',
        source: 'input-node',
        target: 'node-1',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: '#3b82f6',
        },
      },
      {
        id: 'edge-model-output',
        source: 'node-1',
        target: 'output-node',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: '#3b82f6',
        },
      }
    ];
    
    // Set nodes and edges
    setNodes([inputNode, modelNode, outputNode]);
    setEdges(edges);
    nodeIdCounterRef.current = 2; // Start from 2 since we used node-1
    setSelectedNode(null);
    
    toast.success('Initialized new workflow with connected nodes');
  };
  
  // Export workflow as JSON file
  const handleExport = () => {
    updateWorkflowObject(); // Ensure we have the latest workflow state
    
    // Create a download link
    const dataStr = JSON.stringify(workflow, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name || 'workflow'}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (onExport) onExport(workflow);
    toast.success('Workflow exported successfully');
  };
  
  // Import workflow from file
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const importedWorkflow = JSON.parse(content);
        
        // Basic validation
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
    // Reset the file input
    e.target.value = null;
  };
  
  // Custom node types
  const nodeTypes = {
    modelNode: ModelNodeComponent,
    transformNode: TransformNodeComponent,
    templateNode: TemplateNodeComponent,
    inputNode: InputNodeComponent,
    outputNode: OutputNodeComponent,
  };
  
  // Node type options for dropdown
  const nodeTypeOptions = Object.entries(NODE_TYPES).map(([value, label]) => ({
    value,
    label
  }));
  
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
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
              disabled={disabled}
            />
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
        {/* Main flow editor */}
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
          >
            <Background color="#aaa" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        
        {/* Sidebar with controls and properties */}
        <div className="w-full md:w-80 lg:w-96 border rounded p-4 overflow-auto" style={{ maxHeight: '500px' }}>
          {/* Controls section */}
          <div className="mb-6 space-y-3">
            <h3 className="font-medium">Add Nodes</h3>
            <div className="flex space-x-2 items-center">
              <div className="flex-grow">
                <CustomSelect
                  options={nodeTypeOptions}
                  value={selectedNodeType}
                  onChange={setSelectedNodeType}
                  disabled={disabled}
                />
              </div>
              <button
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
                onClick={handleAddNode}
                disabled={disabled}
              >
                Add Node
              </button>
            </div>
            
            {selectedNode && (
              <button
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 w-full rounded transition disabled:opacity-50"
                onClick={handleDeleteNode}
                disabled={disabled}
              >
                Delete Selected Node
              </button>
            )}
          </div>
          
          {/* Node configuration section */}
          {selectedNode && (
            <div className="space-y-3">
              <h3 className="font-medium">Node Properties</h3>
              
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
              
              {selectedNode.type === 'templateNode' && (
                <TemplateNode
                  nodeConfig={selectedNode.data}
                  onConfigChange={(config) => handleNodeConfigChange(selectedNode.id, config)}
                  disabled={disabled}
                  availableTemplates={availableTemplates}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowEditor;