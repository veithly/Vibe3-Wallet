import React, { useState } from 'react';
import { Icons, IconName, getIcon } from '../utils/icons';
import '../styles/IconButton.less';

export interface IconButtonProps {
  icon: IconName | React.FC<React.SVGProps<SVGSVGElement>>;
  onClick: () => void;
  tooltip?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
  active?: boolean;
  validationStatus?: 'valid' | 'invalid' | 'pending';
}

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  tooltip,
  variant = 'secondary',
  size = 'medium',
  disabled = false,
  loading = false,
  className = '',
  'data-testid': testId,
  active = false,
  validationStatus,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const IconComponent = typeof icon === 'string' ? getIcon(icon) : icon;

  const buttonClassName = [
    // Base styles with explicit dimensions
    'inline-flex items-center justify-center rounded-md transition-colors duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',

    // Size variants with explicit minimum dimensions
    size === 'small' && 'p-2 text-base min-w-[2rem] min-h-[2rem]',
    size === 'medium' && 'p-2.5 text-lg min-w-[2.5rem] min-h-[2.5rem]',
    size === 'large' && 'p-3 text-xl min-w-[3rem] min-h-[3rem]',

    // Default background for secondary variant (most common in sidebar)
    'bg-gray-200 text-gray-700 hover:bg-gray-300',

    // Color variants (override defaults)
    variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500',
    variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',

    // Dark mode support
    'dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',

    // Active state
    active && 'ring-2 ring-offset-2 ring-gray-500 dark:ring-gray-400',
    variant === 'primary' && active && 'ring-blue-500',
    variant === 'danger' && active && 'ring-red-500',

    // Validation status
    validationStatus === 'valid' && 'ring-2 ring-green-500 ring-offset-2',
    validationStatus === 'invalid' && 'ring-2 ring-red-500 ring-offset-2',
    validationStatus === 'pending' && 'ring-2 ring-yellow-500 ring-offset-2',

    // Custom className
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleMouseEnter = () => {
    if (tooltip && !disabled) {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <div className="inline-block relative icon-button-wrapper">
      <button
        className={buttonClassName}
        onClick={onClick}
        disabled={disabled || loading}
        data-testid={testId}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          minWidth: size === 'small' ? '2rem' : size === 'medium' ? '2.5rem' : '3rem',
          minHeight: size === 'small' ? '2rem' : size === 'medium' ? '2.5rem' : '3rem',
        }}
      >
        <div className="flex relative justify-center items-center">
          {loading ? (
            <Icons.Loader className={
              size === 'small' ? 'w-4 h-4 icon-spin' :
              size === 'medium' ? 'w-5 h-5 icon-spin' :
              'w-12 h-12 icon-spin'
            } />
          ) : (
            <IconComponent className={
              size === 'small' ? 'w-4 h-4' :
              size === 'medium' ? 'w-5 h-5' :
              'w-12 h-12'
            } />
          )}
          {validationStatus && (
            <div className="icon-button__status">
              {validationStatus === 'valid' && (
                <Icons.Check className="text-green-500 icon-button__status-icon" />
              )}
              {validationStatus === 'invalid' && (
                <Icons.X className="text-red-500 icon-button__status-icon" />
              )}
              {validationStatus === 'pending' && (
                <Icons.Loader className="text-yellow-500 icon-button__status-icon icon-spin" />
              )}
            </div>
          )}
        </div>
      </button>
      {tooltip && showTooltip && !disabled && (
        <div className="absolute bottom-full left-1/2 z-50 px-2 py-1 mb-2 text-xs text-white whitespace-nowrap bg-gray-800 rounded transform -translate-x-1/2">
          {tooltip}
          <div className="absolute top-full left-1/2 border-4 border-transparent transform -translate-x-1/2 border-t-gray-800"></div>
        </div>
      )}
    </div>
  );
};

export default IconButton;
