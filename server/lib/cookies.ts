import { Response } from 'express';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
  domain?: string;
}

export const defaultCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined
};

export class SecureCookieManager {
  /**
   * Set a secure cookie for pending signup user ID
   */
  static setPendingSignupUserId(res: Response, userId: string): void {
    const options = {
      ...defaultCookieOptions,
      maxAge: 30 * 60 * 1000, // 30 minutes for pending signup
      path: '/'
    };
    
    res.cookie('pendingSignupUserId', userId, options);
  }

  /**
   * Get pending signup user ID from cookie
   */
  static getPendingSignupUserId(req: any): string | null {
    return req.cookies?.pendingSignupUserId || null;
  }

  /**
   * Clear pending signup user ID cookie
   */
  static clearPendingSignupUserId(res: Response): void {
    res.clearCookie('pendingSignupUserId', { path: '/' });
  }

  /**
   * Set pending signup tier
   */
  static setPendingSignupTier(res: Response, tier: string): void {
    const options = {
      ...defaultCookieOptions,
      maxAge: 30 * 60 * 1000, // 30 minutes
      path: '/'
    };
    res.cookie('pendingSignupTier', tier, options);
  }

  /**
   * Get pending signup tier
   */
  static getPendingSignupTier(req: any): string | null {
    return req.cookies?.pendingSignupTier || null;
  }

  /**
   * Clear pending signup tier
   */
  static clearPendingSignupTier(res: Response): void {
    res.clearCookie('pendingSignupTier', { path: '/' });
  }

  /**
   * Set pending signup location
   */
  static setPendingSignupLocation(res: Response, location: 'nigeria' | 'international'): void {
    const options = {
      ...defaultCookieOptions,
      maxAge: 30 * 60 * 1000, // 30 minutes
      path: '/'
    };
    res.cookie('pendingSignupLocation', location, options);
  }

  /**
   * Get pending signup location
   */
  static getPendingSignupLocation(req: any): 'nigeria' | 'international' | null {
    return (req.cookies?.pendingSignupLocation as 'nigeria' | 'international') || null;
  }

  /**
   * Clear pending signup location
   */
  static clearPendingSignupLocation(res: Response): void {
    res.clearCookie('pendingSignupLocation', { path: '/' });
  }

  /**
   * Set a secure CSRF token cookie
   */
  static setCsrfToken(res: Response, token: string): void {
    const options = {
      ...defaultCookieOptions,
      maxAge: 60 * 60 * 1000, // 1 hour for CSRF token
      path: '/'
    };
    
    res.cookie('csrfToken', token, options);
  }

  /**
   * Get CSRF token from cookie
   */
  static getCsrfToken(req: any): string | null {
    return req.cookies?.csrfToken || null;
  }

  /**
   * Clear CSRF token cookie
   */
  static clearCsrfToken(res: Response): void {
    res.clearCookie('csrfToken', { path: '/' });
  }
}
