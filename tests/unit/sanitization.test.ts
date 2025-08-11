import { describe, it, expect } from 'vitest';
import {
  sanitizeHtmlContent,
  sanitizeTextContent,
  sanitizePlainText,
  sanitizeUserInput,
  sanitizeObject,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl
} from '../../server/lib/sanitization';

describe('Sanitization Utilities', () => {
  describe('sanitizeHtmlContent', () => {
    it('should allow safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong>!</p>';
      const result = sanitizeHtmlContent(input);
      expect(result).toBe('<p>Hello <strong>world</strong>!</p>');
    });

    it('should remove dangerous HTML tags', () => {
      const input = '<script>alert("xss")</script><p>Hello</p>';
      const result = sanitizeHtmlContent(input);
      expect(result).toBe('<p>Hello</p>');
    });

    it('should remove dangerous attributes', () => {
      const input = '<a href="javascript:alert(\'xss\')" onclick="alert(\'xss\')">Click me</a>';
      const result = sanitizeHtmlContent(input);
      expect(result).toBe('<a>Click me</a>');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('javascript:');
    });

    it('should allow safe URLs', () => {
      const input = '<a href="https://example.com">Safe link</a>';
      const result = sanitizeHtmlContent(input);
      expect(result).toBe('<a href="https://example.com">Safe link</a>');
    });

    it('should handle empty input', () => {
      expect(sanitizeHtmlContent('')).toBe('');
      expect(sanitizeHtmlContent(null as any)).toBe('');
      expect(sanitizeHtmlContent(undefined as any)).toBe('');
    });
  });

  describe('sanitizeTextContent', () => {
    it('should allow safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong>!</p>';
      const result = sanitizeTextContent(input);
      expect(result).toBe('<p>Hello <strong>world</strong>!</p>');
    });

    it('should remove dangerous HTML tags', () => {
      const input = '<script>alert("xss")</script><p>Hello</p>';
      const result = sanitizeTextContent(input);
      expect(result).toBe('<p>Hello</p>');
    });

    it('should handle empty input', () => {
      expect(sanitizeTextContent('')).toBe('');
      expect(sanitizeTextContent(null as any)).toBe('');
      expect(sanitizeTextContent(undefined as any)).toBe('');
    });
  });

  describe('sanitizePlainText', () => {
    it('should remove all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong>!</p>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world!');
    });

    it('should remove script tags and content', () => {
      const input = '<script>alert("xss")</script>Hello world';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world');
    });

    it('should handle complex HTML', () => {
      const input = '<div><h1>Title</h1><p>Paragraph with <em>emphasis</em> and <a href="#">link</a></p></div>';
      const result = sanitizePlainText(input);
      expect(result).toBe('TitleParagraph with emphasis and link');
    });

    it('should handle empty input', () => {
      expect(sanitizePlainText('')).toBe('');
      expect(sanitizePlainText(null as any)).toBe('');
      expect(sanitizePlainText(undefined as any)).toBe('');
    });
  });

  describe('sanitizeUserInput', () => {
    it('should sanitize as plain text by default', () => {
      const input = '<p>Hello <script>alert("xss")</script>world</p>';
      const result = sanitizeUserInput(input);
      expect(result).toBe('Hello world');
    });

    it('should allow HTML when specified', () => {
      const input = '<p>Hello <strong>world</strong>!</p>';
      const result = sanitizeUserInput(input, true);
      expect(result).toBe('<p>Hello <strong>world</strong>!</p>');
    });

    it('should handle empty input', () => {
      expect(sanitizeUserInput('')).toBe('');
      expect(sanitizeUserInput(null as any)).toBe('');
      expect(sanitizeUserInput(undefined as any)).toBe('');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string properties in objects', () => {
      const input = {
        name: '<script>alert("xss")</script>John',
        description: '<p>Safe description</p>',
        age: 30
      };
      const result = sanitizeObject(input);
      expect(result.name).toBe('John');
      expect(result.description).toBe('Safe description');
      expect(result.age).toBe(30);
    });

    it('should sanitize nested objects', () => {
      const input = {
        user: {
          name: '<script>alert("xss")</script>John',
          bio: '<p>Safe bio</p>'
        },
        settings: {
          theme: 'dark'
        }
      };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('John');
      expect(result.user.bio).toBe('Safe bio');
      expect(result.settings.theme).toBe('dark');
    });

    it('should sanitize arrays', () => {
      const input = [
        '<script>alert("xss")</script>Item 1',
        '<p>Safe item 2</p>',
        'Item 3'
      ];
      const result = sanitizeObject(input);
      expect(result[0]).toBe('Item 1');
      expect(result[1]).toBe('Safe item 2');
      expect(result[2]).toBe('Item 3');
    });

    it('should handle non-objects', () => {
      expect(sanitizeObject('string')).toBe('string');
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeEmail', () => {
    it('should validate and sanitize valid emails', () => {
      expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
      expect(sanitizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
      expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('should reject invalid email formats', () => {
      expect(sanitizeEmail('invalid-email')).toBe(null);
      expect(sanitizeEmail('user@')).toBe(null);
      expect(sanitizeEmail('@example.com')).toBe(null);
      expect(sanitizeEmail('user.example.com')).toBe(null);
    });

    it('should remove HTML tags from emails', () => {
      expect(sanitizeEmail('<script>alert("xss")</script>user@example.com')).toBe('user@example.com');
    });

    it('should handle edge cases', () => {
      expect(sanitizeEmail('')).toBe(null);
      expect(sanitizeEmail(null as any)).toBe(null);
      expect(sanitizeEmail(undefined as any)).toBe(null);
    });
  });

  describe('sanitizePhone', () => {
    it('should validate and sanitize valid phone numbers', () => {
      expect(sanitizePhone('+1234567890')).toBe('+1234567890');
      expect(sanitizePhone('1234567890')).toBe('+1234567890');
      expect(sanitizePhone('(123) 456-7890')).toBe('+1234567890');
      expect(sanitizePhone('123.456.7890')).toBe('+1234567890');
    });

    it('should reject invalid phone formats', () => {
      expect(sanitizePhone('123456')).toBe(null); // Too short
      expect(sanitizePhone('12345678901234567')).toBe(null); // Too long
      expect(sanitizePhone('abcdefghij')).toBe(null); // Non-numeric
    });

    it('should handle edge cases', () => {
      expect(sanitizePhone('')).toBe(null);
      expect(sanitizePhone(null as any)).toBe(null);
      expect(sanitizePhone(undefined as any)).toBe(null);
    });
  });

  describe('sanitizeUrl', () => {
    it('should validate and sanitize valid URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
      expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
      expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('should reject invalid URL formats', () => {
      expect(sanitizeUrl('not-a-url')).toBe(null);
      expect(sanitizeUrl('ftp://example.com')).toBe(null); // Only http/https allowed
      expect(sanitizeUrl('javascript:alert("xss")')).toBe(null);
    });

    it('should remove HTML tags from URLs', () => {
      expect(sanitizeUrl('<script>alert("xss")</script>https://example.com')).toBe('https://example.com');
    });

    it('should handle edge cases', () => {
      expect(sanitizeUrl('')).toBe(null);
      expect(sanitizeUrl(null as any)).toBe(null);
      expect(sanitizeUrl(undefined as any)).toBe(null);
    });
  });

  describe('XSS Protection', () => {
    it('should prevent script injection', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello world';
      const result = sanitizePlainText(maliciousInput);
      expect(result).toBe('Hello world');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert("xss")');
    });

    it('should prevent event handler injection', () => {
      const maliciousInput = '<img src="x" onerror="alert(\'xss\')" alt="test">';
      const result = sanitizePlainText(maliciousInput);
      expect(result).toBe('');
      expect(result).not.toContain('onerror');
    });

    it('should prevent iframe injection', () => {
      const maliciousInput = '<iframe src="javascript:alert(\'xss\')"></iframe>Hello';
      const result = sanitizePlainText(maliciousInput);
      expect(result).toBe('Hello');
      expect(result).not.toContain('<iframe>');
    });

    it('should prevent object injection', () => {
      const maliciousInput = '<object data="javascript:alert(\'xss\')"></object>Hello';
      const result = sanitizePlainText(maliciousInput);
      expect(result).toBe('Hello');
      expect(result).not.toContain('<object>');
    });
  });

  describe('HTML Sanitization', () => {
    it('should preserve safe HTML structure', () => {
      const safeInput = '<div><h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p><ul><li>Item 1</li><li>Item 2</li></ul></div>';
      const result = sanitizeHtmlContent(safeInput);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
    });

    it('should remove unsafe HTML attributes', () => {
      const unsafeInput = '<a href="javascript:alert(\'xss\')" onclick="alert(\'xss\')" onmouseover="alert(\'xss\')">Click me</a>';
      const result = sanitizeHtmlContent(unsafeInput);
      expect(result).toBe('<a>Click me</a>');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('javascript:');
    });

    it('should allow safe CSS classes', () => {
      const input = '<h1 class="text-xl font-bold">Title</h1>';
      const result = sanitizeHtmlContent(input);
      expect(result).toBe('<h1 class="text-xl font-bold">Title</h1>');
    });
  });
});
