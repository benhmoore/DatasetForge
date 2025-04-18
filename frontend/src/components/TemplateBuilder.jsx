import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
// Removed useOutletContext
import api from '../api/apiClient';
import SystemPromptEditor from './SystemPromptEditor';
import ModelSelector from './ModelSelector'; // Import ModelSelector
import ToggleSwitch from './ToggleSwitch'; // Assuming a ToggleSwitch component exists or will be created
import ConfirmationModal from './ConfirmationModal'; // Import the new component
import Icon from './Icons';

const TemplateBuilder = ({ context }) => { // Accept context as prop
  // Destructure selectedDataset from context
  const { selectedDataset } = context;
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false); // State for archive confirmation modal

  // Form fields
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [slots, setSlots] = useState([]);
  const [newSlot, setNewSlot] = useState('');
  const [isToolCallingTemplate, setIsToolCallingTemplate] = useState(false);
  const [toolDefinitions, setToolDefinitions] = useState([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');
  const [newToolParameters, setNewToolParameters] = useState('');
  const [modelOverride, setModelOverride] = useState(''); // Add state for model override
  const [parameterError, setParameterError] = useState(''); // State for JSON validation error

  // Fetch templates from API
  const fetchTemplates = async () => {
    setIsLoading(true);
    
    try {
      const data = await api.getTemplates();
      setTemplates(data);
      
      // Select the first template if none is selected
      if (!selectedTemplate && data.length > 0) {
        setSelectedTemplate(data[0]);
        populateForm(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  // Load templates on initial render
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Populate form with selected template
  const populateForm = (template) => {
    if (template) {
      setName(template.name);
      setSystemPrompt(template.system_prompt);
      setUserPrompt(template.user_prompt);
      setSlots(template.slots);
      setIsToolCallingTemplate(template.is_tool_calling_template || false);
      setToolDefinitions(template.tool_definitions || []);
      setModelOverride(template.model_override || ''); // Populate model override
    } else {
      // Clear form
      setName('');
      setSystemPrompt('');
      setUserPrompt('');
      setSlots([]);
      setIsToolCallingTemplate(false);
      setToolDefinitions([]);
      setModelOverride(''); // Clear model override
    }
  };

  // Handle template selection
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    populateForm(template);
  };

  // Handle template save
  const handleSaveTemplate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const templateData = {
        name,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        slots,
        is_tool_calling_template: isToolCallingTemplate,
        tool_definitions: isToolCallingTemplate ? toolDefinitions : null,
        model_override: modelOverride || null // Include model override (send null if empty)
      };
      
      if (selectedTemplate) {
        // Update existing template with optimistic UI update
        const updatedTemplate = {
          ...selectedTemplate,
          ...templateData
        };
        
        // Update local state immediately for responsive UI
        setTemplates(templates.map(t => 
          t.id === selectedTemplate.id ? updatedTemplate : t
        ));
        
        // Update on server
        await api.updateTemplate(selectedTemplate.id, templateData);
        toast.success('Template updated successfully');
      } else {
        // Create placeholder template with temporary ID for responsive UI
        const temporaryTemplate = {
          id: `temp-${Date.now()}`,
          ...templateData,
          archived: false
        };
        
        // Update local state immediately
        setTemplates([temporaryTemplate, ...templates]);
        
        // Create on server
        const newTemplate = await api.createTemplate(templateData);
        setSelectedTemplate(newTemplate);
        toast.success('Template created successfully');
      }
      
      // Refresh templates to sync with server
      fetchTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template');
      
      // Revert optimistic updates on error
      fetchTemplates();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle template archive confirmation
  const confirmArchiveTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      await api.archiveTemplate(selectedTemplate.id);

      // Clear selection
      setSelectedTemplate(null);
      populateForm(null);

      // Refresh templates
      fetchTemplates();

      toast.success('Template archived successfully');
    } catch (error) {
      console.error('Failed to archive template:', error);
      toast.error('Failed to archive template');
    } finally {
      setIsArchiveConfirmOpen(false); // Close the confirmation modal
    }
  };

  // Open archive confirmation modal
  const handleArchiveClick = () => {
    if (selectedTemplate) {
      setIsArchiveConfirmOpen(true);
    }
  };

  // Add a new slot
  const handleAddSlot = () => {
    if (!newSlot.trim()) {
      toast.error('Please enter a slot name');
      return;
    }
    
    // Check for duplicates
    if (slots.includes(newSlot)) {
      toast.error('Slot already exists');
      return;
    }
    
    setSlots([...slots, newSlot]);
    setNewSlot('');
  };

  // Remove a slot
  const handleRemoveSlot = (slotToRemove) => {
    setSlots(slots.filter(slot => slot !== slotToRemove));
  };

  // Insert a slot into the userPrompt
  const handleInsertSlot = (slot) => {
    const cursorPos = document.getElementById('user-prompt').selectionStart;
    const textBefore = userPrompt.substring(0, cursorPos);
    const textAfter = userPrompt.substring(cursorPos);
    setUserPrompt(`${textBefore}{${slot}}${textAfter}`);
  };

  // Create a new template
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    // Clear the current selection
    setSelectedTemplate(null);
    
    // Set the form with the new name and default values
    setName(newTemplateName);
    setSystemPrompt('');
    setUserPrompt('');
    setSlots([]);
    setModelOverride(''); // Clear model override for new template
    
    // Close the modal
    setIsModalOpen(false);
    setNewTemplateName('');
  };

  // Add tool definition
  const handleAddToolDefinition = () => {
    setParameterError(''); // Clear previous errors
    try {
      // Basic validation: Check if it's potentially valid JSON before parsing
      const trimmedParams = newToolParameters.trim();
      if (!trimmedParams.startsWith('{') || !trimmedParams.endsWith('}')) {
         throw new Error('Parameters must be a valid JSON object.');
      }
      const parameters = JSON.parse(trimmedParams);

      if (!newToolName.trim()) {
        toast.error('Please enter a tool name');
        return;
      }
      if (!newToolDescription.trim()) {
        toast.error('Please enter a tool description');
        return;
      }

      const newTool = {
        // Add a simple unique ID for list keys, backend should handle persistent IDs
        id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: newToolName,
        description: newToolDescription,
        parameters
      };

      setToolDefinitions([...toolDefinitions, newTool]);
      setNewToolName('');
      setNewToolDescription('');
      setNewToolParameters('{}');
    } catch (e) {
      console.error("Parameter JSON parsing error:", e);
      setParameterError(e.message || 'Invalid JSON format for parameters.');
      toast.error('Failed to add tool: Invalid JSON for parameters.');
    }
  };
  
  // Remove tool definition
  const handleRemoveToolDefinition = (index) => {
    const newTools = [...toolDefinitions];
    newTools.splice(index, 1);
    setToolDefinitions(newTools);
  };

  // Generate a preview with sample values for slots
  const generatePreview = () => {
    let preview = userPrompt;
    
    slots.forEach(slot => {
      const placeholder = `Sample ${slot}`;
      preview = preview.replace(new RegExp(`{${slot}}`, 'g'), placeholder);
    });
    
    return preview;
  };

  return (
    <div className="grid grid-cols-4 gap-4 h-full">
      {/* Template Sidebar */}
      <div className="col-span-1 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button
            className="text-primary-600 hover:text-primary-800"
            onClick={() => setIsModalOpen(true)}
            title="Create new template"
          >
            <Icon name="plus" className="h-5 w-5" />
          </button>
        </div>
        
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No templates available
          </div>
        ) : (
          <ul className="space-y-2">
            {templates.map(template => (
              <li
                key={template.id}
                className={`p-2 rounded-md cursor-pointer transition-all duration-200 ${
                  selectedTemplate?.id === template.id
                    ? 'bg-primary-100 border-l-4 border-primary-500 translate-x-1 shadow-sm'
                    : 'hover:bg-gray-100 hover:translate-x-1 border-l-4 border-transparent'
                }`}
                onClick={() => handleSelectTemplate(template)}
              >
                {typeof template.id === 'string' && template.id.startsWith('temp-') ? (
                  <span className="flex items-center">
                    <Icon name="spinner" className="animate-spin h-5 w-5 mr-2" />
                    {template.name}
                  </span>
                ) : (
                  template.name
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Template Editor */}
      <div className="col-span-3 p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {selectedTemplate ? 'Edit Template' : 'New Template'}
          </h2>
          
          <div className="space-x-2">
            {selectedTemplate && (
              <button
                className="px-3 py-1 text-red-600 hover:text-red-800 border border-red-200 rounded-md"
                onClick={handleArchiveClick} // Changed to open confirmation modal
                disabled={isSaving}
              >
                Archive
              </button>
            )}
            
            <button
              className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              onClick={handleSaveTemplate}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
        
        {/* Template Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="Enter template name"
            />
          </div>

          {/* Model Override Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Override (Optional)
            </label>
            <ModelSelector
              selectedModel={modelOverride}
              onModelChange={setModelOverride}
              allowNone={true} // Allow clearing the override
            />
            <p className="text-xs text-gray-500 mt-1">If set, this model will be used instead of your default generation model.</p>
          </div>
          
          <div>
            <SystemPromptEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              templateId={selectedTemplate?.id}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Prompt Template
            </label>
            <textarea
              id="user-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md h-32"
              placeholder="Enter user prompt with {slot} placeholders"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slots
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                className="flex-grow p-2 border border-gray-300 rounded-md"
                placeholder="New slot name"
              />
              <button
                className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleAddSlot}
              >
                Add
              </button>
            </div>
            
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map(slot => (
                <div
                  key={slot}
                  className="flex items-center bg-gray-100 px-2 py-1 rounded-md"
                >
                  <span className="mr-2">{slot}</span>
                  <button
                    className="text-gray-500 hover:text-gray-700"
                    onClick={() => handleRemoveSlot(slot)}
                    title="Remove slot"
                  >
                    ✕
                  </button>
                  <button
                    className="ml-1 text-primary-600 hover:text-primary-800"
                    onClick={() => handleInsertSlot(slot)}
                    title="Insert slot in template"
                  >
                    ↩
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tool Calling Toggle & Section */}
          <div className="space-y-4 p-4 border border-gray-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="toolCallingToggle" className="text-md font-semibold text-gray-800">
                  Enable Tool Calling
                </label>
                <p className="text-sm text-gray-500">Allow the model to call predefined functions during generation.</p>
              </div>
              <ToggleSwitch
                id="toolCallingToggle"
                checked={isToolCallingTemplate} // Changed 'enabled' to 'checked'
                onChange={setIsToolCallingTemplate}
              />
            </div>

            {/* Tool Definitions Section - always visible, but disabled visually */}
            <div className={`space-y-4 transition-opacity duration-300 ${!isToolCallingTemplate ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <h3 className="text-md font-semibold text-gray-700 pt-2 border-t border-gray-200">Tool Definitions</h3>

              {/* Display Existing Tools */}
              {toolDefinitions.length === 0 && isToolCallingTemplate && (
                <p className="text-sm text-gray-500 italic">No tools defined yet. Add one below.</p>
              )}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {toolDefinitions.map((tool, index) => (
                  <div key={tool.id || index} className="p-3 bg-gray-50 rounded border border-gray-200 flex justify-between items-start shadow-sm">
                    <div className="flex-1 mr-2">
                      <div className="font-medium text-gray-800">{tool.name}</div>
                      <div className="text-sm text-gray-600 mt-1">{tool.description}</div>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Parameters Schema</summary>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-gray-700 overflow-x-auto">
                          {JSON.stringify(tool.parameters, null, 2)}
                        </pre>
                      </details>
                    </div>
                    <button
                      onClick={() => handleRemoveToolDefinition(index)}
                      className="text-red-500 hover:text-red-700 text-xl font-light p-1"
                      title="Remove tool"
                      disabled={!isToolCallingTemplate} // Also disable button explicitly
                    >
                      &times; {/* More standard 'remove' icon */}
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Tool Form */}
              <div className="pt-4 border-t border-gray-200">
                 <h4 className="text-sm font-semibold text-gray-700 mb-2">Add New Tool</h4>
                 <div className="space-y-3">
                   <div>
                     <label className="block text-xs font-medium text-gray-600 mb-1">Tool Name</label>
                     <input
                       type="text"
                       placeholder="e.g., getWeather"
                       value={newToolName}
                       onChange={(e) => setNewToolName(e.target.value)}
                       className="w-full p-2 border border-gray-300 rounded-md text-sm"
                       disabled={!isToolCallingTemplate}
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-gray-600 mb-1">Tool Description</label>
                     <input
                       type="text"
                       placeholder="e.g., Gets the current weather for a location"
                       value={newToolDescription}
                       onChange={(e) => setNewToolDescription(e.target.value)}
                       className="w-full p-2 border border-gray-300 rounded-md text-sm"
                       disabled={!isToolCallingTemplate}
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-gray-600 mb-1">Parameters (JSON Schema)</label>
                     <textarea
                       placeholder='e.g., { "type": "object", "properties": { "location": { "type": "string", "description": "City name" } }, "required": ["location"] }, or {} for no parameters'
                       value={newToolParameters}
                       onChange={(e) => {
                         setNewToolParameters(e.target.value);
                         setParameterError(''); // Clear error on change
                       }}
                       className={`w-full p-2 border rounded-md h-28 font-mono text-sm ${parameterError ? 'border-red-500' : 'border-gray-300'}`}
                       disabled={!isToolCallingTemplate}
                     />
                     {parameterError && <p className="text-xs text-red-600 mt-1">{parameterError}</p>}
                     {!parameterError && <p className="text-xs text-gray-500 mt-1">Define the input parameters for the tool using JSON Schema.</p>}
                   </div>
                   <button
                     onClick={handleAddToolDefinition}
                     className="px-4 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm disabled:opacity-50"
                     disabled={!isToolCallingTemplate}
                   >
                     Add Tool Definition
                   </button>
                 </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preview
            </label>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              {generatePreview()}
            </div>
          </div>
        </div>
      </div>
      
      {/* New Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Create New Template</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name
              </label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-md"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleCreateTemplate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      <ConfirmationModal
        isOpen={isArchiveConfirmOpen}
        onClose={() => setIsArchiveConfirmOpen(false)}
        onConfirm={confirmArchiveTemplate}
        title="Confirm Archive"
        message={
          selectedTemplate ? (
            <>
              Are you sure you want to archive the template "<strong>{selectedTemplate.name}</strong>"?
              This action cannot be undone directly.
            </>
          ) : ''
        }
        confirmButtonText="Confirm Archive"
        confirmButtonVariant="danger"
      />
    </div>
  );
};

export default TemplateBuilder;