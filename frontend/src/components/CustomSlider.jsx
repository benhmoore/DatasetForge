import { useState, useRef, useEffect, useCallback } from 'react';

const CustomSlider = ({
  min = 1,
  max = 10,
  step = 1,
  value,
  onChange,
  disabled = false,
  label,
  showValue = true,
}) => {
  const sliderRef = useRef(null);
  const thumbRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const getPercentage = useCallback(() => {
    return ((value - min) / (max - min)) * 100;
  }, [value, min, max]);

  const getValueFromPosition = useCallback((clientX) => {
    if (!sliderRef.current) return value;

    const rect = sliderRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = offsetX / rect.width;
    let newValue = min + percentage * (max - min);

    // Snap to step
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(newValue, max)); // Clamp within min/max

    return newValue;
  }, [min, max, step, value]);

  const handleInteractionStart = useCallback((e) => {
    if (disabled) return;
    e.stopPropagation(); // Prevent node drag
    setIsDragging(true);
    // Prevent text selection during drag
    e.preventDefault();
    // Focus the thumb for keyboard accessibility if needed, though dragging is primary
    thumbRef.current?.focus();
  }, [disabled]);

  const handleInteractionMove = useCallback((e) => {
    if (!isDragging || disabled) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const newValue = getValueFromPosition(clientX);

    if (newValue !== value) {
      onChange(newValue);
    }
  }, [isDragging, disabled, getValueFromPosition, onChange, value]);

  const handleInteractionEnd = useCallback(() => {
    if (disabled) return;
    setIsDragging(false);
  }, [disabled]);

  // Add/remove global event listeners for mouse/touch move and end
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleInteractionMove);
      document.addEventListener('touchmove', handleInteractionMove);
      document.addEventListener('mouseup', handleInteractionEnd);
      document.addEventListener('touchend', handleInteractionEnd);
    } else {
      document.removeEventListener('mousemove', handleInteractionMove);
      document.removeEventListener('touchmove', handleInteractionMove);
      document.removeEventListener('mouseup', handleInteractionEnd);
      document.removeEventListener('touchend', handleInteractionEnd);
    }

    // Cleanup function
    return () => {
      document.removeEventListener('mousemove', handleInteractionMove);
      document.removeEventListener('touchmove', handleInteractionMove);
      document.removeEventListener('mouseup', handleInteractionEnd);
      document.removeEventListener('touchend', handleInteractionEnd);
    };
  }, [isDragging, handleInteractionMove, handleInteractionEnd]);

  // Handle keyboard interactions for accessibility
  const handleKeyDown = useCallback((e) => {
    if (disabled) return;
    let newValue = value;
    if (e.key === 'ArrowLeft') {
      newValue = Math.max(min, value - step);
    } else if (e.key === 'ArrowRight') {
      newValue = Math.min(max, value + step);
    } else if (e.key === 'Home') {
      newValue = min;
    } else if (e.key === 'End') {
      newValue = max;
    }

    if (newValue !== value) {
      onChange(newValue);
      e.preventDefault(); // Prevent page scroll
    }
  }, [disabled, value, min, max, step, onChange]);

  const percentage = getPercentage();

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {showValue && `: ${value}`}
        </label>
      )}
      <div
        ref={sliderRef}
        className={`relative w-full h-2 rounded-full cursor-pointer nodrag ${
          disabled ? 'bg-gray-200 cursor-not-allowed' : 'bg-gray-300'
        }`}
        onMouseDown={(e) => { // Stop propagation on track mousedown
          if (disabled) return;
          e.stopPropagation(); 
          handleInteractionStart(e); 
        }}
        onTouchStart={(e) => { // Stop propagation on track touchstart
          if (disabled) return;
          e.stopPropagation();
          handleInteractionStart(e);
        }}
        onClick={(e) => { // Allow clicking on track to set value
          if (disabled) return;
          e.stopPropagation(); // Also stop propagation on click
          const newValue = getValueFromPosition(e.clientX);
          if (newValue !== value) {
            onChange(newValue);
          }
        }}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-orientation="horizontal"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0} // Make track focusable if thumb isn't directly focusable
        onKeyDown={handleKeyDown} // Handle keydown on the track as well
      >
        {/* Filled part of the track */}
        <div
          className={`absolute h-2 rounded-l-full ${
            disabled ? 'bg-gray-400' : 'bg-primary-600'
          }`}
          style={{ width: `${percentage}%` }}
        />
        {/* Thumb */}
        <div
          ref={thumbRef}
          className={`absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 nodrag ${
            disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary-600 cursor-grab active:cursor-grabbing'
          }`}
          style={{ left: `${percentage}%` }}
          tabIndex={disabled ? -1 : 0} // Make thumb focusable
          onKeyDown={handleKeyDown} // Handle keydown directly on the thumb
          onMouseDown={(e) => { // Stop propagation on thumb mousedown
             if (disabled) return;
             e.stopPropagation(); 
             handleInteractionStart(e);
          }}
          onTouchStart={(e) => { // Stop propagation on thumb touchstart
             if (disabled) return;
             e.stopPropagation();
             handleInteractionStart(e);
          }}
        />
      </div>
    </div>
  );
};

export default CustomSlider;
