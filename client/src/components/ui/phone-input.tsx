import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

// E.164 phone validation regex (same as backend)
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/* eslint-disable no-unused-vars -- prop names required for API */
interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}
/* eslint-enable no-unused-vars */

export function PhoneInput({ 
  value, 
  onChange, 
  placeholder = "+234 801 234 5678", 
  className,
  disabled = false,
  required = false,
  id
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    setDisplayValue(formatPhoneNumber(value));
    setIsValid(!value || PHONE_REGEX.test(value));
  }, [value]);

  const formatPhoneNumber = (phone: string): string => {
    // Handle country code format: +234 801 234 5678
    if (phone.startsWith('+')) {
      const parts = phone.split(' ');
      if (parts.length >= 2) {
        const countryCode = parts[0];
        const number = parts.slice(1).join('').replace(/\D/g, '');
        
        if (number.length <= 3) {
          return `${countryCode} ${number}`;
        } else if (number.length <= 6) {
          return `${countryCode} ${number.slice(0, 3)} ${number.slice(3)}`;
        } else if (number.length <= 9) {
          return `${countryCode} ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
        } else {
          return `${countryCode} ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6, 9)}`;
        }
      }
      return phone;
    }
    
    // Fallback to original formatting for numbers without country code
    const cleaned = phone.replace(/\D/g, '');
    
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
    
    // Handle country code format
    if (input.startsWith('+')) {
      // Allow plus sign and spaces for country code format
      // Store the clean E.164 format for the backend
      const cleanPhone = input.replace(/\s/g, '');
      onChange(cleanPhone);
      setDisplayValue(formatPhoneNumber(cleanPhone));
      setIsValid(!cleanPhone || PHONE_REGEX.test(cleanPhone));
    } else {
      // Fallback to original behavior for numbers without country code
      const cleaned = input.replace(/\D/g, '');
      
      // Limit to 15 digits (international standard)
      if (cleaned.length <= 15) {
        // Ensure it has a country code for E.164 compliance
        const phoneWithCountryCode = cleaned.length > 0 ? `+${cleaned}` : cleaned;
        onChange(phoneWithCountryCode);
        setDisplayValue(formatPhoneNumber(phoneWithCountryCode));
        setIsValid(!phoneWithCountryCode || PHONE_REGEX.test(phoneWithCountryCode));
      }
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
    
    // Allow plus sign (+) for country code
    if (e.keyCode === 187 && e.shiftKey) { // Shift + = (produces +)
      return;
    }
    
    // Allow space for formatting
    if (e.keyCode === 32) {
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
    
    // Handle country code format
    if (pastedText.startsWith('+')) {
      const cleanPhone = pastedText.replace(/\s/g, '');
      onChange(cleanPhone);
      setDisplayValue(formatPhoneNumber(cleanPhone));
      setIsValid(!cleanPhone || PHONE_REGEX.test(cleanPhone));
    } else {
      // Fallback to original behavior
      const cleaned = pastedText.replace(/\D/g, '');
      
      if (cleaned.length <= 15) {
        // Ensure it has a country code for E.164 compliance
        const phoneWithCountryCode = cleaned.length > 0 ? `+${cleaned}` : cleaned;
        onChange(phoneWithCountryCode);
        setDisplayValue(formatPhoneNumber(phoneWithCountryCode));
        setIsValid(!phoneWithCountryCode || PHONE_REGEX.test(phoneWithCountryCode));
      }
    }
  };

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="tel"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        className={cn('font-mono', className, !isValid && 'border-red-500 focus:border-red-500')}
        disabled={disabled}
        required={required}
        maxLength={20} // Allow for country code format: +234 801 234 5678 (20 characters)
      />
      {!isValid && value && (
        <p className="text-sm text-red-500">
          Phone number must be in E.164 format (e.g., +1234567890)
        </p>
      )}
    </div>
  );
}
