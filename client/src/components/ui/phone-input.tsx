import React, { useState, useEffect } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export function PhoneInput({ 
  value, 
  onChange, 
  placeholder = "Phone number", 
  className,
  disabled = false,
  required = false,
  id
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    setDisplayValue(formatPhoneNumber(value));
  }, [value]);

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Format based on length
    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    } else if (cleaned.length <= 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // Remove all non-digit characters for storage
    const cleaned = input.replace(/\D/g, '');
    
    // Limit to 15 digits (international standard)
    if (cleaned.length <= 15) {
      onChange(cleaned);
      setDisplayValue(formatPhoneNumber(cleaned));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, and navigation keys
    if ([8, 9, 27, 13, 46, 37, 38, 39, 40].includes(e.keyCode)) {
      return;
    }
    
    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) {
      return;
    }
    
    // Allow: home, end
    if ([35, 36].includes(e.keyCode)) {
      return;
    }
    
    // Allow only digits
    if ((e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 96 && e.keyCode <= 105)) {
      return;
    }
    
    // Prevent other keys
    e.preventDefault();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleaned = pastedText.replace(/\D/g, '');
    
    if (cleaned.length <= 15) {
      onChange(cleaned);
      setDisplayValue(formatPhoneNumber(cleaned));
    }
  };

  return (
    <Input
      id={id}
      type="tel"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      className={cn('font-mono', className)}
      disabled={disabled}
      required={required}
      maxLength={17} // 3-3-4 format + 2 hyphens = 17 characters
    />
  );
}
