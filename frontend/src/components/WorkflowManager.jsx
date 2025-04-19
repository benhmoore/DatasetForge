import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

/**
 * WorkflowManager component for managing workflow definitions
 * This is a placeholder implementation for Phase 1
 */
const WorkflowManager = ({ 
  visible, 
  workflow, 
  setWorkflow,
  onImport,
  onExport,
  disabled = false
}) => {
  const [workflowJson, setWorkflowJson] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  // Update JSON when workflow changes
  useEffect(() => {
    if (workflow) {
      setWorkflowJson(JSON.stringify(workflow, null, 2));
    } else {
      setWorkflowJson('');
    }
  }, [workflow]);
  
  // Parse JSON and update workflow
  const handleJsonChange = (e) => {
    setWorkflowJson(e.target.value);
  };
  
  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(workflowJson);
      
      // Basic validation
      if (!parsed.name || !parsed.nodes || !parsed.connections) {
        toast.error('Invalid workflow format. Must include name, nodes, and connections.');
        return;
      }
      
      setWorkflow(parsed);
      setIsEditing(false);
      toast.success('Workflow updated');
    } catch (error) {
      toast.error(`Failed to parse workflow JSON: ${error.message}`);
    }
  };
  
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = JSON.parse(content);
        
        // Basic validation
        if (!parsed.name || !parsed.nodes || !parsed.connections) {
          toast.error('Invalid workflow format. Must include name, nodes, and connections.');
          return;
        }
        
        setWorkflow(parsed);
        if (onImport) onImport(parsed);
        toast.success(`Imported workflow: ${parsed.name}`);
      } catch (error) {
        toast.error(`Failed to import workflow: ${error.message}`);
      }
    };
    reader.readAsText(file);
    // Reset the file input
    e.target.value = null;
  };
  
  const handleExport = () => {
    if (!workflow) {
      toast.warning('No workflow to export');
      return;
    }
    
    // Create a Blob with the workflow JSON
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
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
  };
  
  // Early return if not visible
  if (!visible) return null;
  
  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Workflow Manager</h2>
        <div className="flex space-x-2">
          <label className="cursor-pointer px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition">
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
      
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            className="w-full h-64 p-2 font-mono text-sm border rounded"
            value={workflowJson}
            onChange={handleJsonChange}
            disabled={disabled}
          />
          <div className="flex justify-end space-x-2">
            <button
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition"
              onClick={() => setIsEditing(false)}
              disabled={disabled}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              onClick={handleSaveJson}
              disabled={disabled}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {workflow ? (
            <div>
              <div className="flex justify-between mb-2">
                <h3 className="font-medium">{workflow.name}</h3>
                <button
                  className="text-blue-600 hover:text-blue-800 text-sm"
                  onClick={() => setIsEditing(true)}
                  disabled={disabled}
                >
                  Edit JSON
                </button>
              </div>
              
              <div className="text-gray-500 text-sm">
                <p>{workflow.description || 'No description'}</p>
                <p className="mt-1">{Object.keys(workflow.nodes || {}).length} nodes • {(workflow.connections || []).length} connections</p>
              </div>
              
              {/* This would be replaced by a visual editor in future phases */}
              <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                <p className="text-gray-400 italic">Visual workflow editor will be implemented in future phases.</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No workflow defined</p>
              <button
                className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                onClick={() => {
                  // Create default workflow
                  const defaultWorkflow = {
                    id: `workflow-${Date.now()}`,
                    name: 'New Workflow',
                    description: 'A new workflow',
                    nodes: {},
                    connections: [],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  };
                  setWorkflow(defaultWorkflow);
                  setIsEditing(true);
                }}
                disabled={disabled}
              >
                Create Workflow
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkflowManager;