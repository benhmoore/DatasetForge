import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import WorkflowEditor from './WorkflowEditor';
import api from '../api/apiClient';

/**
 * WorkflowManager component for managing workflow definitions
 * Serves as a wrapper around WorkflowEditor with additional features
 */
const WorkflowManager = ({ 
  visible, 
  workflow, 
  setWorkflow,
  onImport,
  onExport,
  disabled = false
}) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [workflowJson, setWorkflowJson] = useState('');
  
  // Fetch templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const fetchedTemplates = await api.getTemplates();
        const activeTemplates = fetchedTemplates.filter(t => !t.archived);
        setTemplates(activeTemplates);
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        toast.error('Failed to load templates for workflow editor');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (visible) {
      fetchTemplates();
    }
  }, [visible]);
  
  // Update JSON when workflow changes
  useEffect(() => {
    console.log("WorkflowManager: workflow updated", workflow?.id);
    
    if (workflow) {
      // Log workflow for debugging
      console.log("WorkflowManager: full workflow object:", workflow);
      
      // Check for specific fields in the first node if any nodes exist
      if (workflow.nodes && Object.keys(workflow.nodes).length > 0) {
        const firstNodeId = Object.keys(workflow.nodes)[0];
        const firstNode = workflow.nodes[firstNodeId];
        console.log(`WorkflowManager: First node (${firstNodeId}) details:`, firstNode);
        
        if (firstNode.type === 'model') {
          console.log("  - model:", firstNode.model);
          console.log("  - system_instruction:", firstNode.system_instruction);
          console.log("  - model_parameters:", firstNode.model_parameters);
        }
      }
      
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
      
      console.log("Saving workflow from JSON editor:", {
        id: parsed.id,
        nodeCount: Object.keys(parsed.nodes).length,
        connectionCount: parsed.connections.length
      });
      
      // Use setTimeout to ensure React renders before we update the workflow
      setTimeout(() => {
        setWorkflow(parsed);
        setShowJsonEditor(false);
        toast.success('Workflow updated from JSON');
      }, 0);
    } catch (error) {
      toast.error(`Failed to parse workflow JSON: ${error.message}`);
    }
  };
  
  // Handle workflow imports/exports
  const handleImportWorkflow = (importedWorkflow) => {
    if (onImport) {
      onImport(importedWorkflow);
    }
  };
  
  const handleExportWorkflow = (exportedWorkflow) => {
    if (onExport) {
      onExport(exportedWorkflow);
    }
  };
  
  // Early return if not visible
  if (!visible) return null;
  
  return (
    <div className="p-4 bg-white border rounded-lg shadow-sm space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Workflow Editor</h2>
        <div className="flex space-x-2">
          <button
            className={`px-3 py-1 ${showJsonEditor ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'} hover:bg-blue-700 hover:text-white rounded transition`}
            onClick={() => setShowJsonEditor(!showJsonEditor)}
            disabled={disabled}
          >
            {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
          </button>
        </div>
      </div>
      
      {showJsonEditor ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Edit the workflow JSON directly. Be careful to maintain valid JSON format.
          </p>
          <textarea
            className="w-full h-96 p-2 font-mono text-sm border rounded"
            value={workflowJson}
            onChange={handleJsonChange}
            disabled={disabled}
          />
          <div className="flex justify-end space-x-2">
            <button
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition"
              onClick={() => setShowJsonEditor(false)}
              disabled={disabled}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              onClick={handleSaveJson}
              disabled={disabled || !workflowJson.trim()}
            >
              Save JSON
            </button>
          </div>
        </div>
      ) : (
        <WorkflowEditor
          workflow={workflow}
          setWorkflow={setWorkflow}
          availableTemplates={templates}
          onImport={handleImportWorkflow}
          onExport={handleExportWorkflow}
          disabled={disabled || isLoading}
        />
      )}
      
      {isLoading && (
        <div className="text-center py-4">
          <span className="animate-pulse">Loading templates...</span>
        </div>
      )}
    </div>
  );
};

export default WorkflowManager;