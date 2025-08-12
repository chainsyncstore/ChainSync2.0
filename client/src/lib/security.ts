import { PAYMENT_PROVIDER_DOMAINS, RECAPTCHA_SITE_KEY, HCAPTCHA_SITE_KEY } from './constants';

/**
 * Validates if a payment URL is from an expected provider domain
 * @param url - The payment URL to validate
 * @param provider - The expected payment provider ('paystack' or 'flutterwave')
 * @returns true if the URL is valid, false otherwise
 */
export function validatePaymentUrl(url: string, provider: 'paystack' | 'flutterwave'): boolean {
  try {
    const urlObj = new URL(url);
    const allowedDomains = PAYMENT_PROVIDER_DOMAINS[provider];
    
    // Check if the hostname matches any of the allowed domains
    return allowedDomains.some(domain => 
      urlObj.hostname === domain || 
      urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch (error) {
    // Invalid URL format
    console.error('Invalid URL format:', error);
    return false;
  }
}

/**
 * Verifies reCAPTCHA v3 token
 * @param token - The reCAPTCHA token from the form submission
 * @returns Promise<boolean> - true if verification successful, false otherwise
 */
export async function verifyRecaptcha(token: string): Promise<boolean> {
  try {
    // In a real implementation, you would send this token to your backend
    // for verification with Google's reCAPTCHA API
    // For now, we'll return true to allow development to continue
    // TODO: Implement actual reCAPTCHA verification
    
    if (!token) {
      console.warn('reCAPTCHA token is missing - implement verification in production');
      return true; // Allow development to continue
    }
    
    // This should be replaced with actual verification logic
    return true;
  } catch (error) {
    console.error('reCAPTCHA verification failed:', error);
    return false;
  }
}

/**
 * Verifies hCaptcha token (alternative to reCAPTCHA)
 * @param token - The hCaptcha token from the form submission
 * @returns Promise<boolean> - true if verification successful, false otherwise
 */
export async function verifyHcaptcha(token: string): Promise<boolean> {
  try {
    // In a real implementation, you would send this token to your backend
    // for verification with hCaptcha's API
    // For now, we'll return true to allow development to continue
    // TODO: Implement actual hCaptcha verification
    
    if (!token) {
      console.warn('hCaptcha token is missing - implement verification in production');
      return true; // Allow development to continue
    }
    
    // This should be replaced with actual verification logic
    return true;
  } catch (error) {
    console.error('hCaptcha verification failed:', error);
    return false;
  }
}

/**
 * Generates a reCAPTCHA v3 token
 * @returns Promise<string> - The reCAPTCHA token
 */
export async function generateRecaptchaToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.grecaptcha) {
      try {
        window.grecaptcha.ready(() => {
          window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'signup' })
            .then((token: string) => resolve(token))
            .catch((error: any) => reject(error));
        });
      } catch (error) {
        reject(error);
      }
    } else {
      // Fallback for development or when reCAPTCHA is not loaded
      console.warn('reCAPTCHA not available - using fallback token');
      resolve('dev-token-' + Date.now());
    }
  });
}

/**
 * Generates an hCaptcha token
 * @returns Promise<string> - The hCaptcha token
 */
export async function generateHcaptchaToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.hcaptcha) {
      try {
        window.hcaptcha.execute({
          sitekey: HCAPTCHA_SITE_KEY,
          callback: (token: string) => resolve(token),
          'expired-callback': () => reject(new Error('hCaptcha expired')),
          'error-callback': () => reject(new Error('hCaptcha error'))
        });
      } catch (error) {
        reject(error);
      }
    } else {
      // Fallback for development or when hCaptcha is not loaded
      console.warn('hCaptcha not available - using fallback token');
      resolve('dev-token-' + Date.now());
    }
  });
}
