import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import Icon from './Icons';

const ExampleDetailModal = ({ isOpen, example, datasetId, onClose, onExampleUpdated }) => {
  // State declarations - always in the same order
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedExample, setEditedExample] = useState(null);
  const [activeTab, setActiveTab] = useState('content');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Refs - always in the same order
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

  // All useCallbacks must be defined before any conditional returns
  // Handle input changes for system prompt, variation prompt, and output
  const handleInputChange = useCallback((field, value) => {
    setEditedExample(prev => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Handle input changes for slots
  const handleSlotChange = useCallback((slotName, value) => {
    setEditedExample(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotName]: value
      }
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Toggle edit mode
  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  // Cancel editing and reset to original values
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges && example) {
      setEditedExample(JSON.parse(JSON.stringify(example)));
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
  }, [example, hasUnsavedChanges]);

  // Save changes to the example
  const handleSave = useCallback(async () => {
    if (!editedExample || !datasetId) return;
    
    setIsSaving(true);
    
    try {
      await api.updateExample(datasetId, example.id, editedExample);
      toast.success('Example updated successfully');
      setIsEditing(false);
      setHasUnsavedChanges(false);
      if (onExampleUpdated) {
        onExampleUpdated(editedExample);
      }
    } catch (error) {
      console.error('Failed to update example:', error);
      toast.error(error.message || 'Failed to update example');
    } finally {
      setIsSaving(false);
    }
  }, [datasetId, editedExample, example?.id, onExampleUpdated]);

  // Format date helper function - defined outside of render
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }, []);

  // Initialize edited example when the modal opens or when example changes
  useEffect(() => {
    if (example) {
      // Create a deep copy of the example to avoid reference issues
      // Ensure the mask fields are always defined in the copy
      const exampleCopy = JSON.parse(JSON.stringify(example));
      exampleCopy.system_prompt_mask = example.system_prompt_mask || null;
      exampleCopy.user_prompt_mask = example.user_prompt_mask || null;
      
      setEditedExample(exampleCopy);
      
      // Reset editing state and unsaved changes flag if example changes
      setIsEditing(false);
      setHasUnsavedChanges(false);
      
      // Reset to the content tab when opening a new example
      setActiveTab('content');
    }
  }, [example]);

  // Focus the first input when entering edit mode
  useEffect(() => {
    if (isEditing && firstInputRef.current) {
      // Small delay to ensure the DOM is ready
      setTimeout(() => {
        firstInputRef.current.focus();
      }, 50);
    }
  }, [isEditing]);

  // Handle escape key to close modal or exit edit mode
  useEffect(() => {
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') {
        if (isEditing && hasUnsavedChanges) {
          // Show confirmation before canceling edit
          if (window.confirm('You have unsaved changes. Discard changes?')) {
            handleCancel();
          }
        } else if (isEditing) {
          handleCancel();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isEditing, hasUnsavedChanges, onClose, handleCancel]);

  // Handle click outside to close modal (but not when editing with unsaved changes)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(e.target) && 
        isOpen && 
        !isEditing
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isEditing, onClose]);

  // If modal is not open or no example is provided, don't render anything
  if (!isOpen || !example) return null;

  // Get slot keys (if any)
  const slotKeys = example ? Object.keys(example.slots || {}) : [];
  
  // Check if there are tool calls
  const hasToolCalls = example.tool_calls && example.tool_calls.length > 0;

  // Determine which tab should contain slots based on content length
  const shouldShowSlotsInSeparateTab = slotKeys.length > 4;

  // Render Tab Navigation 
  const renderTabs = () => {
    const tabs = [
      { id: 'content', label: 'Content', icon: 'document' },
      ...(shouldShowSlotsInSeparateTab && slotKeys.length > 0 ? [{ id: 'slots', label: 'Slots', icon: 'tag', badge: slotKeys.length }] : []),
      ...(hasToolCalls ? [{ id: 'tools', label: 'Tool Calls', icon: 'tool', badge: example.tool_calls.length }] : []),
      { id: 'metadata', label: 'Metadata', icon: 'info' }
    ];

    return (
      <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-3 flex items-center ${
              activeTab === tab.id
                ? 'border-b-2 border-primary-600 text-primary-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300'
            } transition-colors duration-150`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} className="h-4 w-4 mr-2" />
            {tab.label}
            {tab.badge && (
              <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  };

  // Render the content tab
  const renderContentTab = () => (
    <div className="space-y-4">
      {/* System Prompt - Display masked version if available */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
          {example.system_prompt_mask ? (
            <>
              <span className="mr-2">System Prompt</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">MASKED</span>
            </>
          ) : (
            "System Prompt"
          )}
        </label>
        {isEditing ? (
          <textarea
            ref={firstInputRef}
            value={editedExample.system_prompt}
            onChange={(e) => handleInputChange('system_prompt', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors"
            rows={4}
            placeholder="Enter system prompt..."
          />
        ) : (
          <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap min-h-[4em] border border-gray-100">
            {example.system_prompt_mask ? (
              <>
                <div className="whitespace-pre-wrap">{example.system_prompt_mask}</div>
                <div className="mt-2 text-xs text-indigo-500">
                  <em>This is a masked prompt that will be used for exports. View the actual prompt in the Metadata tab.</em>
                </div>
              </>
            ) : (
              example.system_prompt || <span className="text-gray-400 italic">No system prompt</span>
            )}
          </div>
        )}
      </div>
      
      {/* User Prompt - Display masked version if available */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
          {example.user_prompt_mask ? (
            <>
              <span className="mr-2">User Prompt</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">MASKED</span>
            </>
          ) : (
            "User Prompt"
          )}
        </label>
        {isEditing ? (
          <textarea
            value={editedExample.user_prompt}
            onChange={(e) => handleInputChange('user_prompt', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors"
            rows={3}
            placeholder="Enter user prompt..."
          />
        ) : (
          <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap min-h-[3em] border border-gray-100">
            {example.user_prompt_mask ? (
              <>
                <div className="whitespace-pre-wrap">{example.user_prompt_mask}</div>
                <div className="mt-2 text-xs text-indigo-500">
                  <em>This is a masked prompt that will be used for exports. View the actual prompt in the Metadata tab.</em>
                </div>
              </>
            ) : (
              example.user_prompt || <span className="text-gray-400 italic">No user prompt</span>
            )}
          </div>
        )}
      </div>

      {/* Slots (only if there are a small number of slots) */}
      {!shouldShowSlotsInSeparateTab && slotKeys.length > 0 && (
        <div>
          <h3 className="text-md font-medium text-gray-700 mb-2 flex items-center">
            <Icon name="tag" className="h-4 w-4 mr-1 text-gray-500" />
            Slots
            <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {slotKeys.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slotKeys.map((slot) => (
              <div key={slot} className="relative group">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {slot}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedExample.slots[slot] || ''}
                    onChange={(e) => handleSlotChange(slot, e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder={`Enter value for ${slot}...`}
                  />
                ) : (
                  <div className="p-3 bg-gray-50 rounded-md border border-gray-100 group-hover:border-gray-200 transition-colors">
                    {example.slots[slot] || <span className="text-gray-400 italic">Empty</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Output
        </label>
        {isEditing ? (
          <textarea
            value={editedExample.output}
            onChange={(e) => handleInputChange('output', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors"
            rows={6}
            placeholder="Enter expected output..."
          />
        ) : (
          <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap min-h-[6em] border border-gray-100">
            {example.output || <span className="text-gray-400 italic">No output</span>}
          </div>
        )}
      </div>
    </div>
  );

  // Render the slots tab (only when there are many slots)
  const renderSlotsTab = () => {
    if (!shouldShowSlotsInSeparateTab || slotKeys.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium text-gray-700 flex items-center">
            <Icon name="tag" className="h-4 w-4 mr-1 text-gray-500" />
            Slots
            <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {slotKeys.length}
            </span>
          </h3>
          {isEditing && (
            <div className="text-xs text-gray-500">
              Editing {slotKeys.length} slot{slotKeys.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slotKeys.map((slot) => (
            <div key={slot} className="relative group">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {slot}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedExample.slots[slot] || ''}
                  onChange={(e) => handleSlotChange(slot, e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  placeholder={`Enter value for ${slot}...`}
                />
              ) : (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-100 group-hover:border-gray-200 transition-colors">
                  {example.slots[slot] || <span className="text-gray-400 italic">Empty</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render the tool calls tab
  const renderToolCallsTab = () => {
    if (!hasToolCalls) return null;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-md font-medium text-gray-700 flex items-center">
            <Icon name="tool" className="h-4 w-4 mr-1 text-gray-500" />
            Tool Calls
            <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {example.tool_calls.length}
            </span>
          </h3>
        </div>
        
        {/* Note: Tool calls are not editable in this version */}
        <div className="divide-y divide-gray-100">
          {example.tool_calls.map((call, index) => {
            // Extract function name and arguments based on the structure
            let name = "Unknown Tool";
            let args = {};
            
            if (call.function) {
              // Standard OpenAI format
              name = call.function.name || "Unknown Tool";
              try {
                args = typeof call.function.arguments === 'string' 
                  ? JSON.parse(call.function.arguments) 
                  : call.function.arguments || {};
              } catch (e) {
                console.error("Error parsing tool call arguments:", e);
                args = { error: "Failed to parse", raw: call.function.arguments };
              }
            } else if (call.name) {
              // Simple format with name and parameters directly
              name = call.name;
              args = call.parameters || {};
            }
            
            return (
              <div key={index} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-800 text-xs font-medium mr-2">
                    {index + 1}
                  </span>
                  <div className="font-medium text-blue-700">{name}</div>
                </div>
                <pre className="text-xs mt-2 bg-gray-100 p-2 rounded overflow-x-auto border border-gray-200 max-h-64 scrollbar-thin scrollbar-thumb-gray-300">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render the metadata tab
  const renderMetadataTab = () => {
    // Extract and format metadata
    const metadata = {
      'ID': example.id,
      'Created At': formatDate(example.created_at),
      'Updated At': formatDate(example.updated_at),
      'Dataset ID': datasetId,
      'Number of Slots': slotKeys.length,
      'Number of Tool Calls': example.tool_calls?.length || 0,
    };

    return (
      <div className="space-y-4">
        <h3 className="text-md font-medium text-gray-700 flex items-center">
          <Icon name="info" className="h-4 w-4 mr-1 text-gray-500" />
          Metadata
        </h3>
        
        <div className="bg-gray-50 rounded-md border border-gray-100 divide-y divide-gray-200">
          {/* Basic metadata */}
          {Object.entries(metadata).map(([key, value]) => (
            <div key={key} className="flex p-3">
              <span className="w-1/3 font-medium text-gray-700">{key}</span>
              <span className="w-2/3 text-gray-600 break-all">{value}</span>
            </div>
          ))}
          
          {/* Prompt details section */}
          <div key="prompt-section" className="p-3">
            <span className="font-medium text-gray-700 block mb-2">Prompt Details</span>
            
            {/* System prompt details */}
            <div className="mb-4">
              <div className="flex items-center mb-1">
                <span className="text-sm font-medium text-gray-700">Actual System Prompt</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1 rounded">Used for generation</span>
              </div>
              <div className="p-2 bg-white border border-gray-200 rounded-md text-sm whitespace-pre-wrap">
                {example.system_prompt || <span className="text-gray-400 italic">No system prompt</span>}
              </div>
              
              <div className="mt-3">
                <div className="flex items-center mb-1">
                  <span className="text-sm font-medium text-indigo-700">Masked System Prompt</span>
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-1 rounded">Used for exports</span>
                  {!isEditing && example.system_prompt_mask && (
                    <button 
                      className="ml-auto text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                      onClick={handleEdit}
                    >
                      Edit Mask
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <textarea
                    value={editedExample.system_prompt_mask || ''}
                    onChange={(e) => handleInputChange('system_prompt_mask', e.target.value)}
                    className="w-full p-2 border border-indigo-300 bg-indigo-50 rounded-md focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    rows={4}
                    placeholder="Enter masked system prompt (leave empty to use actual prompt)"
                  />
                ) : (
                  <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-md text-sm whitespace-pre-wrap min-h-[2em]">
                    {example.system_prompt_mask ? (
                      example.system_prompt_mask
                    ) : (
                      <span className="text-gray-400 italic">No mask (exports will use actual prompt)</span>
                    )}
                  </div>
                )}
                {isEditing && (
                  <div className="flex justify-end mt-1">
                    <button 
                      className="text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                      onClick={() => handleInputChange('system_prompt_mask', example.system_prompt)}
                    >
                      Copy from actual
                    </button>
                    <button 
                      className="text-xs px-2 py-0.5 text-red-600 bg-red-50 rounded hover:bg-red-100 ml-2"
                      onClick={() => handleInputChange('system_prompt_mask', '')}
                    >
                      Clear mask
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* User prompt details */}
            <div>
              <div className="flex items-center mb-1">
                <span className="text-sm font-medium text-gray-700">Actual User Prompt</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1 rounded">Used for generation</span>
              </div>
              <div className="p-2 bg-white border border-gray-200 rounded-md text-sm whitespace-pre-wrap">
                {example.user_prompt || <span className="text-gray-400 italic">No user prompt</span>}
              </div>
              
              <div className="mt-3">
                <div className="flex items-center mb-1">
                  <span className="text-sm font-medium text-indigo-700">Masked User Prompt</span>
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-1 rounded">Used for exports</span>
                  {!isEditing && example.user_prompt_mask && (
                    <button 
                      className="ml-auto text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                      onClick={handleEdit}
                    >
                      Edit Mask
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <textarea
                    value={editedExample.user_prompt_mask || ''}
                    onChange={(e) => handleInputChange('user_prompt_mask', e.target.value)}
                    className="w-full p-2 border border-indigo-300 bg-indigo-50 rounded-md focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    rows={4}
                    placeholder="Enter masked user prompt (leave empty to use actual prompt)"
                  />
                ) : (
                  <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-md text-sm whitespace-pre-wrap min-h-[2em]">
                    {example.user_prompt_mask ? (
                      example.user_prompt_mask
                    ) : (
                      <span className="text-gray-400 italic">No mask (exports will use actual prompt)</span>
                    )}
                  </div>
                )}
                {isEditing && (
                  <div className="flex justify-end mt-1">
                    <button 
                      className="text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                      onClick={() => handleInputChange('user_prompt_mask', example.user_prompt)}
                    >
                      Copy from actual
                    </button>
                    <button 
                      className="text-xs px-2 py-0.5 text-red-600 bg-red-50 rounded hover:bg-red-100 ml-2"
                      onClick={() => handleInputChange('user_prompt_mask', '')}
                    >
                      Clear mask
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'content':
        return renderContentTab();
      case 'slots':
        return renderSlotsTab();
      case 'tools':
        return renderToolCallsTab();
      case 'metadata':
        return renderMetadataTab();
      default:
        return renderContentTab();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4"
      aria-labelledby="example-detail-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Make the modal container a flex column and set max height */}
      <div 
        ref={modalRef}
        className="bg-white rounded-lg w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col animate-fadeIn"
        aria-labelledby="example-modal-title"
      >
        {/* Header - Make it non-shrinkable */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-200 flex-shrink-0">
          <h2 id="example-modal-title" className="text-xl font-semibold flex items-center">
            <Icon name="document" className="h-5 w-5 mr-2 text-gray-500" />
            Example Details
            {hasUnsavedChanges && (
              <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">
                Unsaved changes
              </span>
            )}
          </h2>
          <button
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label="Close modal"
            title="Close"
            disabled={isEditing && hasUnsavedChanges}
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs Navigation */}
        {renderTabs()}

        {/* Content Area - Make it grow and scrollable */}
        <div className="flex-grow overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300">
          {renderTabContent()}
        </div>

        {/* Action buttons - Make it non-shrinkable */}
        <div className="flex justify-end space-x-2 p-6 pt-4 border-t border-gray-200 flex-shrink-0 bg-gray-50">
          {isEditing ? (
            <>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:bg-primary-300"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <>
                    <Icon name="spinner" className="animate-spin h-5 w-5 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Icon name="save" className="h-5 w-5 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                onClick={onClose}
              >
                Close
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
                onClick={handleEdit}
              >
                <Icon name="edit" className="h-5 w-5 mr-2" />
                Edit Example
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExampleDetailModal;