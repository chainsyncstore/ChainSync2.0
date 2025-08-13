import { describe, it, expect } from 'vitest';
import { SignupSchema } from '../../server/schemas/auth';

describe('SignupSchema Validation', () => {
  describe('Valid Inputs', () => {
    it('should validate a complete valid signup payload', () => {
      const validPayload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'New York'
      };

      const result = SignupSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.firstName).toBe('John');
        expect(result.data.lastName).toBe('Doe');
        expect(result.data.email).toBe('john.doe@example.com');
        expect(result.data.phone).toBe('+1234567890');
        expect(result.data.companyName).toBe('Acme Corp');
        expect(result.data.password).toBe('SecurePass123');
        expect(result.data.tier).toBe('basic');
        expect(result.data.location).toBe('New York');
      }
    });

    it('should validate with pro tier', () => {
      const validPayload = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@company.com',
        phone: '+9876543210',
        companyName: 'Tech Solutions',
        password: 'StrongPwd456',
        tier: 'pro',
        location: 'San Francisco'
      };

      const result = SignupSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.tier).toBe('pro');
      }
    });

    it('should validate with enterprise tier', () => {
      const validPayload = {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@enterprise.com',
        phone: '+1122334455',
        companyName: 'Enterprise Inc',
        password: 'EnterprisePass789',
        tier: 'enterprise',
        location: 'Chicago'
      };

      const result = SignupSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.tier).toBe('enterprise');
      }
    });

    it('should trim whitespace from text fields', () => {
      const validPayload = {
        firstName: '  Alice  ',
        lastName: '  Brown  ',
        email: 'alice.brown@example.com',
        phone: '+1555666777',
        companyName: '  Clean Corp  ',
        password: 'CleanPass123',
        tier: 'basic',
        location: '  Los Angeles  '
      };

      const result = SignupSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.firstName).toBe('Alice');
        expect(result.data.lastName).toBe('Brown');
        expect(result.data.companyName).toBe('Clean Corp');
        expect(result.data.location).toBe('Los Angeles');
      }
    });
  });

  describe('Invalid Inputs', () => {
    describe('Required Fields', () => {
      it('should reject missing firstName', () => {
        const invalidPayload = {
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(0);
          const firstNameErrors = result.error.issues.filter(issue => issue.path.includes('firstName'));
          expect(firstNameErrors.length).toBeGreaterThan(0);
          expect(firstNameErrors.some(error => error.message.includes('required'))).toBe(true);
        }
      });

      it('should reject missing email', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['email']);
          expect(result.error.issues[0].message).toBe('Email is required');
        }
      });
    });

    describe('Email Validation', () => {
      it('should reject invalid email format', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['email']);
          expect(result.error.issues[0].message).toBe('Invalid email format');
        }
      });

      it('should reject email longer than 254 characters', () => {
        const longEmail = 'a'.repeat(250) + '@example.com';
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: longEmail,
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['email']);
          expect(result.error.issues[0].message).toBe('Email must be 254 characters or less');
        }
      });
    });

    describe('Password Validation', () => {
      it('should reject password shorter than 8 characters', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'Short',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(0);
          const passwordErrors = result.error.issues.filter(issue => issue.path.includes('password'));
          expect(passwordErrors.length).toBeGreaterThan(0);
          expect(passwordErrors.some(error => error.message.includes('at least 8 characters'))).toBe(true);
        }
      });

      it('should reject password longer than 128 characters', () => {
        const longPassword = 'A'.repeat(129);
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: longPassword,
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(0);
          const passwordErrors = result.error.issues.filter(issue => issue.path.includes('password'));
          expect(passwordErrors.length).toBeGreaterThan(0);
          expect(passwordErrors.some(error => error.message.includes('128 characters or less'))).toBe(true);
        }
      });

      it('should reject password without lowercase letter', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'UPPERCASE123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['password']);
          expect(result.error.issues[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
      });

      it('should reject password without uppercase letter', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'lowercase123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['password']);
          expect(result.error.issues[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
      });

      it('should reject password without number', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'NoNumbers',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['password']);
          expect(result.error.issues[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
      });
    });

    describe('Phone Validation', () => {
      it('should reject invalid phone format', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '123-456-7890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['phone']);
          expect(result.error.issues[0].message).toBe('Phone number must be in E.164 format (e.g., +1234567890)');
        }
      });

      it('should reject phone number shorter than 7 digits', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+123456',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['phone']);
          expect(result.error.issues[0].message).toBe('Phone number must be in E.164 format (e.g., +1234567890)');
        }
      });

      it('should reject phone number longer than 16 digits', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+12345678901234567',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['phone']);
          expect(result.error.issues[0].message).toBe('Phone number must be in E.164 format (e.g., +1234567890)');
        }
      });
    });

    describe('Text Field Length Validation', () => {
      it('should reject firstName longer than 100 characters', () => {
        const longName = 'A'.repeat(101);
        const invalidPayload = {
          firstName: longName,
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['firstName']);
          expect(result.error.issues[0].message).toBe('Name must be 100 characters or less');
        }
      });

      it('should reject companyName longer than 100 characters', () => {
        const longCompany = 'A'.repeat(101);
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: longCompany,
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['companyName']);
          expect(result.error.issues[0].message).toBe('Company name must be 100 characters or less');
        }
      });

      it('should reject location longer than 50 characters', () => {
        const longLocation = 'A'.repeat(51);
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: longLocation
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['location']);
          expect(result.error.issues[0].message).toBe('Location must be 50 characters or less');
        }
      });
    });

    describe('Tier Validation', () => {
      it('should reject invalid tier value', () => {
        const invalidPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'invalid-tier',
          location: 'New York'
        };

        const result = SignupSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].path).toEqual(['tier']);
          expect(result.error.issues[0].message).toBe('Tier must be one of: basic, pro, enterprise');
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings as invalid', () => {
      const invalidPayload = {
        firstName: '',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'New York'
      };

      const result = SignupSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const firstNameErrors = result.error.issues.filter(issue => issue.path.includes('firstName'));
        expect(firstNameErrors.length).toBeGreaterThan(0);
        expect(firstNameErrors.some(error => error.message.includes('required'))).toBe(true);
      }
    });

    it('should handle whitespace-only strings as invalid', () => {
      const invalidPayload = {
        firstName: '   ',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'New York'
      };

      const result = SignupSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const firstNameErrors = result.error.issues.filter(issue => issue.path.includes('firstName'));
        expect(firstNameErrors.length).toBeGreaterThan(0);
        expect(firstNameErrors.some(error => error.message.includes('required'))).toBe(true);
      }
    });

    it('should handle null values as invalid', () => {
      const invalidPayload = {
        firstName: null,
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        companyName: 'Acme Corp',
        password: 'SecurePass123',
        tier: 'basic',
        location: 'New York'
      };

      const result = SignupSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const firstNameErrors = result.error.issues.filter(issue => issue.path.includes('firstName'));
        expect(firstNameErrors.length).toBeGreaterThan(0);
        expect(firstNameErrors.some(error => error.message.includes('required') || error.message.includes('Expected string'))).toBe(true);
      }
    });
  });
});
