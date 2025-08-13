import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Session management utilities
export const SESSION_STORAGE_KEY = "chainsync_session";
export const CART_STORAGE_KEY = "chainsync_cart";
export const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export function saveSession(user: any) {
  try {
    const expiresAt = Date.now() + SESSION_DURATION;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      user,
      expiresAt
    }));
    return true;
  } catch (error) {
    console.error("Failed to save session:", error);
    return false;
  }
}

export function loadSession() {
  try {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedSession) return null;
    
    const sessionData = JSON.parse(savedSession);
    const now = Date.now();
    
    if (sessionData.expiresAt && now < sessionData.expiresAt) {
      return sessionData.user;
    } else {
      // Session expired, clear it
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  } catch (error) {
    console.error("Failed to load session:", error);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("Failed to clear session:", error);
    return false;
  }
}

export function refreshSession() {
  try {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedSession) return false;
    
    const sessionData = JSON.parse(savedSession);
    const now = Date.now();
    
    if (sessionData.expiresAt && now < sessionData.expiresAt) {
      const newExpiresAt = now + SESSION_DURATION;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        user: sessionData.user,
        expiresAt: newExpiresAt
      }));
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to refresh session:", error);
    return false;
  }
}

// Cart persistence utilities
export function saveCart(cartData: any) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
    return true;
  } catch (error) {
    console.error("Failed to save cart:", error);
    return false;
  }
}

export function loadCart() {
  try {
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (!savedCart) return null;
    
    return JSON.parse(savedCart);
  } catch (error) {
    console.error("Failed to load cart:", error);
    localStorage.removeItem(CART_STORAGE_KEY);
    return null;
  }
}

export function clearCart() {
  try {
    localStorage.removeItem(CART_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("Failed to clear cart:", error);
    return false;
  }
}

/**
 * Debug utility for cookies and CSRF tokens
 */
export const debugCookies = () => {
  try {
    console.log('🍪 Cookie Debug Information:');
    console.log('Document cookies:', document.cookie);
    
    const cookies = document.cookie.split(';');
    console.log('Parsed cookies:', cookies.map(c => c.trim()));
    
    // Check for CSRF token specifically
    const csrfCookie = cookies.find(c => c.trim().startsWith('csrf-token='));
    if (csrfCookie) {
      const [, value] = csrfCookie.split('=');
      console.log('CSRF token found in cookie:', value);
    } else {
      console.log('❌ No CSRF token cookie found');
    }
    
    // Check for other important cookies
    const sessionCookie = cookies.find(c => c.trim().startsWith('chainsync.sid='));
    if (sessionCookie) {
      console.log('✅ Session cookie found');
    } else {
      console.log('❌ No session cookie found');
    }
    
  } catch (error) {
    console.error('Error debugging cookies:', error);
  }
};

/**
 * Test CSRF token functionality
 */
export const testCsrfToken = async () => {
  try {
    console.log('🧪 Testing CSRF token functionality...');
    
    // Step 1: Check current cookies
    debugCookies();
    
    // Step 2: Fetch CSRF token
    console.log('📡 Fetching CSRF token...');
    const response = await fetch('/api/auth/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ CSRF token response:', data);
      
      // Step 3: Check cookies after fetch
      console.log('🍪 Cookies after CSRF fetch:');
      debugCookies();
      
      // Step 4: Test a simple POST request
      console.log('📡 Testing POST request with CSRF token...');
      const testResponse = await fetch('/api/auth/me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': data.csrfToken,
        },
        credentials: 'include',
      });
      
      console.log('📊 Test POST response status:', testResponse.status);
      
      if (testResponse.ok) {
        console.log('✅ CSRF token validation passed');
      } else {
        const errorData = await testResponse.text();
        console.log('❌ CSRF token validation failed:', errorData);
      }
      
    } else {
      console.error('❌ Failed to fetch CSRF token:', response.status);
    }
    
  } catch (error) {
    console.error('❌ CSRF token test failed:', error);
  }
};
