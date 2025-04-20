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
      console.log("WorkflowManager: Auto-saving workflow before closing modal", { saveRequest });

      // Always try saving via the editor ref, which now handles both visual and JSON modes internally
      if (workflowEditorRef.current && workflowEditorRef.current.saveWorkflow) {
        const didSave = workflowEditorRef.current.saveWorkflow();
        if (didSave) {
          console.log("WorkflowManager: Successfully triggered save via editor ref");
        } else {
          console.log("WorkflowManager: No changes to save in editor or save failed");
        }
      } else {
        console.warn("WorkflowManager: Could not access editor save method");
      }
    }
  }, [saveRequest, visible, workflow, setWorkflow]);

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
    toast.info('New workflow created. Remember to save!');
  };

  if (!visible) return null;

  return (
    <div className="p-0 bg-white h-full flex flex-col"> {/* Added h-full and flex flex-col */}
      <ReactFlowProvider>
        <WorkflowEditor
          ref={workflowEditorRef}
          workflow={workflow}
          setWorkflow={setWorkflow}
          onImport={handleImportWorkflow}
          onExport={handleExportWorkflow}
          onNew={handleNewWorkflow}
          disabled={disabled || isLoading}
        />
      </ReactFlowProvider>

      {isLoading && (
        <div className="text-center py-4">
          <span className="animate-pulse">Loading templates...</span>
        </div>
      )}
    </div>
  );
};

export default WorkflowManager;