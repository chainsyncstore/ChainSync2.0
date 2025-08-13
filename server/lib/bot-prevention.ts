import axios from 'axios';
import { logger } from './logger';

export interface CaptchaVerificationResult {
  success: boolean;
  score?: number;
  action?: string;
  error?: string;
}

export class BotPreventionService {
  private recaptchaSecretKey: string;
  private hcaptchaSecretKey: string;

  constructor() {
    this.recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY || '';
    this.hcaptchaSecretKey = process.env.HCAPTCHA_SECRET_KEY || '';
    
    // Debug logging
    logger.info('BotPreventionService initialized', {
      recaptchaConfigured: !!this.recaptchaSecretKey,
      hcaptchaConfigured: !!this.hcaptchaSecretKey,
      recaptchaKeyLength: this.recaptchaSecretKey.length,
      hcaptchaKeyLength: this.hcaptchaSecretKey.length
    });
  }

  /**
   * Verifies reCAPTCHA v3 token with Google's API
   */
  async verifyRecaptcha(token: string, expectedAction: string = 'signup'): Promise<CaptchaVerificationResult> {
    try {
      if (!this.recaptchaSecretKey) {
        logger.warn('reCAPTCHA secret key not configured');
        return { success: false, error: 'reCAPTCHA not configured' };
      }

      if (!token) {
        return { success: false, error: 'reCAPTCHA token is required' };
      }

      const response = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        {
          params: {
            secret: this.recaptchaSecretKey,
            response: token
          }
        }
      );

      const { success, score, action, 'error-codes': errorCodes } = response.data;

      if (!success) {
        logger.warn('reCAPTCHA verification failed', { errorCodes });
        return { 
          success: false, 
          error: `reCAPTCHA verification failed: ${errorCodes?.join(', ') || 'unknown error'}` 
        };
      }

      // Check if the action matches the expected action
      if (action && action !== expectedAction) {
        logger.warn('reCAPTCHA action mismatch', { expectedAction, actualAction: action });
        return { 
          success: false, 
          error: `reCAPTCHA action mismatch: expected ${expectedAction}, got ${action}` 
        };
      }

      // Check score threshold (0.0 is very likely a bot, 1.0 is very likely a human)
      const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');
      if (score !== undefined && score < minScore) {
        logger.warn('reCAPTCHA score too low', { score, minScore });
        return { 
          success: false, 
          error: `reCAPTCHA score too low: ${score} (minimum: ${minScore})` 
        };
      }

      logger.info('reCAPTCHA verification successful', { score, action });
      return { success: true, score, action };
    } catch (error) {
      logger.error('reCAPTCHA verification error', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during reCAPTCHA verification' 
      };
    }
  }

  /**
   * Verifies hCaptcha token with hCaptcha's API
   */
  async verifyHcaptcha(token: string): Promise<CaptchaVerificationResult> {
    try {
      if (!this.hcaptchaSecretKey) {
        logger.warn('hCaptcha secret key not configured');
        return { success: false, error: 'hCaptcha not configured' };
      }

      if (!token) {
        return { success: false, error: 'hCaptcha token is required' };
      }

      const response = await axios.post(
        'https://hcaptcha.com/siteverify',
        null,
        {
          params: {
            secret: this.hcaptchaSecretKey,
            response: token
          }
        }
      );

      const { success, 'error-codes': errorCodes } = response.data;

      if (!success) {
        logger.warn('hCaptcha verification failed', { errorCodes });
        return { 
          success: false, 
          error: `hCaptcha verification failed: ${errorCodes?.join(', ') || 'unknown error'}` 
        };
      }

      logger.info('hCaptcha verification successful');
      return { success: true };
    } catch (error) {
      logger.error('hCaptcha verification error', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during hCaptcha verification' 
      };
    }
  }

  /**
   * Verifies either reCAPTCHA or hCaptcha token based on the token format
   */
  async verifyCaptcha(token: string, expectedAction: string = 'signup'): Promise<CaptchaVerificationResult> {
    logger.info('verifyCaptcha called', {
      tokenLength: token.length,
      tokenContainsDot: token.includes('.'),
      recaptchaConfigured: !!this.recaptchaSecretKey,
      hcaptchaConfigured: !!this.hcaptchaSecretKey
    });
    
    // Prioritize reCAPTCHA if it's configured
    if (this.recaptchaSecretKey) {
      logger.info('Using reCAPTCHA verification');
      return this.verifyRecaptcha(token, expectedAction);
    }
    
    // Fall back to hCaptcha if reCAPTCHA is not configured
    if (this.hcaptchaSecretKey) {
      logger.info('Using hCaptcha verification');
      return this.verifyHcaptcha(token);
    }
    
    // If neither is configured, return an error
    logger.warn('No captcha service configured');
    return { success: false, error: 'No captcha service configured' };
  }

  /**
   * Checks if bot prevention is properly configured
   */
  isConfigured(): boolean {
    return !!(this.recaptchaSecretKey || this.hcaptchaSecretKey);
  }

  /**
   * Gets the preferred captcha type based on configuration
   */
  getPreferredCaptchaType(): 'recaptcha' | 'hcaptcha' | 'none' {
    if (this.recaptchaSecretKey) return 'recaptcha';
    if (this.hcaptchaSecretKey) return 'hcaptcha';
    return 'none';
  }
}

// Export singleton instance
export const botPreventionService = new BotPreventionService();
