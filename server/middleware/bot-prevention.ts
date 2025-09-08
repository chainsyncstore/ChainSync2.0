import { Request, Response, NextFunction } from 'express';
import { botPreventionService } from '../lib/bot-prevention';
import { logger } from '../lib/logger';

export interface BotPreventionOptions {
  required?: boolean;
  expectedAction?: string;
  skipIfNotConfigured?: boolean;
}

/**
 * Middleware to validate captcha tokens for bot prevention
 */
export const botPreventionMiddleware = (options: BotPreventionOptions = {}) => {
  const {
    required = true,
    expectedAction = 'signup',
    skipIfNotConfigured = true
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      // Bypass entirely in test to unblock E2E flows
      if (process.env.NODE_ENV === 'test') {
        return next();
      }

      // Skip if bot prevention is not configured and we're allowed to skip
      if (!botPreventionService.isConfigured()) {
        const allowBypass = process.env.ALLOW_INSECURE_PAYMENT_NO_CAPTCHA === 'true';
        if (isProduction && required && !allowBypass) {
          logger.error('Bot prevention required in production but not configured', {
            path: req.path,
            ip: req.ip
          });
          return res.status(500).json({
            error: 'Bot prevention not configured',
            message: 'Captcha verification is required in production'
          });
        }

        logger.warn('Bot prevention not configured, bypassing validation per settings', {
          path: req.path,
          ip: req.ip,
          allowBypass,
          environment: process.env.NODE_ENV
        });
        return next();
      }

      // Get captcha token from request body or headers
      const captchaToken = req.body.captchaToken || req.body.recaptchaToken || req.body.hcaptchaToken || req.headers['x-captcha-token'];

      if (!captchaToken) {
        if (required) {
          const allowBypass = process.env.ALLOW_INSECURE_PAYMENT_NO_CAPTCHA === 'true';
          if (isProduction && !allowBypass) {
            logger.warn('Captcha token missing in production, rejecting request', {
              path: req.path,
              ip: req.ip,
              userAgent: req.get('User-Agent')
            });
            try {
              const { monitoringService } = await import('../lib/monitoring');
              monitoringService.recordCaptchaFailure({
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                requestId: (req as any).requestId
              });
            } catch {}
            return res.status(400).json({
              error: 'Captcha token required',
              message: 'Please complete the captcha verification'
            });
          }
          logger.warn('Captcha token missing, bypassing due to configuration', {
            path: req.path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            environment: process.env.NODE_ENV,
            allowBypass
          });
          return next();
        } else {
          // Not required, continue without validation
          return next();
        }
      }

      // Verify the captcha token
      const verificationResult = await botPreventionService.verifyCaptcha(captchaToken, expectedAction);

      if (!verificationResult.success) {
        logger.warn('Captcha verification failed', {
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          error: verificationResult.error
        });
        try {
          const { monitoringService } = await import('../lib/monitoring');
          monitoringService.recordCaptchaFailure({
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            requestId: (req as any).requestId
          });
        } catch {}

        return res.status(400).json({
          error: 'Captcha verification failed',
          message: verificationResult.error || 'Please complete the captcha verification again'
        });
      }

      // Log successful verification
      logger.info('Captcha verification successful', {
        path: req.path,
        ip: req.ip,
        score: verificationResult.score,
        action: verificationResult.action
      });

      // Add verification result to request for potential use in route handlers
      req.captchaVerification = verificationResult;

      next();
    } catch (error) {
      logger.error('Bot prevention middleware error', undefined, error as Error);
      
      if (required) {
        return res.status(500).json({
          error: 'Bot prevention error',
          message: 'Failed to verify captcha, please try again'
        });
      } else {
        // Not required, continue without validation
        logger.warn('Bot prevention error occurred but continuing without validation', {
          path: req.path,
          ip: req.ip,
          error: (error as any)?.message
        });
        return next();
      }
    }
  };
};

/**
 * Middleware specifically for signup endpoints
 */
export const signupBotPrevention = botPreventionMiddleware({
  required: true,
  expectedAction: 'signup',
  skipIfNotConfigured: true // Allow signup to proceed even if bot prevention is not configured
});

/**
 * Middleware specifically for payment endpoints
 */
export const paymentBotPrevention = botPreventionMiddleware({
  required: true,
  expectedAction: 'payment',
  skipIfNotConfigured: false
});

/**
 * Middleware for email verification endpoints
 */
export const emailVerificationBotPrevention = botPreventionMiddleware({
  required: true,
  expectedAction: 'email_verification',
  skipIfNotConfigured: false
});

// Extend Express Request interface to include captcha verification result
declare global {
  namespace Express {
    interface Request {
      captchaVerification?: {
        success: boolean;
        score?: number;
        action?: string;
        error?: string;
      };
    }
  }
}
