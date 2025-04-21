import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
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
  saveRequest = null // Parameter for handling save requests
}) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [workflowJson, setWorkflowJson] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
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
  
  // Handle save requests (triggered when modal is about to close)
  useEffect(() => {
    if (saveRequest && visible && workflow) {
      console.log("WorkflowManager: Auto-saving workflow before closing modal", {
        saveRequest, 
        showJsonEditor,
        workflowId: workflow?.id,
        saveRequestType: typeof saveRequest,
        workflowSaveRequestId: workflow?._saveRequestId
      });
      
      // Check if this is a toggle editor request or a close request
      const isToggleRequest = workflow?._saveRequestId === "toggle_json_editor";
      // Check if it's a close request but no changes are made
      const isCloseRequest = saveRequest === "close_no_save" || workflow._saveRequestId === "close_no_save";
      
      console.log("WorkflowManager: Save decision", {
        isToggleRequest,
        isCloseRequest,
        shouldSkipSave: isToggleRequest || isCloseRequest,
        workflowId: workflow?.id
      });
      
      // Skip save if it's a toggle request or close_no_save request
      if (!isToggleRequest && !isCloseRequest) {
        if (showJsonEditor) {
          // If in JSON editor mode, try to parse and save the JSON
          console.log("WorkflowManager: Saving from JSON editor mode", {
            workflowId: workflow?.id,
            jsonLength: workflowJson?.length || 0
          });
          
          // Only save if we actually have JSON content that's been modified
          if (workflowJson && workflowJson.trim() !== '') {
            handleSaveJsonToApi();
          } else {
            console.log("WorkflowManager: No JSON content to save");
          }
        } else {
          // If in visual editor mode, use the editor's save method via ref
          console.log("WorkflowManager: Attempting to save via editor ref", {
            hasRef: !!workflowEditorRef.current,
            hasSaveMethod: !!(workflowEditorRef.current?.saveWorkflow)
          });
          
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
      } else {
        console.log("WorkflowManager: Skipping save due to editor toggle or close without save flag");
      }
    }
  }, [saveRequest, visible, workflow, showJsonEditor, workflowJson]);
  
  // Update JSON when workflow changes
  useEffect(() => {
    // Skip updates triggered by toggling editor mode
    if (workflow && workflow._saveRequestId === "toggle_json_editor") {
      console.log("WorkflowManager: Skipping JSON update for toggle_json_editor", {
        workflowId: workflow?.id,
        currentJsonLength: workflowJson?.length || 0,
        inJsonEditor: showJsonEditor
      });
      return;
    }
    
    if (workflow) {
      console.log("WorkflowManager: Workflow object changed - considering JSON update", {
        workflowId: workflow?.id,
        hasExistingJson: !!workflowJson,
        inJsonEditor: showJsonEditor,
        willUpdateJson: !showJsonEditor || !workflowJson
      });
      
      // Only update JSON if we're not already editing in JSON mode
      // or if we don't have any JSON content yet
      if (!showJsonEditor || !workflowJson) {
        const newJsonContent = JSON.stringify(workflow, null, 2);
        console.log("WorkflowManager: Setting new JSON content", {
          length: newJsonContent.length,
          previewStart: newJsonContent.substring(0, 40)
        });
        setWorkflowJson(newJsonContent);
      } else {
        console.log("WorkflowManager: Preserving existing JSON editor content");
      }
    } else {
      console.log("WorkflowManager: No workflow - clearing JSON");
      setWorkflowJson('');
    }
  }, [workflow, showJsonEditor, workflowJson]);
  
  // Parse JSON and update workflow
  const handleJsonChange = (e) => {
    setWorkflowJson(e.target.value);
  };
  
  // Save JSON directly to API
  const handleSaveJsonToApi = async () => {
    if (isSaving) return;
    
    // Skip if no JSON content or workflowJson is empty
    if (!workflowJson || workflowJson.trim() === '') {
      console.log("WorkflowManager: Skipping save - no JSON content to save");
      return;
    }
    
    console.log("WorkflowManager: Starting JSON save", {
      jsonLength: workflowJson.length,
      workflowId: workflow?.id
    });
    
    setIsSaving(true);
    
    try {
      const parsed = JSON.parse(workflowJson);
      
      // Basic validation with more detailed error messages
      if (!parsed) {
        toast.error('Invalid workflow format. Unable to parse JSON.');
        setIsSaving(false);
        return;
      }
      
      if (!parsed.name) {
        toast.error('Invalid workflow format. Must include "name" property.');
        setIsSaving(false);
        return;
      }
      
      // Validate data structure - also log for debugging
      const hasData = !!parsed.data;
      const hasNodesAndConnections = !!(parsed.nodes || parsed.connections);
      
      console.log("WorkflowManager: Parsed workflow data", {
        hasData,
        hasNodes: !!parsed.nodes,
        hasConnections: !!parsed.connections,
        isValid: hasData || hasNodesAndConnections
      });
      
      if (!hasData && !hasNodesAndConnections) {
        toast.error('Invalid workflow format. Must include either "data" object or "nodes"/"connections" fields.');
        setIsSaving(false);
        return;
      }
      
      // Extract the workflow data for API
      // Check if data is already in the expected format
      const workflowData = {
        name: parsed.name,
        description: parsed.description || '',
        data: parsed.data || {
          nodes: parsed.nodes || {},
          connections: parsed.connections || []
        }
      };
      
      console.log("WorkflowManager: Prepared workflow data for API", {
        name: workflowData.name,
        hasDescription: !!workflowData.description,
        dataNodesCount: Object.keys(workflowData.data.nodes || {}).length,
        dataConnectionsCount: (workflowData.data.connections || []).length
      });
      
      let savedWorkflow;
      
      // Determine if creating or updating
      if (workflow?.id) {
        console.log(`Updating existing workflow (ID: ${workflow.id}) from JSON editor`);
        savedWorkflow = await api.updateWorkflow(workflow.id, workflowData);
        toast.success(`Workflow "${savedWorkflow.name}" updated to v${savedWorkflow.version}`);
      } else {
        console.log('Creating new workflow from JSON editor');
        savedWorkflow = await api.createWorkflow(workflowData);
        toast.success(`Workflow "${savedWorkflow.name}" created`);
      }
      
      // Update state with saved workflow
      console.log("WorkflowManager: JSON save successful - updating workflow state", savedWorkflow.id);
      setWorkflow(savedWorkflow);
      
      // Don't automatically switch back to visual editor - this can cause issues
      // setShowJsonEditor(false);
      
    } catch (error) {
      console.error("Error saving workflow from JSON editor:", error);
      
      if (error instanceof SyntaxError) {
        toast.error(`Invalid JSON syntax: ${error.message}`);
      } else if (error.response?.status === 409) {
        toast.error("Workflow was modified elsewhere. Please refresh and try again.");
      } else {
        toast.error(`Failed to save: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };
  
  // Simple JSON validation and update (used for the basic editor)
  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(workflowJson);
      
      // Basic validation
      if (!parsed.name) {
        toast.error('Invalid workflow format. Must include name property.');
        return;
      }
      
      console.log("Saving workflow from JSON editor:", {
        id: parsed.id,
        name: parsed.name
      });
      
      // Save via API instead of just updating local state
      handleSaveJsonToApi();
      
    } catch (error) {
      toast.error(`Failed to parse workflow JSON: ${error.message}`);
    }
  };
  
  // Handle workflow imports
  const handleImportWorkflow = () => {
    if (disabled) return;

    importTextFile({
      acceptTypes: ['.json'], // Only accept JSON files
      onSuccess: async (content, file) => {
        try {
          const importedWorkflow = JSON.parse(content);
          
          // Basic validation
          if (!importedWorkflow.name) {
            toast.error('Invalid workflow JSON format. Must include name property.');
            return;
          }
          
          // Prepare data for API
          const workflowData = {
            name: `${importedWorkflow.name} (Imported)`,
            description: importedWorkflow.description || '',
            data: {
              nodes: importedWorkflow.nodes || {},
              connections: importedWorkflow.connections || []
            }
          };
          
          // Create a new workflow in the database
          setIsSaving(true);
          const savedWorkflow = await api.createWorkflow(workflowData);
          setIsSaving(false);
          
          // Update the state with the saved workflow
          setWorkflow(savedWorkflow);
          setShowJsonEditor(false);
          toast.success(`Workflow "${savedWorkflow.name}" imported and saved to database`);

        } catch (error) {
          setIsSaving(false);
          console.error("Error processing imported workflow:", error);
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
      // Sanitize name for filename
      const safeName = (workflowToExport.name || 'untitled').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
      link.download = `workflow-${safeName}.json`;
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Workflow "${workflowToExport.name}" exported.`);
      
    } catch (error) {
      console.error("Error exporting workflow:", error);
      toast.error(`Failed to export workflow: ${error.message}`);
    }
  };
  
  // Handle creating a new workflow via API
  const handleNewWorkflow = async () => {
    if (disabled || isSaving) return;
    
    setIsSaving(true);
    
    try {
      const newWorkflowData = {
        name: 'New Workflow',
        description: '',
        data: { nodes: {}, connections: [] }
      };
      
      const savedWorkflow = await api.createWorkflow(newWorkflowData);
      
      console.log("Created a new workflow in database:", savedWorkflow.id);
      setWorkflow(savedWorkflow);
      setShowJsonEditor(false);
      toast.success(`New workflow "${savedWorkflow.name}" created`);
      
    } catch (error) {
      console.error("Error creating new workflow:", error);
      toast.error(`Failed to create new workflow: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsSaving(false);
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
            onClick={() => {
              // Log the current state before toggle
              console.log("WorkflowManager: Toggling editor mode", {
                from: showJsonEditor ? "JSON" : "Visual",
                to: showJsonEditor ? "Visual" : "JSON",
                currentWorkflow: workflow?.id
              });
              
              // Set the toggle flag directly on the workflow object to prevent auto-save
              if (workflow && setWorkflow) {
                const updatedWorkflow = {...workflow};
                updatedWorkflow._saveRequestId = "toggle_json_editor";
                console.log("WorkflowManager: Setting toggle flag on workflow", updatedWorkflow.id);
                setWorkflow(updatedWorkflow);
              }
              
              // Toggle editor mode
              setShowJsonEditor(!showJsonEditor);
            }}
            disabled={disabled || isSaving}
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
            disabled={disabled || isSaving}
          />
          <div className="flex justify-end space-x-2">
            <button
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition"
              onClick={() => {
                console.log("WorkflowManager: Canceling JSON edit and returning to visual editor");
                // Set the toggle flag to prevent auto-save
                if (workflow && setWorkflow) {
                  const updatedWorkflow = {...workflow};
                  updatedWorkflow._saveRequestId = "toggle_json_editor";
                  setWorkflow(updatedWorkflow);
                }
                setShowJsonEditor(false);
              }}
              disabled={disabled || isSaving}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              onClick={handleSaveJson}
              disabled={disabled || isSaving || !workflowJson.trim()}
            >
              {isSaving ? 'Saving...' : 'Save JSON'}
            </button>
          </div>
        </div>
      ) : (
        <WorkflowEditor
          ref={workflowEditorRef}
          workflow={workflow}
          setWorkflow={setWorkflow}
          availableTemplates={templates}
          onImport={handleImportWorkflow} 
          onExport={handleExportWorkflow} 
          onNew={handleNewWorkflow}
          disabled={disabled || isLoading || isSaving}
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