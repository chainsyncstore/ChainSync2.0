import { describe, it, expect } from 'vitest';
import { SignupSchema } from '../../server/schemas/auth';

describe('SignupSchema - Behavior Tests', () => {
  describe('Valid Input Behavior', () => {
    it('should accept complete valid signup payload', () => {
      const validPayload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123!',
        tier: 'basic',
        location: 'international'
      };

      const result = SignupSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.firstName).toBe('John');
        expect(result.data.email).toBe('john.doe@example.com');
        expect(result.data.tier).toBe('basic');
      }
    });

    it('should accept different tier values', () => {
      const tiers = ['basic', 'pro', 'enterprise'];
      
      tiers.forEach(tier => {
        const validPayload = {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@company.com',
          phone: '+9876543210',
          companyName: 'Tech Solutions',
          password: 'StrongPwd456!',
          tier: tier,
          location: 'international'
        };

        const result = SignupSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Required Field Behavior', () => {
    it('should reject missing firstName', () => {
      const invalidPayload = {
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'international'
      };

      const result = SignupSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const invalidPayload = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'international'
      };

      const result = SignupSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Email Validation Behavior', () => {
    it('should reject invalid email format', () => {
      const invalidEmails = ['invalid-email', 'missing@domain', '@missing-username.com'];

      invalidEmails.forEach(email => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: email,
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    it('should accept valid email formats', () => {
      const validEmails = ['user@example.com', 'user.name@example.com', 'user+tag@example.com'];

      validEmails.forEach(email => {
        const validPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: email,
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Password Validation Behavior', () => {
    it('should reject weak passwords', () => {
      const weakPasswords = ['Short1!', 'UPPERCASE123', 'lowercase123', 'NoNumbers'];

      weakPasswords.forEach(password => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: password,
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    it('should accept strong passwords', () => {
      const strongPasswords = ['SecurePass123!', 'MyP@ssw0rd', 'Str0ng#Pwd'];

      strongPasswords.forEach(password => {
        const validPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: password,
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Phone Validation Behavior', () => {
    it('should reject invalid phone formats', () => {
      const invalidPhones = [
        '123-456-7890',      // Contains dashes
        '(123) 456-7890',    // Contains parentheses and spaces
        '0123456789',         // Starts with 0
        'abc123def'           // Contains letters
      ];

      invalidPhones.forEach(phone => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: phone,
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    it('should accept valid phone formats', () => {
      const validPhones = [
        '+1234567890',        // 10 digits with +
        '+441234567890',       // 11 digits with +
        '+2348012345678',          // 9 digits (minimum)
        '+123456789012345'    // 15 digits (maximum)
      ];

      validPhones.forEach(phone => {
        const validPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: phone,
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const result = SignupSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });
});
