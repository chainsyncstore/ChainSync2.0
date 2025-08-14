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
export async function generateRecaptchaToken(action: string = 'signup'): Promise<string> {
  console.log('generateRecaptchaToken called, RECAPTCHA_SITE_KEY:', RECAPTCHA_SITE_KEY);
  
  // Check if the site key is configured
  if (!RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY === '6Lc_your_recaptcha_site_key_here') {
    console.error('reCAPTCHA site key not configured or using placeholder value');
    throw new Error('reCAPTCHA site key not configured. Please set VITE_RECAPTCHA_SITE_KEY in your environment variables.');
  }
  
  return new Promise((resolve, reject) => {
    const loadRecaptchaScript = () => {
      return new Promise<void>((resolveScript, rejectScript) => {
        // Check if script is already loaded
        if (document.querySelector('script[src*="recaptcha/api.js"]')) {
          console.log('reCAPTCHA script already loaded');
          resolveScript();
          return;
        }

        console.log('Loading reCAPTCHA script...');
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.onload = () => {
          console.log('reCAPTCHA script loaded successfully');
          resolveScript();
        };
        script.onerror = () => {
          console.error('Failed to load reCAPTCHA script');
          rejectScript(new Error('Failed to load reCAPTCHA script'));
        };
        document.head.appendChild(script);
      });
    };

    const generateToken = async () => {
      try {
        console.log('Waiting for reCAPTCHA to be ready...');
        // Wait for reCAPTCHA to be ready
        await new Promise<void>((resolveReady) => {
          if (typeof window !== 'undefined' && window.grecaptcha) {
            console.log('grecaptcha available, calling ready()');
            window.grecaptcha.ready(resolveReady);
          } else {
            // If grecaptcha is not available, wait a bit and try again
            console.log('grecaptcha not available, waiting...');
            setTimeout(() => {
              if (window.grecaptcha) {
                console.log('grecaptcha now available, calling ready()');
                window.grecaptcha.ready(resolveReady);
              } else {
                reject(new Error('reCAPTCHA failed to load'));
              }
            }, 1000);
          }
        });

        console.log('reCAPTCHA ready, executing...', { action });
        // Generate the token for the requested action
        const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
        console.log('reCAPTCHA token generated successfully, length:', token.length);
        resolve(token);
      } catch (error) {
        console.error('Error generating reCAPTCHA token:', error);
        reject(error);
      }
    };

    // Load reCAPTCHA script if needed, then generate token
    loadRecaptchaScript()
      .then(() => {
        // Wait a bit for the script to initialize
        console.log('Waiting for script initialization...');
        setTimeout(generateToken, 500);
      })
      .catch((error) => {
        console.error('Failed to load reCAPTCHA:', error);
        // Don't use fallback token in production - throw error instead
        reject(new Error(`Failed to load reCAPTCHA: ${error.message}`));
      });
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
