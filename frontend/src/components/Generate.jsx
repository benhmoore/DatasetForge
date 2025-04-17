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
        
        // Select the first template if available
        if (data.length > 0) {
          setSelectedTemplate(data[0]);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        toast.error('Failed to load templates');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // Handle template selection
  const handleTemplateChange = (e) => {
    const templateId = parseInt(e.target.value);
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
    
    // Clear variations when changing template
    setVariations([]);
    setStarredVariations(new Set());
  };
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Handle generate button click
  const handleGenerate = async (data) => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }
    
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
  const handleRegenerate = async (index) => {
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
      const lastGenParams = {
        templateId: selectedTemplate.id,
        slots: variations[0].slots, // Assume all variations have the same slots
        count: 1
      };
      
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
      return {
        system_prompt: selectedTemplate.system_prompt,
        variation_prompt: variation.variation,
        slots: variation.slots,
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
                  onRegenerate={() => handleRegenerate(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Dataset Examples Section */}
      {selectedDataset && (
        <div className="border-t pt-6">
          <ExampleTable datasetId={selectedDataset.id} />
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