/**
 * DEPRECATED: This module now aliases the canonical `EnhancedAuthService`.
 * Canonical auth implementation is in `server/auth-enhanced.ts`.
 *
 * We preserve the `AuthService` name and helpers (`validatePassword`, `generateSecurePassword`)
 * for backward compatibility. All other methods come from `EnhancedAuthService`.
 */
import { EnhancedAuthService, authConfig as enhancedAuthConfig } from './auth-enhanced';

export { enhancedAuthConfig as authConfig };

export class AuthService extends EnhancedAuthService {
	static validatePassword(password: string): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!password || password.length < 8) errors.push('Password must be at least 8 characters long');
		if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
		if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
		if (!/\d/.test(password)) errors.push('Password must contain at least one number');
		if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain at least one special character');
		return { isValid: errors.length === 0, errors };
	}

	static generateSecurePassword(length: number = 16): string {
		const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
		let password = '';
		password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
		password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
		password += '0123456789'[Math.floor(Math.random() * 10)];
		password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
		for (let i = 4; i < length; i++) {
			password += charset[Math.floor(Math.random() * charset.length)];
		}
		return password.split('').sort(() => Math.random() - 0.5).join('');
	}
}
