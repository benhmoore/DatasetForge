import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import WorkflowEditor from './WorkflowEditor';
import api from '../api/apiClient';
import { importTextFile } from '../lib/FileImportUtil'; // Import the utility

/**
 * WorkflowManager component for managing workflow definitions
 * Serves as a wrapper around WorkflowEditor with additional features
 */
const WorkflowManager = ({ 
  visible, 
  workflow, 
  setWorkflow,
  // Remove onImport and onExport from props, handle internally
  disabled = false,
  saveRequest = null // Add this new parameter for handling save requests
}) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [workflowJson, setWorkflowJson] = useState('');
  
  // Add a ref to access WorkflowEditor methods
  const workflowEditorRef = useRef(null);
  
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
  
  // Add a useEffect to handle save requests
  useEffect(() => {
    if (saveRequest && visible && workflow) {
      console.log("WorkflowManager: Auto-saving workflow before closing modal", {
        saveRequest, 
        showJsonEditor
      });
      
      if (showJsonEditor) {
        // If in JSON editor mode, try to parse and save the JSON
        try {
          const parsed = JSON.parse(workflowJson);
          
          // Basic validation
          if (!parsed.name || !parsed.nodes || !parsed.connections) {
            toast.error('Cannot save: Invalid workflow format in JSON editor.');
            return;
          }
          
          // Add a timestamp for the update
          parsed.updated_at = new Date().toISOString();
          
          setWorkflow(parsed);
          toast.success('Workflow JSON saved before closing');
        } catch (error) {
          console.error("Error saving workflow JSON before closing:", error);
          toast.error(`Failed to save workflow: ${error.message}`);
        }
      } else {
        // If in visual editor mode, use the editor's save method via ref
        if (workflowEditorRef.current && workflowEditorRef.current.saveWorkflow) {
          const didSave = workflowEditorRef.current.saveWorkflow();
          if (didSave) {
            console.log("WorkflowManager: Successfully triggered save via editor ref");
          } else {
            console.log("WorkflowManager: No changes to save in editor");
          }
        } else {
          console.warn("WorkflowManager: Could not access editor save method");
        }
      }
    }
  }, [saveRequest, visible, workflow, showJsonEditor, workflowJson, setWorkflow]);
  
  // Rest of the code remains the same...
  
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
      
      // Add a timestamp for the update
      parsed.updated_at = new Date().toISOString();
      
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
  
  // Handle workflow imports
  const handleImportWorkflow = () => {
    if (disabled) return;

    importTextFile({
      acceptTypes: ['.json'], // Only accept JSON files
      onSuccess: (content, file) => {
        try {
          const importedWorkflow = JSON.parse(content);
          
          // Basic validation
          if (!importedWorkflow.name || !importedWorkflow.nodes || !importedWorkflow.connections) {
            toast.error('Invalid workflow JSON format. Must include name, nodes, and connections.');
            return;
          }
          
          // Add/update timestamp
          importedWorkflow.updated_at = new Date().toISOString();
          
          // Optionally use filename if workflow name is generic or missing
          if (!importedWorkflow.name || importedWorkflow.name === 'New Workflow') {
            importedWorkflow.name = file.name.replace(/\.json$/i, ''); // Remove .json extension
          }

          console.log("Importing workflow from file:", file.name, {
            id: importedWorkflow.id, // May not exist if new
            nodeCount: Object.keys(importedWorkflow.nodes).length,
            connectionCount: importedWorkflow.connections.length
          });

          // Use setTimeout to ensure React renders before we update the workflow
          setTimeout(() => {
            setWorkflow(importedWorkflow); // Update the parent state
            setShowJsonEditor(false); // Switch back to visual editor if needed
            toast.success(`Workflow '${importedWorkflow.name}' imported successfully.`);
          }, 0);

        } catch (error) {
          console.error("Error parsing imported workflow JSON:", error);
          toast.error(`Failed to import workflow: ${error.message}`);
        }
      },
      onError: (error) => {
        // Error is already toasted by importTextFile, just log it
        console.error("Error selecting or reading workflow file:", error);
      }
    });
  };
  
  // Handle workflow exports
  const handleExportWorkflow = (workflowToExport) => {
    if (!workflowToExport) {
      toast.warn("No workflow data to export.");
      return;
    }
    
    try {
      const workflowJsonString = JSON.stringify(workflowToExport, null, 2);
      const blob = new Blob([workflowJsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      // Sanitize name for filename
      const safeName = (workflowToExport.name || 'untitled').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
      link.download = `workflow-${safeName}.json`;
      
      document.body.appendChild(link); // Required for Firefox
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Workflow '${workflowToExport.name}' exported.`);
      
    } catch (error) {
      console.error("Error exporting workflow:", error);
      toast.error(`Failed to export workflow: ${error.message}`);
    }
  };
  
  // Handle creating a new workflow
  const handleNewWorkflow = () => {
    if (disabled) return;

    const newWorkflow = {
      // No ID yet, will be assigned on first save
      name: 'New Workflow',
      description: '',
      nodes: {},
      connections: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log("Creating a new blank workflow.");
    setWorkflow(newWorkflow); // Update parent state
    setShowJsonEditor(false); // Ensure visual editor is shown
    toast.info('New workflow created. Remember to save!');
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
          ref={workflowEditorRef} // Add this ref to access the editor methods
          workflow={workflow}
          setWorkflow={setWorkflow}
          availableTemplates={templates}
          onImport={handleImportWorkflow} 
          onExport={handleExportWorkflow} 
          onNew={handleNewWorkflow} // Pass the new handler
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