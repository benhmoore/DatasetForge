import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ExampleDetailModal from './ExampleDetailModal';
import ParaphraseModal from './ParaphraseModal';
import Icon from './Icons';

/**
 * This component wraps ExampleDetailModal with paraphrase functionality
 * It's separated to avoid hooks ordering issues
 */
const ExampleDetailModalWithParaphrase = (props) => {
  // Basic state needed for paraphrase functionality
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  
  // Handlers
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);
  
  const handleOpenParaphraseModal = useCallback(() => {
    if (!props.example || !props.example.output) {
      toast.error('Cannot paraphrase: No output content available');
      return;
    }
    setIsParaphraseModalOpen(true);
  }, [props.example]);
  
  const handleAddVariations = useCallback(async (_, paraphrasedOutputs) => {
    if (!props.example || !props.datasetId || paraphrasedOutputs.length === 0) {
      return;
    }
    
    try {
      // Create new examples with the paraphrased outputs
      const newExamples = paraphrasedOutputs.map(output => ({
        ...props.example,
        id: undefined, // Remove ID so a new one is generated
        output // Use the paraphrased text as output
      }));
      
      // Save the new examples to the dataset
      await api.saveExamples(props.datasetId, newExamples);
      
      // Show success message
      toast.success(`Added ${paraphrasedOutputs.length} paraphrased variation${paraphrasedOutputs.length !== 1 ? 's' : ''}`);
      
      // Trigger refresh in parent component
      if (props.onExampleUpdated) {
        props.onExampleUpdated(props.example);
      }
    } catch (error) {
      console.error('Failed to save paraphrased examples:', error);
      toast.error('Failed to save paraphrased examples');
    }
  }, [props.example, props.datasetId, props.onExampleUpdated]);
  
  // Custom render function for paraphrase button
  const renderExtraButtons = useCallback(() => {
    // Only show paraphrase button in content tab and if there's an output to paraphrase
    if (activeTab !== 'content' || !props.example?.output) return null;
    
    return (
      <button
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
        onClick={handleOpenParaphraseModal}
      >
        <Icon name="language" className="h-5 w-5 mr-2" />
        Paraphrase
      </button>
    );
  }, [activeTab, props.example, handleOpenParaphraseModal]);
  
  // Create props for ExampleDetailModal
  const detailModalProps = {
    ...props,
    renderExtraButtons,
    onTabChange: handleTabChange
  };
  
  if (!props.isOpen) return null;
  
  return (
    <>
      <ExampleDetailModal {...detailModalProps} />
      
      {props.example && (
        <ParaphraseModal
          isOpen={isParaphraseModalOpen}
          onClose={(e) => {
            // Stop event propagation to prevent closing the parent modal
            if (e) e.stopPropagation();
            setIsParaphraseModalOpen(false);
          }}
          sourceText={props.example.output || ''}
          variationId={props.example.id}
          onAddVariations={handleAddVariations}
        />
      )}
    </>
  );
};

export default ExampleDetailModalWithParaphrase;