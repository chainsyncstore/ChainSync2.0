import sanitizeHtml from 'sanitize-html';
import xss from 'xss';

// HTML sanitization options
const htmlSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'title'],
    'h1': ['class'],
    'h2': ['class'],
    'h3': ['class'],
    'h4': ['class'],
    'h5': ['class'],
    'h6': ['class']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedClasses: {
    'h1': ['text-*', 'font-*'],
    'h2': ['text-*', 'font-*'],
    'h3': ['text-*', 'font-*'],
    'h4': ['text-*', 'font-*'],
    'h5': ['text-*', 'font-*'],
    'h6': ['text-*', 'font-*']
  },
  // Remove dangerous attributes and content
  transformTags: {
    'a': (tagName: string, attribs: any) => {
      // Remove dangerous attributes
      delete attribs.onclick;
      delete attribs.onmouseover;
      delete attribs.onerror;
      delete attribs.onload;
      
      // Check for dangerous href values
      if (attribs.href && (attribs.href.startsWith('javascript:') || attribs.href.startsWith('data:'))) {
        delete attribs.href;
      }
      
      return { tagName, attribs };
    }
  },
  // Allow javascript: URLs but sanitize them
  allowedSchemesByTag: {
    'a': ['http', 'https', 'mailto', 'javascript']
  }
};

// XSS sanitization options
const xssOptions = {
  whiteList: {
    // Allow basic HTML tags
    a: ['href', 'title', 'target'],
    b: [],
    i: [],
    em: [],
    strong: [],
    p: [],
    br: [],
    ul: [],
    ol: [],
    li: [],
    h1: ['class'],
    h2: ['class'],
    h3: ['class'],
    h4: ['class'],
    h5: ['class'],
    h6: ['class']
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed']
};

/**
 * Sanitize HTML content using sanitize-html
 * @param html - The HTML content to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return sanitizeHtml(html, htmlSanitizeOptions);
}

/**
 * Sanitize text content using XSS protection
 * @param text - The text content to sanitize
 * @returns Sanitized text string
 */
export function sanitizeTextContent(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return xss(text, xssOptions);
}

/**
 * Sanitize plain text (remove HTML tags and XSS)
 * @param text - The text content to sanitize
 * @returns Sanitized plain text string
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // First remove script tags and their content completely
  let cleanText = text.replace(/<script[^>]*>.*?<\/script>/gis, '');
  
  // Remove other dangerous tags and their content
  cleanText = cleanText.replace(/<(iframe|object|embed|form|input|textarea|select|button)[^>]*>.*?<\/\1>/gis, '');
  
  // Remove remaining HTML tags
  cleanText = cleanText.replace(/<[^>]*>/g, '');
  
  // Then apply XSS protection
  return xss(cleanText, { whiteList: {}, stripIgnoreTag: true });
}

/**
 * Sanitize user input for display
 * @param input - The user input to sanitize
 * @param allowHtml - Whether to allow HTML (default: false)
 * @returns Sanitized string
 */
export function sanitizeUserInput(input: string, allowHtml: boolean = false): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  if (allowHtml) {
    return sanitizeHtmlContent(input);
  } else {
    return sanitizePlainText(input);
  }
}

/**
 * Sanitize object properties recursively
 * @param obj - The object to sanitize
 * @param allowHtml - Whether to allow HTML in string properties
 * @returns Sanitized object
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T, allowHtml: boolean = false): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const sanitized: any = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeUserInput(value, allowHtml);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, allowHtml);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize email address (basic validation and sanitization)
 * @param email - The email address to sanitize
 * @returns Sanitized email string or null if invalid
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  // Remove any HTML or script tags first
  const cleanEmail = email.replace(/<script[^>]*>.*?<\/script>/gis, '').replace(/<[^>]*>/g, '');
  
  // Trim whitespace
  const trimmed = cleanEmail.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }
  
  return trimmed;
}

/**
 * Sanitize phone number (E.164 format)
 * @param phone - The phone number to sanitize
 * @returns Sanitized phone string or null if invalid
 */
export function sanitizePhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Validate E.164 format (7-16 digits, optionally starting with +)
  const phoneRegex = /^\+?[1-9]\d{6,15}$/;
  if (!phoneRegex.test(cleaned)) {
    return null;
  }
  
  // Ensure it starts with + for international format
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * Sanitize URL (basic validation and sanitization)
 * @param url - The URL to sanitize
 * @returns Sanitized URL string or null if invalid
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // Remove any HTML or script tags first
  const cleanUrl = url.replace(/<script[^>]*>.*?<\/script>/gis, '').replace(/<[^>]*>/g, '');
  
  // Trim whitespace
  const trimmed = cleanUrl.trim();
  
  try {
    // Validate URL format
    const urlObj = new URL(trimmed);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    
    return trimmed;
  } catch {
    return null;
  }
}
