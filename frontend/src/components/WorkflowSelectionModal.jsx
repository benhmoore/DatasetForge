import React from "react";
import { toast } from "react-toastify";
import ConfirmationModal from "./ConfirmationModal"; // Re-use existing modal component
import WorkflowSelector from "./WorkflowSelector";
import Icon from "./Icons";

// Default empty workflow structure for creating a new one
const NEW_WORKFLOW_TEMPLATE = {
  name: "New Workflow",
  description: "",
  data: { nodes: {}, connections: [] }, // Match backend 'data' structure expected by API
};

function WorkflowSelectionModal({
  isOpen,
  onClose,
  onSelect,
  currentWorkflowId,
}) {
  // Don't render the modal if it's not open
  if (!isOpen) {
    return null;
  }

  const handleCreateNewWorkflow = () => {
    // Pass a structured object representing the intent to create a new workflow
    onSelect({ ...NEW_WORKFLOW_TEMPLATE, isNew: true });
    toast.info("Creating new workflow...");
    onClose(); // Close the modal after initiating creation
  };

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <Icon name="workflow" className="h-5 w-5 mr-2 text-blue-600" />
          <span>Select or Create Workflow</span>
        </div>
      }
      confirmButtonText={
        <div className="flex items-center">
          <Icon name="plus" className="w-4 h-4 mr-1" />
          <span>Create New Workflow</span>
        </div>
      }
      confirmButtonVariant="primary"
      onConfirm={handleCreateNewWorkflow}
      cancelButtonText="Cancel"
      size="lg" // Use a larger modal size for better viewing of the workflow list
    >
      <div className="p-4 max-h-[70vh] overflow-y-auto">
        {/* Embed the Workflow Selector */}
        <WorkflowSelector
          onSelect={(workflow) => {
            onSelect(workflow); // Pass the selected workflow object up
            onClose(); // Close the modal automatically on selection
          }}
          currentWorkflowId={currentWorkflowId} // Highlight the currently active workflow
        />
      </div>
    </ConfirmationModal>
  );
}

export default WorkflowSelectionModal;