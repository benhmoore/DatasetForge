import { useRef, useEffect, useState } from 'react'; // Import useState
import PropTypes from 'prop-types';
import Icon from './Icons'; // Assuming './Icons' component exists and works

/**
 * A generic context menu component that appears at a specified position
 * and allows selecting from a list of options, supporting dividers.
 * Ensures the menu stays within the viewport boundaries.
 */
const ContextMenu = ({
  title = null,
  items = [],
  position,
  onSelect,
  onClose
}) => {
  const menuRef = useRef(null);
  // State to hold the adjusted position
  const [adjustedPosition, setAdjustedPosition] = useState({ x: 0, y: 0 });

  // Adjust position based on menu dimensions and viewport
  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const { innerWidth, innerHeight } = window;

      let newX = position.x;
      let newY = position.y;

      // Adjust horizontally if menu goes off-screen right
      if (position.x + menuRect.width > innerWidth) {
        newX = innerWidth - menuRect.width - 5; // Subtract 5 for padding
      }
      // Adjust horizontally if menu goes off-screen left (less common)
      if (newX < 0) {
        newX = 5; // Add 5 for padding
      }

      // Adjust vertically if menu goes off-screen bottom
      if (position.y + menuRect.height > innerHeight) {
        newY = innerHeight - menuRect.height - 5; // Subtract 5 for padding
      }
      // Adjust vertically if menu goes off-screen top (less common)
      if (newY < 0) {
        newY = 5; // Add 5 for padding
      }

      setAdjustedPosition({ x: newX, y: newY });
    }
    // Run only when position changes
  }, [position]);

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

  // Render null until position is calculated to avoid flicker
  if (!adjustedPosition.x && !adjustedPosition.y && menuRef.current) {
    // If position is {0,0} but we have a ref, it means calculation is pending
    // or initial position was truly {0,0}. We check position prop directly
    // to distinguish initial render vs calculated {0,0}.
    if (position.x !== 0 || position.y !== 0) {
      return null;
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700" // Added dark mode basic styles
      style={{
        // Use adjusted position
        top: adjustedPosition.y,
        left: adjustedPosition.x,
        minWidth: '180px',
        // Initially hide until position is calculated to prevent flicker
        visibility: adjustedPosition.x || adjustedPosition.y ? 'visible' : 'hidden',
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
              {item.icon && <Icon name={item.icon} className={iconClasses} />}
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
    y: PropTypes.number.isRequired,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ContextMenu;