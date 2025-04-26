import React, { useEffect } from 'react'; // Import useEffect

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children, // Add support for children
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  confirmButtonVariant = 'primary', // 'primary' or 'danger'
  size = 'md', // Add size prop with default 'md'
}) => {
  // Handle Enter key press to confirm
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && isOpen) {
        // Prevent default form submission or other Enter key actions
        event.preventDefault();
        // Trigger the confirm action
        onConfirm();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onConfirm]); // Re-run effect if isOpen or onConfirm changes

  if (!isOpen) return null;
  
  const confirmButtonClasses = `px-4 py-2 rounded-md text-white ${
    confirmButtonVariant === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-primary-600 hover:bg-primary-700'
  }`;
  
  // Define size classes based on the size prop
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[size] || 'max-w-md';
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-white p-6 rounded-lg shadow-xl ${sizeClasses} w-full`}>
        <h3 className="text-lg font-medium mb-4">{title}</h3>
        {message && <div className="mb-6 text-gray-700">{message}</div>}
        {children} {/* Render children if provided */}
        <div className="flex justify-between items-center mt-4"> {/* Updated layout */}
          <div className="text-sm text-gray-500">Press Enter to confirm.</div> {/* Added notice */}
          <div className="flex space-x-2">
            <button
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              onClick={onClose}
            >
              {cancelButtonText}
            </button>
            <button
              className={confirmButtonClasses}
              onClick={onConfirm}
            >
              {confirmButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;