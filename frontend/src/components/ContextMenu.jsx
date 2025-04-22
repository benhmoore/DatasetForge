import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icons';

/**
 * A generic context menu component that appears at a specified position
 * and allows selecting from a list of options.
 */
const ContextMenu = ({ 
  title, // Added title prop
  items, 
  position, 
  onSelect, 
  onClose 
}) => {
  const menuRef = useRef(null);
  
  // Handle clicks outside the menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
      className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200"
      style={{
        top: position.y,
        left: position.x,
        minWidth: '180px'
      }}
    >
      <div className="py-1">
        {title && (
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
            {title}
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.value}
            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center space-x-2"
            onClick={() => {
              onSelect(item.value);
              onClose();
            }}
          >
            {item.icon && (
              <Icon name={item.icon} className="w-4 h-4 text-gray-500" />
            )}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

ContextMenu.propTypes = {
  title: PropTypes.string, // Added title prop type
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired,
      icon: PropTypes.string
    })
  ).isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

export default ContextMenu;