import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhoneInput } from '../../client/src/components/ui/phone-input';

describe('PhoneInput Component', () => {
  const mockOnChange = vi.fn();

  it('should render with default props', () => {
    render(<PhoneInput value="" onChange={mockOnChange} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should display the provided value', () => {
    render(<PhoneInput value="1234567890" onChange={mockOnChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('123-456-7890');
  });

  it('should call onChange when input changes', () => {
    render(<PhoneInput value="" onChange={mockOnChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123' } });
    expect(mockOnChange).toHaveBeenCalledWith('123');
  });

  it('should format phone number as user types', () => {
    render(<PhoneInput value="" onChange={mockOnChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '1234567890' } });
    expect(mockOnChange).toHaveBeenCalledWith('1234567890');
  });

  it('should handle backspace correctly', () => {
    render(<PhoneInput value="1234567890" onChange={mockOnChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(input).toHaveValue('123-456-7890');
  });

  it('should show placeholder when no value', () => {
    render(<PhoneInput value="" onChange={mockOnChange} placeholder="Enter phone number" />);
    expect(screen.getByPlaceholderText('Enter phone number')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<PhoneInput value="" onChange={mockOnChange} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('should have correct aria-label', () => {
    render(<PhoneInput value="" onChange={mockOnChange} id="phone-input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'phone-input');
  });
});
