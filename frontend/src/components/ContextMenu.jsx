import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icons'; // Assuming './Icons' component exists and works

/**
 * A generic context menu component that appears at a specified position
 * and allows selecting from a list of options, supporting dividers.
 */
const ContextMenu = ({
  title = null,
  items = [],
  position,
  onSelect,
  onClose
}) => {
  const menuRef = useRef(null);

  // Handle clicks outside the menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if the click target exists and is outside the menu
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true); // Use capture phase
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);

  // Close menu when ESC key is pressed
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700" // Added dark mode basic styles
      style={{
        top: position.y,
        left: position.x,
        minWidth: '180px'
      }}
      // Prevent context menu on the context menu itself
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="py-1">
        {/* Optional Title */}
        {title && (
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 dark:text-gray-400 dark:border-gray-700">
            {title}
          </div>
        )}

        {/* Menu Items and Dividers */}
        {items.map((item, index) => {
          // Check if the item is a divider
          if (item.type === 'divider') {
            return (
              <div
                key={`divider-${index}`} // Use index for divider key
                className="border-t border-gray-200 dark:border-gray-600 my-1 mx-1" // Divider element with styling
              />
            );
          }

          // Otherwise, render a regular menu item (button)
          // Add disabled state handling
          const isDisabled = item.disabled === true;
          const itemClasses = `w-full text-left px-3 py-2 text-sm flex items-center space-x-2 ${
            isDisabled
              ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'text-gray-700 dark:text-gray-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-gray-700 dark:hover:text-blue-300'
          }`;
          const iconClasses = `w-4 h-4 ${
            isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
          }`;


          return (
            <button
              key={item.value || `item-${index}`} // Use value or index as key
              className={itemClasses}
              onClick={() => {
                if (!isDisabled) {
                    onSelect(item.value);
                    onClose();
                }
              }}
              disabled={isDisabled} // Set disabled attribute
            >
              {item.icon && (
                <Icon name={item.icon} className={iconClasses} />
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Define the PropTypes for items and dividers
const itemShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  value: PropTypes.any.isRequired, // Allow any type for value
  icon: PropTypes.string,
  disabled: PropTypes.bool, // Optional disabled state
  type: PropTypes.oneOf(['item', undefined]), // Allow 'item' or undefined for standard items
});

const dividerShape = PropTypes.shape({
  type: PropTypes.oneOf(['divider']).isRequired,
});

ContextMenu.propTypes = {
  title: PropTypes.string,
  items: PropTypes.arrayOf(
    PropTypes.oneOfType([itemShape, dividerShape]) // Items can be regular items or dividers
  ).isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

export default ContextMenu;