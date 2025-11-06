import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: apiMocks.getMock,
    post: apiMocks.postMock,
  },
}));

const loginMock = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

const setLocationMock = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => [null, setLocationMock],
}));

vi.mock('@/lib/security', () => ({
  validatePaymentUrl: vi.fn(() => true),
  generateRecaptchaToken: vi.fn(async () => 'recaptcha-token'),
}));

vi.mock('@/lib/constants', () => ({
  PRICING_TIERS: {
    basic: {
      upfrontFee: { ngn: '₦1,000', usd: '$1' },
      price: { ngn: '₦30,000', usd: '$30' },
      features: ['Feature A', 'Feature B', 'Feature C', 'Feature D'],
    },
    pro: {
      upfrontFee: { ngn: '₦1,000', usd: '$1' },
      price: { ngn: '₦100,000', usd: '$100' },
      features: ['Feature A', 'Feature B', 'Feature C', 'Feature D'],
    },
    enterprise: {
      upfrontFee: { ngn: '₦1,000', usd: '$1' },
      price: { ngn: '₦500,000', usd: '$500' },
      features: ['Feature A', 'Feature B', 'Feature C', 'Feature D'],
    },
  },
  VALID_LOCATIONS: ['nigeria', 'international'],
}));

vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ onChange, value, ...rest }: any) => (
    <input
      data-testid="phone-input"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      {...rest}
    />
  ),
}));

vi.mock('@/components/ui/password-strength', () => ({
  PasswordStrength: () => null,
}));

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: any) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  apiMocks.getMock.mockReset();
  apiMocks.postMock.mockReset();
  loginMock.mockReset();
  setLocationMock.mockReset();
});

describe('Signup free trial flow UI', () => {
  it('displays free trial messaging without payment prompts', async () => {
    apiMocks.postMock.mockResolvedValueOnce({ status: 'success' });

    const { default: Signup } = await import('@/components/auth/signup');

    render(<Signup />);

    expect(screen.getByText('Create Your ChainSync Account')).toBeInTheDocument();
    expect(screen.getByText('Start your 2-week free trial instantly. No payment required today.')).toBeInTheDocument();
    expect(screen.queryByText(/Complete Your Subscription/i)).toBeNull();
    expect(apiMocks.getMock).not.toHaveBeenCalled();
  });

  it('submits signup data and redirects to email verification', async () => {
    apiMocks.postMock.mockResolvedValueOnce({ status: 'success', verifyEmailSent: true });

    const { default: Signup } = await import('@/components/auth/signup');

    render(<Signup />);

    const fillInput = (label: RegExp, value: string) => {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
    };

    fillInput(/First Name/i, 'Jane');
    fillInput(/Last Name/i, 'Doe');
    fillInput(/Email Address/i, 'jane@example.com');
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+11111111111' } });
    fillInput(/Company Name/i, 'Jane Co');
    fillInput(/^Password/i, 'StrongPass123!');
    fillInput(/Confirm Password/i, 'StrongPass123!');

    const submitButton = screen.getByRole('button', { name: /Create Account & Continue/i });

    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(apiMocks.postMock).toHaveBeenCalledWith(
        '/auth/signup',
        expect.objectContaining({
          email: 'jane@example.com',
          recaptchaToken: 'recaptcha-token',
        })
      );
    });

    expect(loginMock).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 600));

    expect(setLocationMock).toHaveBeenCalledWith(expect.stringContaining('/verify-email'));
  });
});
