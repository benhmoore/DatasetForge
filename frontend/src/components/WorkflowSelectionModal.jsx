import React from "react";
import ConfirmationModal from "./ConfirmationModal"; // Re-use existing modal component
import WorkflowSelector from "./WorkflowSelector";

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

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select or Create Workflow"
      confirmButtonText="Create New Workflow"
      confirmButtonVariant="primary"
      onConfirm={() => {
        // Pass a structured object representing the intent to create a new workflow
        onSelect({ ...NEW_WORKFLOW_TEMPLATE, isNew: true });
        onClose(); // Close the modal after initiating creation
      }}
      cancelButtonText="Cancel"
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