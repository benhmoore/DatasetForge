import { useState, useCallback, useRef, useEffect } from 'react';
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
  const { isOpen, example, datasetId, onClose, onExampleUpdated } = props;
  
  // Basic state needed for paraphrase functionality
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  
  // Ref to track modal state
  const modalRef = useRef({ isParaphraseOpen: false });
  
  // Update ref when modal state changes
  useEffect(() => {
    modalRef.current.isParaphraseOpen = isParaphraseModalOpen;
  }, [isParaphraseModalOpen]);
  
  // Handlers
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);
  
  // Safely close parent modal only when paraphrase modal is not open
  const handleParentClose = useCallback(() => {
    if (!modalRef.current.isParaphraseOpen) {
      onClose();
    }
  }, [onClose]);
  
  const handleOpenParaphraseModal = useCallback(() => {
    if (!example || !example.output) {
      toast.error('Cannot paraphrase: No output content available');
      return;
    }
    setIsParaphraseModalOpen(true);
  }, [example]);
  
  const handleAddVariations = useCallback(async (_, paraphrasedOutputs) => {
    if (!example || !datasetId || paraphrasedOutputs.length === 0) {
      return;
    }
    
    try {
      // Create new examples with the paraphrased outputs
      const newExamples = paraphrasedOutputs.map(output => ({
        ...example,
        id: undefined, // Remove ID so a new one is generated
        output // Use the paraphrased text as output
      }));
      
      // Save the new examples to the dataset
      await api.saveExamples(datasetId, newExamples);
      
      // Show success message
      toast.success(`Added ${paraphrasedOutputs.length} paraphrased variation${paraphrasedOutputs.length !== 1 ? 's' : ''}`);
      
      // Trigger refresh in parent component
      if (onExampleUpdated) {
        onExampleUpdated(example);
      }
    } catch (error) {
      console.error('Failed to save paraphrased examples:', error);
      toast.error('Failed to save paraphrased examples');
    }
  }, [example, datasetId, onExampleUpdated]);
  
  // Custom render function for paraphrase button
  const renderExtraButtons = useCallback(() => {
    // Only show paraphrase button in content tab and if there's an output to paraphrase
    if (activeTab !== 'content' || !example?.output) return null;
    
    return (
      <button
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpenParaphraseModal();
        }}
      >
        <Icon name="language" className="h-5 w-5 mr-2" />
        Paraphrase
      </button>
    );
  }, [activeTab, example, handleOpenParaphraseModal]);
  
  // Create props for ExampleDetailModal
  const detailModalProps = {
    ...props,
    renderExtraButtons,
    onTabChange: handleTabChange,
    onClose: handleParentClose
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      <ExampleDetailModal {...detailModalProps} />
      
      {/* The paraphrase modal needs to render outside any nested context for proper z-index handling */}
      {example && (
        <ParaphraseModal
          isOpen={isParaphraseModalOpen}
          onClose={() => {
            setIsParaphraseModalOpen(false);
          }}
          sourceText={example.output || ''}
          variationId={example.id}
          onAddVariations={handleAddVariations}
        />
      )}
    </>
  );
};

export default ExampleDetailModalWithParaphrase;