import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import IconButton from '../IconButton';
jest.mock('@/background/service/agent', () => ({
  agent: { removeProvider: jest.fn() },
}));

// Mock Antd Tooltip
jest.mock('antd', () => ({
  Tooltip: ({ children, title }: any) => (
    <div data-tooltip={title}>{children}</div>
  ),
}));

// Mock icons
jest.mock('../../utils/icons', () => ({
  Icons: {
    Settings: () => <svg data-testid="settings-icon" />,
    History: () => <svg data-testid="history-icon" />,
    Sun: () => <svg data-testid="sun-icon" />,
    Moon: () => <svg data-testid="moon-icon" />,
    Loader: () => <svg data-testid="loader-icon" />,
    Check: () => <svg data-testid="check-icon" />,
    X: () => <svg data-testid="x-icon" />,
  },
  getIcon: jest.fn((iconName: string) => {
    const iconMap: any = {
      settings: () => <svg data-testid="settings-icon" />,
      history: () => <svg data-testid="history-icon" />,
      sun: () => <svg data-testid="sun-icon" />,
      moon: () => <svg data-testid="moon-icon" />,
    };
    return iconMap[iconName] || (() => <svg data-testid="default-icon" />);
  }),
}));

describe('IconButton Component', () => {
  const defaultProps = {
    icon: 'settings' as const,
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('renders correctly with required props', () => {
      render(<IconButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
      const mockClick = jest.fn();
      render(<IconButton {...defaultProps} onClick={mockClick} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockClick).toHaveBeenCalledTimes(1);
    });

    it('applies custom test id', () => {
      render(<IconButton {...defaultProps} data-testid="custom-button" />);

      expect(screen.getByTestId('custom-button')).toBeInTheDocument();
    });
  });

  describe('Visual Variants', () => {
    it('applies primary variant styles', () => {
      render(<IconButton {...defaultProps} variant="primary" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--primary');
    });

    it('applies secondary variant styles (default)', () => {
      render(<IconButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--secondary');
    });

    it('applies danger variant styles', () => {
      render(<IconButton {...defaultProps} variant="danger" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--danger');
    });
  });

  describe('Size Variants', () => {
    it('applies small size styles', () => {
      render(<IconButton {...defaultProps} size="small" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--small');
    });

    it('applies medium size styles (default)', () => {
      render(<IconButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--medium');
    });

    it('applies large size styles', () => {
      render(<IconButton {...defaultProps} size="large" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--large');
    });
  });

  describe('State Management', () => {
    it('shows disabled state', () => {
      render(<IconButton {...defaultProps} disabled />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('icon-button--disabled');
    });

    it('shows active state', () => {
      render(<IconButton {...defaultProps} active />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--active');
    });

    it('shows loading state', () => {
      render(<IconButton {...defaultProps} loading />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('icon-button--loading');
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('does not call onClick when disabled', () => {
      const mockClick = jest.fn();
      render(<IconButton {...defaultProps} onClick={mockClick} disabled />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockClick).not.toHaveBeenCalled();
    });

    it('does not call onClick when loading', () => {
      const mockClick = jest.fn();
      render(<IconButton {...defaultProps} onClick={mockClick} loading />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockClick).not.toHaveBeenCalled();
    });
  });

  describe('Validation Status', () => {
    it('shows valid status indicator', () => {
      render(<IconButton {...defaultProps} validationStatus="valid" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--valid');
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });

    it('shows invalid status indicator', () => {
      render(<IconButton {...defaultProps} validationStatus="invalid" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--invalid');
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    it('shows pending status indicator', () => {
      render(<IconButton {...defaultProps} validationStatus="pending" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('icon-button--pending');
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('Tooltip Functionality', () => {
    it('renders with tooltip when provided', () => {
      render(<IconButton {...defaultProps} tooltip="Settings Button" />);

      expect(
        screen.getByRole('button').closest('[data-tooltip="Settings Button"]')
      ).toBeInTheDocument();
    });

    it('renders without tooltip wrapper when not provided', () => {
      render(<IconButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button.closest('[data-tooltip]')).toBeNull();
    });
  });

  describe('Custom Icon Component', () => {
    it('renders custom icon component', () => {
      const CustomIcon = () => <svg data-testid="custom-icon" />;
      render(<IconButton {...defaultProps} icon={CustomIcon} />);

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('applies custom className', () => {
      render(<IconButton {...defaultProps} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('icon-button');
    });

    it('combines all relevant CSS classes', () => {
      render(
        <IconButton
          {...defaultProps}
          variant="primary"
          size="large"
          active
          loading
          validationStatus="valid"
          className="custom-class"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass(
        'icon-button',
        'icon-button--primary',
        'icon-button--large',
        'icon-button--active',
        'icon-button--loading',
        'icon-button--valid',
        'custom-class'
      );
    });
  });

  describe('Accessibility', () => {
    it('has correct button role', () => {
      render(<IconButton {...defaultProps} />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has correct button type', () => {
      render(<IconButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('supports keyboard navigation', () => {
      const mockClick = jest.fn();
      render(<IconButton {...defaultProps} onClick={mockClick} />);

      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: 'Enter' });

      // Note: Enter key behavior is handled by the browser for button elements
      expect(button).toHaveFocus();
    });
  });

  describe('Dark Mode Integration', () => {
    it('renders correctly with dark mode icons', () => {
      render(<IconButton {...defaultProps} icon="moon" />);

      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('renders correctly with light mode icons', () => {
      render(<IconButton {...defaultProps} icon="sun" />);

      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    });
  });
});
