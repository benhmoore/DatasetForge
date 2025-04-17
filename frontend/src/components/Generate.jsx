import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useOutletContext, Navigate } from 'react-router-dom';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';

const Generate = () => {
  const { selectedDataset } = useOutletContext();
  
  // Redirect if no dataset is selected
  if (!selectedDataset) {
    toast.warning('Please select a dataset first');
    return <Navigate to="/" />;
  }
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [starredVariations, setStarredVariations] = useState(new Set());
  
  // Fetch templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      
      try {
        const data = await api.getTemplates();
        setTemplates(data);
        
        // Check for previously selected template in session storage
        const savedTemplateId = sessionStorage.getItem(`selectedTemplate_${selectedDataset.id}`);
        let templateToSelect = null;
        
        if (savedTemplateId) {
          // Find the saved template by ID
          const savedTemplate = data.find(t => t.id === parseInt(savedTemplateId));
          if (savedTemplate && !savedTemplate.archived) {
            console.log('Restoring saved template from session storage:', savedTemplate);
            templateToSelect = savedTemplate;
          }
        }
        
        // If no saved template or it wasn't found, use the first available
        if (!templateToSelect) {
          // Select the first non-archived template if available
          const activeTemplates = data.filter(t => !t.archived);
          if (activeTemplates.length > 0) {
            console.log('Setting initial template:', activeTemplates[0]);
            templateToSelect = activeTemplates[0];
          } else if (data.length > 0) {
            console.log('No active templates, setting first available:', data[0]);
            templateToSelect = data[0];
          } else {
            console.warn('No templates available');
          }
        }
        
        if (templateToSelect) {
          setSelectedTemplate(templateToSelect);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        toast.error('Failed to load templates');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTemplates();
  }, [selectedDataset.id]);
  
  // Handle template selection
  const handleTemplateChange = (e) => {
    try {
      const templateId = parseInt(e.target.value);
      if (isNaN(templateId)) {
        console.warn('Invalid template ID:', e.target.value);
        setSelectedTemplate(null);
        return;
      }
      
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        console.warn('Template not found for ID:', templateId);
        toast.error('Selected template was not found. Please try another template.');
        return;
      }
      
      console.log('Selected template:', template);
      setSelectedTemplate(template);
      
      // Save to session storage
      sessionStorage.setItem(`selectedTemplate_${selectedDataset.id}`, template.id);
      
      // Clear variations when changing template
      setVariations([]);
      setStarredVariations(new Set());
    } catch (error) {
      console.error('Error selecting template:', error);
      toast.error('Error selecting template. Please try again.');
    }
  };
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);
  
  // Handle generate button click
  const handleGenerate = async (data) => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }
    
    if (!data.template_id) {
      console.error('Missing template_id in generate request:', data);
      toast.error('Missing template ID. Please refresh and try again.');
      return;
    }
    
    // Log the request for debugging
    console.log('Generation request data:', data);
    
    setIsGenerating(true);
    
    try {
      const results = await api.generate(data);
      setVariations(results);
    } catch (error) {
      console.error('Generation failed:', error);
      
      if (error.response && error.response.status === 504) {
        toast.error('Generation timed out. Please try again or use a different model.');
      } else if (error.response && error.response.status === 422) {
        // Check if it's the specific error about missing model
        const errorMessage = error.response.data?.detail || 'Failed to process request';
        
        if (errorMessage.includes('Default generation model is not set')) {
          toast.error('Default generation model is not set. Please configure it in Settings.');
          // Open settings modal automatically
          setSettingsOpen(true);
        } else {
          toast.error(errorMessage);
        }
      } else {
        toast.error('Failed to generate variations');
      }
      
      // Keep old variations if generation fails
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Handle star button click
  const handleStar = (index, output) => {
    const newStarred = new Set(starredVariations);
    
    if (newStarred.has(index)) {
      newStarred.delete(index);
    } else {
      newStarred.add(index);
    }
    
    // Update the variation output if it was edited
    if (output !== variations[index].output) {
      const updatedVariations = [...variations];
      updatedVariations[index] = { ...updatedVariations[index], output };
      setVariations(updatedVariations);
    }
    
    setStarredVariations(newStarred);
  };
  
  // Handle edit button save
  const handleEdit = (index, newOutput) => {
    const updatedVariations = [...variations];
    updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
    setVariations(updatedVariations);
  };
  
  // Handle regenerate button click
  const handleRegenerate = async (index, instruction = '') => {
    if (!selectedTemplate || isGenerating) return;
    
    // Create a temporary loading state for this card
    const updatedVariations = [...variations];
    updatedVariations[index] = { 
      ...updatedVariations[index], 
      isGenerating: true,
      error: null
    };
    setVariations(updatedVariations);
    
    try {
      // Get the last generation parameters
      // Make sure we have the slots data
      const slotData = variations[index].slots || {};
      
      // Debug log to see what's happening
      console.log('Existing variation slots:', slotData);
      console.log('Regeneration instruction:', instruction);
      
      if (Object.keys(slotData).length === 0) {
        toast.error('Cannot regenerate: missing slot data');
        
        // Update variation to show error
        const errorVariations = [...variations];
        errorVariations[index] = {
          ...errorVariations[index],
          isGenerating: false,
          error: 'Missing slot data'
        };
        setVariations(errorVariations);
        return;
      }
      
      // IMPORTANT: Use template_id (with underscore) to match backend API schema
      const lastGenParams = {
        template_id: selectedTemplate.id,
        slots: slotData,
        count: 1
      };
      
      // Add instruction if provided
      if (instruction && instruction.trim() !== '') {
        lastGenParams.instruction = instruction.trim();
        console.log('Adding instruction to request:', lastGenParams.instruction);
      }
      
      console.log('Final request payload:', lastGenParams);
      const results = await api.generate(lastGenParams);
      
      // Update just this variation
      if (results && results.length > 0) {
        const newVariations = [...variations];
        newVariations[index] = {
          ...results[0],
          isGenerating: false,
          error: null
        };
        setVariations(newVariations);
        
        // If it was starred, remove the star
        if (starredVariations.has(index)) {
          const newStarred = new Set(starredVariations);
          newStarred.delete(index);
          setStarredVariations(newStarred);
        }
      }
    } catch (error) {
      console.error('Regeneration failed:', error);
      
      // Update with error
      const errorMsg = error.response && error.response.status === 504
        ? 'Generation timed out. Please try again.'
        : 'Failed to regenerate. Please try again.';
      
      const newVariations = [...variations];
      newVariations[index] = {
        ...newVariations[index],
        isGenerating: false,
        error: errorMsg
      };
      setVariations(newVariations);
      
    }
  };
  
  // Handle save to dataset
  const handleSaveToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }
    
    if (starredVariations.size === 0) {
      toast.warning('Please star at least one variation to save');
      return;
    }
    
    // Prepare examples to save
    const examples = Array.from(starredVariations).map(index => {
      const variation = variations[index];
      
      // Make sure slots exist and are properly formatted
      let slotData = variation.slots || {};
      
      // Log for debugging
      console.log('Saving variation with slots:', slotData);
      
      // If slots is missing or empty, use an empty object
      if (!slotData || Object.keys(slotData).length === 0) {
        console.warn('Missing slots for variation', index);
        // Create a default slot value to prevent API errors
        slotData = { "_default": "No slot data available" };
      }
      
      return {
        system_prompt: selectedTemplate.system_prompt,
        slots: slotData,
        output: variation.output
      };
    });
    
    try {
      await api.saveExamples(selectedDataset.id, examples);
      toast.success(`Saved ${examples.length} examples to dataset`);
      
      // Clear starred variations and continue with remaining ones
      const remainingVariations = variations.filter((_, index) => !starredVariations.has(index));
      setVariations(remainingVariations);
      setStarredVariations(new Set());
      
      // Trigger examples table refresh
      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error('Failed to save examples to dataset');
    }
  };
  
  return (
    <div className="space-y-8">
      {/* Generate Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - SeedForm */}
        <div className="md:col-span-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Template
            </label>
            <select
              value={selectedTemplate?.id || ''}
              onChange={handleTemplateChange}
              className="w-full p-2 border border-gray-300 rounded-md"
              disabled={isLoading || isGenerating}
            >
              {isLoading ? (
                <option value="">Loading templates...</option>
              ) : templates.length === 0 ? (
                <option value="">No templates available</option>
              ) : (
                templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))
              )}
            </select>
          </div>
          
          <SeedForm
            template={selectedTemplate}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
          
          {/* Save to Dataset Button */}
          {variations.length > 0 && starredVariations.size > 0 && (
            <div className="mt-4">
              <button
                onClick={handleSaveToDataset}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
                disabled={isGenerating}
              >
                Save {starredVariations.size} to Dataset
              </button>
            </div>
          )}
        </div>
        
        {/* Right Column - Variation Cards */}
        <div className="md:col-span-2">
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>
          
          {variations.length === 0 ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                Fill in the form and click "Generate" to create variations.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {variations.map((variation, index) => (
                <VariationCard
                  key={index}
                  variation={variation.variation}
                  output={variation.output}
                  isStarred={starredVariations.has(index)}
                  isGenerating={variation.isGenerating || false}
                  error={variation.error || null}
                  onStar={(output) => handleStar(index, output)}
                  onEdit={(output) => handleEdit(index, output)}
                  onRegenerate={(instruction) => handleRegenerate(index, instruction)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Dataset Examples Section */}
      {selectedDataset && (
        <div className="border-t pt-6">
          <ExampleTable 
            datasetId={selectedDataset.id} 
            refreshTrigger={refreshExamplesTrigger} 
          />
        </div>
      )}
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default Generate;