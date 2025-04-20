import { useState, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export const useWorkflow = () => {
  // Workflow related state
  const [workflowEnabled, setWorkflowEnabled] = useState(() => {
    const savedState = localStorage.getItem('datasetforge_workflowEnabled');
    return savedState ? savedState === 'true' : false; // Correctly parse boolean
  });
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false); 
  const [workflowSaveRequest, setWorkflowSaveRequest] = useState(null);

  // Load workflow from localStorage
  useEffect(() => {
    try {
      const savedWorkflow = localStorage.getItem('datasetforge_currentWorkflow');
      if (savedWorkflow) {
        setCurrentWorkflow(JSON.parse(savedWorkflow));
      }
      
      const workflowEnabledSetting = localStorage.getItem('datasetforge_workflowEnabled');
      if (workflowEnabledSetting) {
        setWorkflowEnabled(workflowEnabledSetting === 'true');
      }
    } catch (error) {
      console.error('Failed to load workflow from localStorage:', error);
      // Clear potentially corrupted data
      localStorage.removeItem('datasetforge_currentWorkflow');
      localStorage.removeItem('datasetforge_workflowEnabled');
    }
  }, []);
  
  // Debounced function to save workflow to localStorage
  const debouncedSaveWorkflow = useDebouncedCallback((workflowToSave) => {
    if (workflowToSave) {
      console.log("Generate (Debounced): Saving workflow to localStorage", {
        id: workflowToSave.id, 
        nodeCount: Object.keys(workflowToSave.nodes || {}).length,
        connectionCount: (workflowToSave.connections || []).length
      });
      localStorage.setItem('datasetforge_currentWorkflow', JSON.stringify(workflowToSave));
    } else {
      console.log("Generate (Debounced): Removing workflow from localStorage");
      localStorage.removeItem('datasetforge_currentWorkflow');
    }
  }, 500); // Debounce for 500ms

  // Save workflow to localStorage when it changes (using debounced function)
  useEffect(() => {
    // Call the debounced save function whenever currentWorkflow changes
    debouncedSaveWorkflow(currentWorkflow);
  }, [currentWorkflow, debouncedSaveWorkflow]);
  
  // Save workflow enabled setting to localStorage
  useEffect(() => {
    localStorage.setItem('datasetforge_workflowEnabled', workflowEnabled.toString());
  }, [workflowEnabled]);

  // Handler for toggling workflow mode
  const handleToggleWorkflow = () => {
    setWorkflowEnabled(!workflowEnabled);
  };

  // Handler for workflow import
  const handleWorkflowImport = (workflow) => {
    setCurrentWorkflow(workflow);
  };

  // Handler to open the workflow modal
  const handleOpenWorkflowModal = () => {
    setIsWorkflowModalOpen(true);
  };

  // Handler to close the workflow modal
  const handleCloseWorkflowModal = () => {
    // Trigger save in WorkflowEditor before closing
    if (currentWorkflow) {
      console.log("Generate: Requesting workflow save before closing modal");
      setWorkflowSaveRequest(Date.now()); // Use timestamp to trigger save
    }
    
    // Set a small delay to ensure save completes before closing
    setTimeout(() => {
      setIsWorkflowModalOpen(false);
    }, 100);
  };

  return {
    workflowEnabled,
    setWorkflowEnabled,
    currentWorkflow,
    setCurrentWorkflow,
    isExecutingWorkflow,
    setIsExecutingWorkflow,
    isWorkflowModalOpen,
    workflowSaveRequest,
    handleToggleWorkflow,
    handleWorkflowImport,
    handleOpenWorkflowModal,
    handleCloseWorkflowModal
  };
};

export default useWorkflow;