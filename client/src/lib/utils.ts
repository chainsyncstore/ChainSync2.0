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
