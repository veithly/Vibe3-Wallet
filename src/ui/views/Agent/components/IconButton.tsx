import React from 'react';
import { Tooltip } from 'antd';
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
  const IconComponent = typeof icon === 'string' ? getIcon(icon) : icon;

  const buttonClassName = [
    'icon-button',
    `icon-button--${variant}`,
    `icon-button--${size}`,
    active && 'icon-button--active',
    disabled && 'icon-button--disabled',
    loading && 'icon-button--loading',
    validationStatus && `icon-button--${validationStatus}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const buttonContent = (
    <button
      className={buttonClassName}
      onClick={onClick}
      disabled={disabled || loading}
      data-testid={testId}
      type="button"
    >
      <div className="icon-button__content">
        {loading ? (
          <Icons.Loader className="icon-button__icon icon-spin" />
        ) : (
          <IconComponent className="icon-button__icon" />
        )}
        {validationStatus && (
          <div className="icon-button__status">
            {validationStatus === 'valid' && (
              <Icons.Check className="icon-button__status-icon" />
            )}
            {validationStatus === 'invalid' && (
              <Icons.X className="icon-button__status-icon" />
            )}
            {validationStatus === 'pending' && (
              <Icons.Loader className="icon-button__status-icon icon-spin" />
            )}
          </div>
        )}
      </div>
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="bottom">
        {buttonContent}
      </Tooltip>
    );
  }

  return buttonContent;
};

export default IconButton;
