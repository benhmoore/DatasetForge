import React from "react";
import { toast } from "react-toastify";
import ConfirmationModal from "./ConfirmationModal"; // Re-use existing modal component
import WorkflowSelector from "./WorkflowSelector";
import Icon from "./Icons";

/**
 * Default template for creating new workflows
 * This structure matches the backend API's expected format:
 * - name: String - Name of the workflow
 * - description: String - Optional description
 * - data: Object - Contains nodes and connections
 *   - nodes: Object - Map of node IDs to node configurations
 *   - connections: Array - List of connections between nodes
 */
const NEW_WORKFLOW_TEMPLATE = {
  name: "New Workflow",
  description: "",
  data: { nodes: {}, connections: [] },
};

/**
 * Modal component for browsing and selecting workflows
 * Allows users to select an existing workflow or create a new one
 * 
 * @param {boolean} isOpen - Whether the modal is currently visible
 * @param {function} onClose - Function to call when closing the modal
 * @param {function} onSelect - Function to call when a workflow is selected or created
 * @param {number} currentWorkflowId - ID of the currently active workflow (for highlighting)
 */
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