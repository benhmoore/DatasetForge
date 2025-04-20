import { useEffect } from 'react';
import Icon from './Icons';

const SlotEditModal = ({ isOpen, onClose, slotName, value, onChange, isDisabled }) => {
  const handleCancel = () => {
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleCancel();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (!isDisabled) {
          onClose();
        }
      }
    };

    if (isOpen) {
      const textarea = document.getElementById(`slot-edit-textarea-${slotName}`);
      textarea?.focus();

      window.addEventListener('keydown', handleKeyDown);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleCancel, isDisabled, slotName, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
      onClick={handleCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[90%] max-w-2xl max-h-[85vh] p-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">
            Edit Slot: <span className="font-bold">{slotName}</span>
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
            aria-label="Close modal"
          >
            <Icon name="xMark" className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-grow mb-5 overflow-y-auto">
          <textarea
            id={`slot-edit-textarea-${slotName}`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full h-full min-h-[200px] p-3 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200 resize-none ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
            placeholder={`Enter content for ${slotName}...`}
            disabled={isDisabled}
            aria-label={`Content for slot ${slotName}`}
          />
          <div className="text-right text-xs text-gray-500 mt-1 pr-1">
            {value?.length?.toLocaleString() || 0} characters
          </div>
        </div>

        <div className="flex justify-end space-x-3 flex-shrink-0 pt-2 border-t border-gray-200">
          <button
            type="button"
            onClick={handleCancel}
            className="py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isDisabled}
            className="py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed transition-colors duration-200"
            title={!isDisabled ? "Close Editor (Changes saved automatically)" : ""}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SlotEditModal;
