import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { ReactFlowProvider } from '@xyflow/react'; // <-- Import the provider
import WorkflowEditor from './WorkflowEditor';
import api from '../api/apiClient';
import { importTextFile } from '../lib/FileImportUtil';

/**
 * WorkflowManager component for managing workflow definitions
 * Serves as a wrapper around WorkflowEditor with additional features
 */
const WorkflowManager = ({
  visible,
  workflow,
  setWorkflow,
  disabled = false,
  saveRequest = null
}) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [workflowJson, setWorkflowJson] = useState('');

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

  // Handle save requests
  useEffect(() => {
    if (saveRequest && visible && workflow) {
      console.log("WorkflowManager: Auto-saving workflow before closing modal", {
        saveRequest,
        showJsonEditor
      });

      if (showJsonEditor) {
        try {
          const parsed = JSON.parse(workflowJson);
          if (!parsed.name || !parsed.nodes || !parsed.connections) {
            toast.error('Cannot save: Invalid workflow format in JSON editor.');
            return;
          }
          parsed.updated_at = new Date().toISOString();
          setWorkflow(parsed);
          toast.success('Workflow JSON saved before closing');
        } catch (error) {
          console.error("Error saving workflow JSON before closing:", error);
          toast.error(`Failed to save workflow: ${error.message}`);
        }
      } else {
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
      if (!parsed.name || !parsed.nodes || !parsed.connections) {
        toast.error('Invalid workflow format. Must include name, nodes, and connections.');
        return;
      }
      parsed.updated_at = new Date().toISOString();
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
      acceptTypes: ['.json'],
      onSuccess: (content, file) => {
        try {
          const importedWorkflow = JSON.parse(content);
          if (!importedWorkflow.name || !importedWorkflow.nodes || !importedWorkflow.connections) {
            toast.error('Invalid workflow JSON format.');
            return;
          }
          importedWorkflow.updated_at = new Date().toISOString();
          if (!importedWorkflow.name || importedWorkflow.name === 'New Workflow') {
            importedWorkflow.name = file.name.replace(/\.json$/i, '');
          }
          setTimeout(() => {
            setWorkflow(importedWorkflow);
            setShowJsonEditor(false);
            toast.success(`Workflow '${importedWorkflow.name}' imported successfully.`);
          }, 0);
        } catch (error) {
          console.error("Error parsing imported workflow JSON:", error);
          toast.error(`Failed to import workflow: ${error.message}`);
        }
      },
      onError: (error) => {
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
      const safeName = (workflowToExport.name || 'untitled').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
      link.download = `workflow-${safeName}.json`;
      document.body.appendChild(link);
      link.click();
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
      name: 'New Workflow',
      description: '',
      nodes: {},
      connections: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setWorkflow(newWorkflow);
    setShowJsonEditor(false);
    toast.info('New workflow created. Remember to save!');
  };

  if (!visible) return null;

  return (
    <div className="bg-white space-y-4">
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
        // Wrap WorkflowEditor with ReactFlowProvider
        <ReactFlowProvider>
          <WorkflowEditor
            ref={workflowEditorRef}
            workflow={workflow}
            setWorkflow={setWorkflow}
            // availableTemplates={templates} // Note: 'availableTemplates' prop was removed from WorkflowEditor, kept here for reference if needed elsewhere
            onImport={handleImportWorkflow}
            onExport={handleExportWorkflow}
            onNew={handleNewWorkflow}
            disabled={disabled || isLoading}
          />
        </ReactFlowProvider>
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