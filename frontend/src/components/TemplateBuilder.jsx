import { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { toast } from 'react-toastify';
// Removed useOutletContext
import api from '../api/apiClient';
import SystemPromptEditor from './SystemPromptEditor';
import ModelSelector from './ModelSelector'; // Import ModelSelector
import ToggleSwitch from './ToggleSwitch'; // Assuming a ToggleSwitch component exists or will be created
import ConfirmationModal from './ConfirmationModal'; // Import the new component
import Icon from './Icons';
import ToolParameterSchemaEditor from './ToolParameterSchemaEditor'; // Import the new schema editor
import _ from 'lodash'; // Import lodash for deep comparison

// Default model parameters
const defaultModelParameters = {
  temperature: 1.0,
  top_p: 1.0,
  max_tokens: null,
};

const TemplateBuilder = ({ context }) => { // Accept context as prop
  const { selectedDataset } = context;
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false); // State for archive confirmation modal
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // State for unsaved changes

  // Validation state
  const [nameError, setNameError] = useState(false);
  const [newToolNameError, setNewToolNameError] = useState(false);
  const [newToolDescriptionError, setNewToolDescriptionError] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  // Add mask fields
  const [systemPromptMask, setSystemPromptMask] = useState('');
  const [userPromptMask, setUserPromptMask] = useState('');
  const [showMasks, setShowMasks] = useState(false);
  
  const [slots, setSlots] = useState([]);
  const [newSlot, setNewSlot] = useState('');
  const [isToolCallingTemplate, setIsToolCallingTemplate] = useState(false);
  const [toolDefinitions, setToolDefinitions] = useState([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');
  const [newToolSchema, setNewToolSchema] = useState({ type: 'object', properties: {}, required: [] }); // Replace newToolParameters state
  const [modelOverride, setModelOverride] = useState(''); // Add state for model override
  const [modelParameters, setModelParameters] = useState(_.cloneDeep(defaultModelParameters)); // Add state for model parameters

  // Helper function to get current form state as an object
  const getCurrentFormData = useCallback(() => {
    const parseNullableInt = (value) => {
      const num = parseInt(value, 10);
      return isNaN(num) ? null : num;
    };
    const parseNullableFloat = (value) => {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };

    return {
      name,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      system_prompt_mask: systemPromptMask || null,
      user_prompt_mask: userPromptMask || null,
      slots: [...slots].sort(), // Sort for consistent comparison
      is_tool_calling_template: isToolCallingTemplate,
      // Deep copy and normalize tool definitions for comparison
      tool_definitions: isToolCallingTemplate
        ? _.cloneDeep(toolDefinitions).map(tool => ({
            name: tool.name,
            description: tool.description,
            // Ensure parameters is always an object, even if null/undefined initially
            parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
          })).sort((a, b) => a.name.localeCompare(b.name)) // Sort for consistent comparison
        : null,
      model_override: modelOverride || null,
      // Include model parameters, ensuring types are correct and nulls are handled
      model_parameters: {
        temperature: parseNullableFloat(modelParameters.temperature) ?? defaultModelParameters.temperature, // Default if null/NaN
        top_p: parseNullableFloat(modelParameters.top_p) ?? defaultModelParameters.top_p, // Default if null/NaN
        max_tokens: parseNullableInt(modelParameters.max_tokens), // Allow null
      }
    };
  }, [name, systemPrompt, userPrompt, systemPromptMask, userPromptMask, slots, isToolCallingTemplate, toolDefinitions, modelOverride, modelParameters]); // Add systemPromptMask, userPromptMask dependency

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep dependency array empty to run only once

  // Populate form with selected template
  const populateForm = (template) => {
    if (template) {
      setName(template.name);
      setSystemPrompt(template.system_prompt);
      setUserPrompt(template.user_prompt);
      setSystemPromptMask(template.system_prompt_mask || '');
      setUserPromptMask(template.user_prompt_mask || '');
      // Set showMasks based on whether masks are defined
      setShowMasks(Boolean(template.system_prompt_mask || template.user_prompt_mask));
      setSlots(template.slots || []); // Ensure slots is always an array
      setIsToolCallingTemplate(template.is_tool_calling_template || false);
      // Deep clone tool definitions to avoid modifying original template data
      setToolDefinitions(_.cloneDeep(template.tool_definitions || []));
      setModelOverride(template.model_override || ''); // Populate model override
      // Populate model parameters, merging with defaults for missing values
      setModelParameters({
        ..._.cloneDeep(defaultModelParameters), // Start with defaults
        ...(template.model_parameters || {}) // Override with template values if they exist
      });
      setHasUnsavedChanges(false); // Reset unsaved changes when loading a template
      setNameError(false); // Reset validation
      setNewToolNameError(false);
      setNewToolDescriptionError(false);
    } else {
      // Clear form
      setName('');
      setSystemPrompt('');
      setUserPrompt('');
      setSystemPromptMask('');
      setUserPromptMask('');
      setShowMasks(false); // Reset masks visibility for new template
      setSlots([]);
      setIsToolCallingTemplate(false);
      setToolDefinitions([]);
      setModelOverride(''); // Clear model override
      setModelParameters(_.cloneDeep(defaultModelParameters)); // Reset model parameters
      setHasUnsavedChanges(false); // Reset unsaved changes when clearing form
      setNameError(false); // Reset validation
      setNewToolNameError(false);
      setNewToolDescriptionError(false);
    }
  };

  // Check for unsaved changes whenever form fields change
  useEffect(() => {
    if (isLoading) return; // Don't check while loading

    const currentData = getCurrentFormData();
    let originalData;

    if (selectedTemplate) {
      // Normalize the selected template data for comparison
      originalData = {
        name: selectedTemplate.name,
        system_prompt: selectedTemplate.system_prompt,
        user_prompt: selectedTemplate.user_prompt,
        system_prompt_mask: selectedTemplate.system_prompt_mask || null,
        user_prompt_mask: selectedTemplate.user_prompt_mask || null,
        slots: [...(selectedTemplate.slots || [])].sort(),
        is_tool_calling_template: selectedTemplate.is_tool_calling_template || false,
        tool_definitions: selectedTemplate.is_tool_calling_template
          ? _.cloneDeep(selectedTemplate.tool_definitions || []).map(tool => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
            })).sort((a, b) => a.name.localeCompare(b.name))
          : null,
        model_override: selectedTemplate.model_override || null,
        // Normalize original model parameters, merging with defaults
        model_parameters: {
          ..._.cloneDeep(defaultModelParameters),
          ...(selectedTemplate.model_parameters || {})
        }
      };
      // Ensure numeric types match for comparison after potential parsing in getCurrentFormData
      originalData.model_parameters.temperature = parseFloat(originalData.model_parameters.temperature);
      originalData.model_parameters.top_p = parseFloat(originalData.model_parameters.top_p);
      originalData.model_parameters.max_tokens = originalData.model_parameters.max_tokens === null ? null : parseInt(originalData.model_parameters.max_tokens, 10);

    } else {
      // If no template is selected, compare against empty state with default parameters
      originalData = {
        name: '', // Name is handled separately below for new templates
        system_prompt: '',
        user_prompt: '',
        system_prompt_mask: null,
        user_prompt_mask: null,
        slots: [],
        is_tool_calling_template: false,
        tool_definitions: null,
        model_override: null,
        model_parameters: _.cloneDeep(defaultModelParameters) // Compare against defaults
      };
    }

    // Use lodash's isEqual for deep comparison
    const changed = !_.isEqual(currentData, originalData);

    // Special case: if no template is selected but a name exists, it's unsaved
    if (!selectedTemplate && name.trim()) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(changed);
    }

  }, [name, systemPrompt, userPrompt, systemPromptMask, userPromptMask, slots, isToolCallingTemplate, toolDefinitions, modelOverride, modelParameters, selectedTemplate, isLoading, getCurrentFormData]); // Add systemPromptMask, userPromptMask dependency

  // Handle template selection
  const handleSelectTemplate = (template) => {
    // Check for unsaved changes before switching
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to switch templates? Your changes will be lost.')) {
        return; // Abort switching
      }
    }
    setSelectedTemplate(template);
    populateForm(template);
    setNameError(false); // Reset validation on switch
    setNewToolNameError(false);
    setNewToolDescriptionError(false);
  };

  // Handle template save
  const handleSaveTemplate = async () => {
    // Validate name
    if (!name.trim()) {
      toast.error('Template Name cannot be empty.');
      setNameError(true); // Set error state
      return;
    }
    setNameError(false); // Clear error state if valid

    // Add validation for tool definitions (ensure all parameters have names)
    if (isToolCallingTemplate) {
      for (const tool of toolDefinitions) {
        if (!tool.name || !tool.description) {
          toast.error(`A tool definition is missing a name or description. Please fix it before saving.`);
          return;
        }
        if (tool.parameters?.properties) {
          for (const paramName in tool.parameters.properties) {
            // Allow empty param names during editing, but maybe validate here if needed
          }
        }
      }
    }

    setIsSaving(true);
    setHasUnsavedChanges(false); // Assume save will succeed, reset flag optimistically

    try {
      const templateData = getCurrentFormData(); // Use the helper function

      if (selectedTemplate) {
        // Update existing template
        const updatedTemplate = await api.updateTemplate(selectedTemplate.id, templateData);

        // Update local state with the response from the server
        setTemplates(templates.map(t =>
          t.id === selectedTemplate.id ? updatedTemplate : t
        ));
        setSelectedTemplate(updatedTemplate); // Update selected template with saved data
        toast.success('Template updated successfully');
        // Repopulate form with the exact data returned from the server
        populateForm(updatedTemplate); // Use populateForm to ensure consistency
        setHasUnsavedChanges(false); // Explicitly set to false after successful save

      } else {
        // Create new template
        const newTemplate = await api.createTemplate(templateData);
        setTemplates([newTemplate, ...templates]); // Add the actual new template
        setSelectedTemplate(newTemplate); // Select the newly created template
        toast.success('Template created successfully');
        // Repopulate form with the exact data returned from the server
        populateForm(newTemplate); // Use populateForm to ensure consistency
        setHasUnsavedChanges(false); // Explicitly set to false after successful creation
      }
      // Reset validation errors on success
      setNameError(false);
      setNewToolNameError(false);
      setNewToolDescriptionError(false);

    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error(`Failed to save template: ${error.message || 'Unknown error'}`);
      setHasUnsavedChanges(true); // Re-set flag if save failed
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

  // Insert a slot into the userPromptMask (when masks are visible)
  const handleInsertSlotIntoMask = (slot) => {
    const cursorPos = document.getElementById('user-prompt-mask').selectionStart;
    const textBefore = userPromptMask.substring(0, cursorPos);
    const textAfter = userPromptMask.substring(cursorPos);
    setUserPromptMask(`${textBefore}{${slot}}${textAfter}`);
  };

  // Create a new template
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    // Check for unsaved changes before creating
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to create a new template? Your current changes will be lost.')) {
        return; // Abort creation
      }
    }

    // Clear the current selection
    setSelectedTemplate(null);

    // Set the form with the new name and default values
    setName(newTemplateName);
    setSystemPrompt('');
    setUserPrompt('');
    setSystemPromptMask('');
    setUserPromptMask('');
    setSlots([]);
    setIsToolCallingTemplate(false);
    setToolDefinitions([]);
    setModelOverride(''); // Clear model override for new template
    setModelParameters(_.cloneDeep(defaultModelParameters)); // Reset model parameters
    setHasUnsavedChanges(true); // New template starts with unsaved changes (due to name)
    setNameError(false); // Reset validation
    setNewToolNameError(false);
    setNewToolDescriptionError(false);
    // Reset the "Add New Tool" form fields
    setNewToolName('');
    setNewToolDescription('');
    setNewToolSchema({ type: 'object', properties: {}, required: [] });

    // Close the modal
    setIsModalOpen(false);
    setNewTemplateName('');
  };

  // Add tool definition
  const handleAddToolDefinition = () => {
    let isValid = true;
    // Validate tool name
    if (!newToolName.trim()) {
      toast.error('Tool Name cannot be empty.');
      setNewToolNameError(true);
      isValid = false;
    } else {
      setNewToolNameError(false);
    }

    // Validate tool description
    if (!newToolDescription.trim()) {
      toast.error('Tool Description cannot be empty.');
      setNewToolDescriptionError(true);
      isValid = false;
    } else {
      setNewToolDescriptionError(false);
    }

    if (!isValid) {
      return; // Stop if validation fails
    }

    const newTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: newToolName,
      description: newToolDescription,
      parameters: newToolSchema // Use the schema state directly
    };

    setToolDefinitions([...toolDefinitions, newTool]);
    setNewToolName('');
    setNewToolDescription('');
    setNewToolSchema({ type: 'object', properties: {}, required: [] }); // Reset schema editor state
    setNewToolNameError(false); // Clear errors on successful add
    setNewToolDescriptionError(false);
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

  // Generate a preview for mask field
  const generateMaskPreview = () => {
    let preview = userPromptMask || userPrompt; // Use mask if available, otherwise use the actual prompt

    slots.forEach(slot => {
      const placeholder = `Sample ${slot}`;
      preview = preview.replace(new RegExp(`{${slot}}`, 'g'), placeholder);
    });

    return preview;
  };

  // Handle toggle masks visibility
  const toggleMasks = () => {
    const newMasksState = !showMasks;
    setShowMasks(newMasksState);
    
    // If turning on masks and they're not set yet, initialize with actual prompts
    if (newMasksState) {
      if (!systemPromptMask) {
        setSystemPromptMask(systemPrompt);
      }
      if (!userPromptMask) {
        setUserPromptMask(userPrompt);
      }
    } else {
      // If turning off masks, clear them in the UI (changes won't persist until saved)
      setSystemPromptMask('');
      setUserPromptMask('');
    }
  };
  
  // Check if masks have been defined
  const hasMasks = Boolean(systemPromptMask || userPromptMask);

  // Handle changes in model parameter inputs
  const handleParameterChange = (param, value) => {
    setModelParameters(prev => ({ ...prev, [param]: value }));
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
      <div className="col-span-3 p-4 pt-0 rounded-lg border border-gray-200 relative overflow-y-auto h-full">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pt-4 pb-3 mb-4 -mx-4 px-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              {selectedTemplate ? 'Edit Template' : 'New Template'}
            </h2>

            <div className="space-x-2 flex items-center">
              {hasUnsavedChanges && (
                <>
                  <span className="text-sm text-yellow-600 italic mr-2">Unsaved changes</span>
                  <button
                    className={`px-3 py-1 text-white rounded-md transition-colors duration-200 ${
                      'bg-primary-600 hover:bg-primary-700 animate-pulse'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSaveTemplate}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Template'}
                  </button>
                </>
              )}
              {selectedTemplate && (
                <button
                  className="px-3 py-1 text-red-600 hover:text-red-800 border border-red-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleArchiveClick}
                  disabled={isSaving} // Disable while saving
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Template Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(false); // Clear error on change
              }}
              className={`w-full p-2 border rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
                nameError ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Enter template name"
              disabled={isLoading || isSaving}
              required
              aria-invalid={nameError}
              aria-describedby={nameError ? 'template-name-error' : undefined}
            />
            {nameError && (
              <p id="template-name-error" className="text-xs text-red-500 mt-1 font-medium">
                Template name is required.
              </p>
            )}
          </div>

          {/* Model Override Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Override (Optional)
            </label>
            <ModelSelector
              selectedModel={modelOverride}
              onModelChange={setModelOverride}
              allowNone={true}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-gray-500 mt-1">If set, this model will be used instead of your default generation model.</p>
          </div>

          {/* Model Parameters Section */}
          <div className="p-4 border border-gray-200 rounded-md space-y-3">
            <h3 className="text-md font-semibold text-gray-800 mb-2">Model Parameters</h3>
            <p className="text-xs text-gray-500 -mt-2 mb-3">Fine-tune model behavior. These override dataset defaults if set.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Temperature */}
              <div>
                <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  id="temperature"
                  value={modelParameters.temperature ?? ''} // Use empty string if null/undefined for input control
                  onChange={(e) => handleParameterChange('temperature', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                  placeholder="e.g., 0.7"
                  min="0"
                  max="2"
                  step="0.1"
                  disabled={isLoading || isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">Controls randomness (0=deterministic, 2=max random). Default: 1.0</p>
              </div>

              {/* Top P */}
              <div>
                <label htmlFor="top_p" className="block text-sm font-medium text-gray-700 mb-1">
                  Top P
                </label>
                <input
                  type="number"
                  id="top_p"
                  value={modelParameters.top_p ?? ''} // Use empty string if null/undefined
                  onChange={(e) => handleParameterChange('top_p', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                  placeholder="e.g., 0.9"
                  min="0"
                  max="1"
                  step="0.05"
                  disabled={isLoading || isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">Nucleus sampling threshold. Default: 1.0</p>
              </div>

              {/* Max Tokens */}
              <div>
                <label htmlFor="max_tokens" className="block text-sm font-medium text-gray-700 mb-1">
                  Max Tokens (Optional)
                </label>
                <input
                  type="number"
                  id="max_tokens"
                  value={modelParameters.max_tokens ?? ''} // Use empty string if null
                  onChange={(e) => handleParameterChange('max_tokens', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                  placeholder="e.g., 1024"
                  min="1"
                  step="1"
                  disabled={isLoading || isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">Max generation length. Leave blank for model default.</p>
              </div>
            </div>
          </div>

          {/* Prompt Masking Toggle */}
          <div className="flex items-center justify-between mt-4 mb-2">
            <div>
              <span className="text-sm font-medium text-gray-700">Prompt Masking</span>
              <p className="text-xs text-gray-500">Enable mask fields to create alternate prompts for exports</p>
            </div>
            <div className="flex flex-col items-end">
              <button 
                className={`flex items-center px-3 py-1 rounded-md transition-colors duration-200 ${
                  showMasks ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                } ${!hasMasks && !showMasks ? 'opacity-75' : 'opacity-100'}`}
                onClick={toggleMasks}
                title={showMasks ? "Turn off masking (will clear masks when saved)" : "Turn on masking"}
                disabled={isLoading || isSaving}
              >
                <Icon name={showMasks ? "check" : "sparkles"} className="h-4 w-4 mr-1" />
                {showMasks ? "Masking On" : (hasMasks ? "Masking Off" : "No Masks")}
              </button>
              {showMasks !== Boolean(hasMasks) && (
                <span className="text-xs text-amber-600 mt-1">Save template to {showMasks ? "keep" : "clear"} masks</span>
              )}
            </div>
          </div>

          {/* System Prompt Section with conditional mask field */}
          <div className="space-y-2">
            <SystemPromptEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              templateId={selectedTemplate?.id}
              disabled={isLoading || isSaving}
              label={showMasks ? "System Prompt (Actual)" : "System Prompt"}
            />

            {showMasks && (
              <div className="mt-3">
                <div className="flex items-center">
                  <label className="block text-sm font-medium text-indigo-600 mb-1">
                    System Prompt Mask <span className="text-xs font-normal text-gray-500">(for exports)</span>
                  </label>
                  <button 
                    className="ml-2 text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                    onClick={() => setSystemPromptMask(systemPrompt)}
                    disabled={isLoading || isSaving}
                  >
                    Copy from actual
                  </button>
                </div>
                <textarea
                  value={systemPromptMask}
                  onChange={(e) => setSystemPromptMask(e.target.value)}
                  className="w-full p-2 border border-indigo-300 rounded-md h-32 disabled:bg-gray-100 bg-indigo-50"
                  placeholder="Enter masked system prompt for exports (leave empty to use actual prompt)"
                  disabled={isLoading || isSaving}
                />
                <p className="text-xs text-indigo-500 italic">This is what will appear in exported data instead of the actual system prompt.</p>
              </div>
            )}
          </div>

          {/* User Prompt Section with conditional mask field */}
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {showMasks ? "User Prompt Template (Actual)" : "User Prompt Template"}
              </label>
              <textarea
                id="user-prompt"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md h-32 disabled:bg-gray-100"
                placeholder="Enter user prompt with {slot} placeholders"
                disabled={isLoading || isSaving}
              />
            </div>

            {showMasks && (
              <div className="mt-3">
                <div className="flex items-center">
                  <label className="block text-sm font-medium text-indigo-600 mb-1">
                    User Prompt Mask <span className="text-xs font-normal text-gray-500">(for exports)</span>
                  </label>
                  <button 
                    className="ml-2 text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                    onClick={() => setUserPromptMask(userPrompt)}
                    disabled={isLoading || isSaving}
                  >
                    Copy from actual
                  </button>
                </div>
                <textarea
                  id="user-prompt-mask"
                  value={userPromptMask}
                  onChange={(e) => setUserPromptMask(e.target.value)}
                  className="w-full p-2 border border-indigo-300 rounded-md h-32 disabled:bg-gray-100 bg-indigo-50"
                  placeholder="Enter masked user prompt for exports (leave empty to use actual prompt)"
                  disabled={isLoading || isSaving}
                />
                <p className="text-xs text-indigo-500 italic">This is what will appear in exported data instead of the actual user prompt.</p>
              </div>
            )}
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
                className="flex-grow p-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                placeholder="New slot name"
                disabled={isLoading || isSaving}
              />
              <button
                className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                onClick={handleAddSlot}
                disabled={isLoading || isSaving}
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
                    className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    onClick={() => handleRemoveSlot(slot)}
                    title="Remove slot"
                    disabled={isLoading || isSaving}
                  >
                    ✕
                  </button>
                  <button
                    className="ml-1 text-primary-600 hover:text-primary-800 disabled:opacity-50"
                    onClick={() => handleInsertSlot(slot)}
                    title="Insert slot in template"
                    disabled={isLoading || isSaving}
                  >
                    ↩
                  </button>
                  {showMasks && (
                    <button
                      className="ml-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      onClick={() => handleInsertSlotIntoMask(slot)}
                      title="Insert slot in mask template"
                      disabled={isLoading || isSaving}
                    >
                      ↩ to mask
                    </button>
                  )}
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
                checked={isToolCallingTemplate}
                onChange={setIsToolCallingTemplate}
                disabled={isLoading || isSaving}
              />
            </div>

            {/* Collapsible Tool Definitions Section */}
            <div
              className={`overflow-hidden transition-all duration-500 ease-in-out ${
                isToolCallingTemplate ? 'max-h-[1000px] opacity-100 pt-4' : 'max-h-0 opacity-0 pt-0' // Adjust max-h as needed
              }`}
              style={{ borderTop: isToolCallingTemplate ? '1px solid #e5e7eb' : 'none' }} // Conditional top border
            >
              <div className={`space-y-4 ${isLoading || isSaving ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <h3 className="text-md font-semibold text-gray-700">Tool Definitions</h3>

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
                            {JSON.stringify(tool.parameters || {}, null, 2)}
                          </pre>
                        </details>
                      </div>
                      <button
                        onClick={() => handleRemoveToolDefinition(index)}
                        className="text-red-500 hover:text-red-700 text-xl font-light p-1 disabled:opacity-50"
                        title="Remove tool"
                        disabled={!isToolCallingTemplate || isLoading || isSaving}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add New Tool Section - Wrapped in a bordered container */}
                <div className="pt-4 border-t border-gray-200"> {/* Existing top border */}
                  <div className="p-4 border border-gray-200 rounded-md bg-white shadow-sm"> {/* New container */}
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Add New Tool</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tool Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g., getWeather"
                          value={newToolName}
                          onChange={(e) => {
                            setNewToolName(e.target.value);
                            if (e.target.value.trim()) setNewToolNameError(false); // Clear error on change
                          }}
                          className={`w-full p-2 border rounded-md text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
                            newToolNameError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                          }`}
                          disabled={!isToolCallingTemplate || isLoading || isSaving}
                          required
                          aria-invalid={newToolNameError}
                          aria-describedby={newToolNameError ? 'new-tool-name-error' : undefined}
                        />
                        {newToolNameError && (
                          <p id="new-tool-name-error" className="text-xs text-red-500 mt-1 font-medium">
                            Tool name is required.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tool Description <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g., Gets the current weather for a location"
                          value={newToolDescription}
                          onChange={(e) => {
                            setNewToolDescription(e.target.value);
                            if (e.target.value.trim()) setNewToolDescriptionError(false); // Clear error on change
                          }}
                          className={`w-full p-2 border rounded-md text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
                            newToolDescriptionError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                          }`}
                          disabled={!isToolCallingTemplate || isLoading || isSaving}
                          required
                          aria-invalid={newToolDescriptionError}
                          aria-describedby={newToolDescriptionError ? 'new-tool-desc-error' : undefined}
                        />
                        {newToolDescriptionError && (
                          <p id="new-tool-desc-error" className="text-xs text-red-500 mt-1 font-medium">
                            Tool description is required.
                          </p>
                        )}
                      </div>
                      <ToolParameterSchemaEditor
                        value={newToolSchema}
                        onChange={setNewToolSchema}
                        disabled={!isToolCallingTemplate || isLoading || isSaving}
                      />
                    </div>
                    {/* Horizontal border to separate from the button */}
                    <div className="border-t border-gray-200 mt-4 pt-3"></div>
                    <button
                      onClick={handleAddToolDefinition}
                      className="px-4 mt-1 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm disabled:opacity-50"
                      disabled={!isToolCallingTemplate || isLoading || isSaving}
                    >
                      Save Tool Definition
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Section with Tabs for Actual vs Mask */}
          <div>
            <div className="flex items-center border-b border-gray-200 mb-2">
              <div 
                className={`px-4 py-2 font-medium text-sm border-b-2 cursor-pointer ${!showMasks ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShowMasks(false)}
              >
                Actual Preview
              </div>
              {hasMasks && (
                <div 
                  className={`px-4 py-2 font-medium text-sm border-b-2 cursor-pointer ${showMasks ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setShowMasks(true)}
                >
                  Masked Preview
                </div>
              )}
            </div>
            
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md min-h-[100px]">
              <h4 className="text-xs font-semibold mb-1">{!showMasks ? 'Actual User Prompt Preview' : 'Masked User Prompt Preview'}</h4>
              <div className="text-sm">
                {!showMasks ? generatePreview() : generateMaskPreview()}
              </div>
              {showMasks && hasMasks && (
                <p className="text-xs text-indigo-500 italic mt-2">This is how the prompts will appear in exported data.</p>
              )}
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