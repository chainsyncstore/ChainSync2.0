import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrength } from '../../client/src/components/ui/password-strength';

describe('PasswordStrength Component', () => {
  it('should not render when password is empty', () => {
    render(<PasswordStrength password="" />);
    expect(screen.queryByText('Password Strength:')).not.toBeInTheDocument();
  });

  it('should show very weak for short passwords', () => {
    render(<PasswordStrength password="123" />);
    expect(screen.getByText('Very Weak')).toBeInTheDocument();
  });

  it('should show weak for common passwords', () => {
    render(<PasswordStrength password="password" />);
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('should show fair for moderate passwords', () => {
    render(<PasswordStrength password="Password123" />);
    expect(screen.getByText('Fair')).toBeInTheDocument();
  });

  it('should show strong for complex passwords', () => {
    render(<PasswordStrength password="SecurePass123!@#" />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('should display password strength bar', () => {
    render(<PasswordStrength password="test" />);
    const strengthBar = document.querySelector('.bg-gray-200');
    expect(strengthBar).toBeInTheDocument();
  });

  it('should show suggestions when available', () => {
    render(<PasswordStrength password="password" />);
    // The component should show suggestions for weak passwords
    expect(screen.getByText('Suggestions:')).toBeInTheDocument();
  });
});
