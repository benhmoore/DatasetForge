import React from 'react';
import VariationCard from '../../VariationCard';

const VariationList = ({ 
  variations, 
  selectedVariations, 
  isParaphrasing,
  onSelect, 
  onEdit, 
  onRegenerate, 
  onDismiss, 
  onToolCallsChange, 
  onOpenParaphraseModal 
}) => {
  if (variations.length === 0) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
        <p className="text-gray-500">
          Fill in the form and click "Generate" to create variations.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {variations.map((variation) => (
        <VariationCard
          key={variation.id}
          id={variation.id}
          variation={variation.variation}
          output={variation.output}
          tool_calls={variation.tool_calls}
          processed_prompt={variation.processed_prompt}
          isSelected={selectedVariations.has(variation.id)}
          isGenerating={variation.isGenerating || false}
          isParaphrasing={isParaphrasing}
          error={variation.error || null}
          workflow_results={variation.workflow_results}
          workflow_progress={variation.workflow_progress}
          onSelect={() => onSelect(variation.id)}
          onEdit={(output) => onEdit(variation.id, output)}
          onRegenerate={(instruction) => onRegenerate(variation.id, instruction)}
          onDismiss={() => onDismiss(variation.id)}
          onToolCallsChange={(newToolCalls) => onToolCallsChange(variation.id, newToolCalls)}
          onOpenParaphraseModal={(id, text) => onOpenParaphraseModal(id, text)}
        />
      ))}
    </div>
  );
};

export default VariationList;