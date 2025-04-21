import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Icon from "./Icons";
import api from "../api/apiClient";

// Define items per page consistent with backend default/max
const ITEMS_PER_PAGE = 50;

function WorkflowSelector({ onSelect, currentWorkflowId }) {
  const [workflows, setWorkflows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState(null);

  // Memoized function to fetch workflows for a specific page
  const fetchWorkflows = useCallback(async (pageNum) => {
    console.log(`Fetching workflows page: ${pageNum}`);
    setIsLoading(true);
    setError(null); // Clear previous errors
    try {
      const result = await api.getWorkflows(pageNum, ITEMS_PER_PAGE);
      setWorkflows(result.items);
      // Calculate total pages based on total items and page size
      const calculatedTotalPages =
        Math.ceil(result.total / ITEMS_PER_PAGE) || 1; // Ensure at least 1 page
      setTotalPages(calculatedTotalPages);

      // If the requested page is now out of bounds (e.g., after delete on last page), fetch the new last valid page
      if (pageNum > calculatedTotalPages && calculatedTotalPages > 0) {
        setPage(calculatedTotalPages); // Trigger refetch of the last page
      } else {
        setWorkflows(result.items); // Otherwise, set the fetched items
      }
    } catch (err) {
      console.error("Failed to load workflows:", err);
      const errorMsg =
        err.response?.data?.detail || "Failed to load workflows";
      setError(errorMsg); // Store error message
      toast.error(errorMsg); // Show toast notification
      setWorkflows([]); // Clear workflows on error
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies needed if ITEMS_PER_PAGE is constant

  // Effect to fetch workflows when the page changes
  useEffect(() => {
    fetchWorkflows(page);
  }, [page, fetchWorkflows]); // Depend on page and the fetch function itself

  // Handler for deleting a workflow
  const handleDelete = async (e, workflow) => {
    e.stopPropagation(); // Prevent selection when clicking delete icon

    // Use a simple confirm dialog for this local application
    if (
      window.confirm(
        `Are you sure you want to delete "${workflow.name}"?`
      )
    ) {
      try {
        setIsLoading(true); // Indicate activity
        await api.deleteWorkflow(workflow.id);
        toast.success(`Workflow "${workflow.name}" deleted`);
        // Refetch the current page to update the list accurately
        fetchWorkflows(page);
      } catch (err) {
        console.error("Failed to delete workflow:", err);
        toast.error(
          err.response?.data?.detail || "Failed to delete workflow"
        );
        setIsLoading(false); // Ensure loading is reset on error
      }
      // No finally block needed here as fetchWorkflows resets loading state
    }
  };

  // Handler for duplicating a workflow
  const handleDuplicate = async (e, workflow) => {
    e.stopPropagation(); // Prevent selection when clicking duplicate icon

    try {
      setIsLoading(true); // Indicate activity
      const duplicated = await api.duplicateWorkflow(workflow.id);
      toast.success(`Workflow duplicated as "${duplicated.name}"`);
      // Refetch the current page to update the list accurately.
      fetchWorkflows(page);
    } catch (err) {
      console.error("Failed to duplicate workflow:", err);
      toast.error(
        err.response?.data?.detail || "Failed to duplicate workflow"
      );
      setIsLoading(false); // Ensure loading is reset on error
    }
    // No finally block needed here as fetchWorkflows resets loading state
  };

  return (
    <div className="workflow-selector">
      <h3 className="text-lg font-medium mb-3">Your Workflows</h3>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex justify-center items-center py-4 min-h-[100px]">
          <div
            className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"
            role="status"
            aria-label="Loading..."
          ></div>
        </div>
      ) : /* Error State */
      error ? (
        <div className="text-center py-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
          Error: {error}
        </div>
      ) : /* Empty State */
      workflows.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          No workflows found. Create one to get started!
        </div>
      ) : (
        /* Workflow List and Pagination */
        <>
          {/* Workflow List */}
          <div className="space-y-2 max-h-96 overflow-y-auto border rounded p-2 bg-gray-50">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`p-3 border rounded hover:bg-gray-100 cursor-pointer flex justify-between items-center transition-colors duration-150 ${
                  workflow.id === currentWorkflowId
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                    : "border-gray-200 bg-white"
                }`}
                onClick={() => onSelect(workflow)}
                role="button"
                tabIndex={0} // Make it focusable
                onKeyPress={(e) =>
                  e.key === "Enter" && onSelect(workflow)
                } // Basic keyboard accessibility
              >
                {/* Workflow Info */}
                <div className="flex-grow mr-2 overflow-hidden">
                  <div
                    className="font-medium truncate"
                    title={workflow.name}
                  >
                    {workflow.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    Updated{" "}
                    {new Date(
                      workflow.updated_at
                    ).toLocaleString()}{" "}
                    (v{workflow.version})
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-1 flex-shrink-0">
                  <button
                    onClick={(e) =>
                      handleDuplicate(e, workflow)
                    }
                    className="p-1 text-gray-500 hover:text-blue-600 rounded hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    title="Duplicate workflow"
                    aria-label={`Duplicate workflow ${workflow.name}`}
                  >
                    <Icon name="copy" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) =>
                      handleDelete(e, workflow)
                    }
                    className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-400"
                    title="Delete workflow"
                    aria-label={`Delete workflow ${workflow.name}`}
                  >
                    <Icon
                      name="trash"
                      className="w-4 h-4"
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-4 space-x-2">
              <button
                onClick={() =>
                  setPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={page === 1 || isLoading}
                className="px-2 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Previous page"
              >
                <Icon name="chevronLeft" className="w-4 h-4" />
              </button>
              <span className="px-2 py-1 text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((prev) =>
                    Math.min(prev + 1, totalPages)
                  )
                }
                disabled={page === totalPages || isLoading}
                className="px-2 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                aria-label="Next page"
              >
                <Icon
                  name="chevronRight"
                  className="w-4 h-4"
                />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WorkflowSelector;