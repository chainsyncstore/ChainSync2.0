import { toast } from '@/hooks/use-toast';

export interface ApiError {
  status: 'error';
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
  path?: string;
}

export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  code?: string;
  details?: any;
  timestamp: string;
  path?: string;
}

class ApiClient {
  private baseURL: string;
  private csrfToken: string | null = null;

  constructor() {
    this.baseURL = '/api';
  }

  /**
   * Get CSRF token from cookie if available, otherwise fetch from server
   */
  private getCsrfTokenFromCookie(): string | null {
    try {
      // Check if we can access the cookie (it should be httpOnly: false for CSRF)
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf-token' && value) {
          return value;
        }
      }
    } catch (error) {
      console.warn('Error reading CSRF cookie:', error);
    }
    return null;
  }

  private async ensureCsrfToken(): Promise<string> {
    // First try to get from cookie
    let token = this.getCsrfTokenFromCookie();
    
    if (!token) {
      try {
        console.log('Fetching CSRF token from server...');
        const response = await fetch(`${this.baseURL}/auth/csrf-token`, {
          method: 'GET',
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          token = data.csrfToken;
          
          // Verify the cookie was set
          const cookieToken = this.getCsrfTokenFromCookie();
          if (cookieToken && cookieToken === token) {
            console.log('CSRF token and cookie set successfully');
            this.csrfToken = token;
          } else {
            console.warn('CSRF token received but cookie not properly set');
            // Still use the token from response for this request
          }
        } else {
          console.error('Failed to fetch CSRF token:', response.status, response.statusText);
          throw new Error(`Failed to fetch CSRF token: ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching CSRF token:', error);
        throw new Error('CSRF token is required but could not be obtained');
      }
    } else {
      console.log('Using CSRF token from cookie');
      this.csrfToken = token;
    }
    
    if (!token) {
      throw new Error('CSRF token is required but could not be obtained');
    }
    
    return token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    // Always get CSRF token for non-GET requests to ensure security
    let csrfToken = '';
    if (options.method && options.method !== 'GET') {
      try {
        csrfToken = await this.ensureCsrfToken();
      } catch (error) {
        console.error('CSRF token error:', error);
        throw error;
      }
    }
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        ...options.headers,
      },
      credentials: 'include', // Include cookies for session management
    };

    const config = { ...defaultOptions, ...options };

    try {
      console.log('Making request:', {
        url,
        method: config.method,
        hasCsrfToken: !!csrfToken,
        credentials: config.credentials
      });

      const response = await fetch(url, config);
      
      // Log response details for debugging
      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      let data: ApiResponse<T>;
      try {
        data = await response.json();
      } catch (e) {
        // Handle cases where server returned empty body or non-JSON (e.g., proxies, 4xx/5xx without JSON)
        data = { status: response.ok ? 'success' : 'error', timestamp: new Date().toISOString() } as ApiResponse<T>;
      }

      if (!response.ok) {
        // Handle API errors
        const error: ApiError = {
          status: 'error',
          message: data.message || `HTTP ${response.status}: ${response.statusText}`,
          code: data.code || `HTTP_${response.status}`,
          details: data.details,
          timestamp: data.timestamp,
          path: data.path
        };

        this.handleApiError(error);
        throw error;
      }

      // Handle successful responses
      if (data.status === 'success' && data.data !== undefined) {
        return data.data;
      }

      // Handle legacy responses (without standardized format)
      if (data.status === undefined) {
        return data as T;
      }

      // Handle responses with data directly (like signup responses)
      if (data.user || data.message) {
        return data as T;
      }

      throw new Error('Invalid response format');
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        // This is an API error we already handled
        throw error;
      }

      // Handle network errors
      const networkError: ApiError = {
        status: 'error',
        message: 'Network error. Please check your connection and try again.',
        code: 'NETWORK_ERROR',
        timestamp: new Date().toISOString(),
        path: endpoint
      };

      this.handleApiError(networkError);
      throw networkError;
    }
  }

  private handleApiError(error: ApiError): void {
    console.error('API Error:', error);

    // Show user-friendly error message
    let userMessage = error.message;

    // Customize messages based on error codes
    switch (error.code) {
      case 'UNAUTHORIZED':
        userMessage = 'Please log in to continue.';
        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        break;
      case 'FORBIDDEN':
        userMessage = 'You don\'t have permission to perform this action.';
        break;
      case 'NOT_FOUND':
        userMessage = 'The requested resource was not found.';
        break;
      case 'VALIDATION_ERROR':
        if (Array.isArray(error.details) && error.details.length > 0) {
          const passwordErrors = error.details
            .filter((d: any) => d.field === 'password' && typeof d.message === 'string')
            .map((d: any) => d.message);
          if (passwordErrors.length > 0) {
            userMessage = `Password requirements: ${passwordErrors.join('; ')}`;
            break;
          }
        }
        userMessage = 'Please check your input and try again.';
        break;
      case 'DUPLICATE_EMAIL':
        userMessage = 'Email is already registered, please check details and try again.';
        break;
      case 'RATE_LIMIT_EXCEEDED':
        userMessage = 'Too many requests. Please wait a moment and try again.';
        break;
      case 'PAYMENT_ERROR':
        userMessage = 'Payment processing failed. Please try again or contact support.';
        break;
      case 'NETWORK_ERROR':
        userMessage = 'Connection failed. Please check your internet connection and try again.';
        break;
      case 'SERVER_ERROR':
        userMessage = 'Server error. Please try again later.';
        break;
      default:
        if (error.code?.startsWith('HTTP_5')) {
          userMessage = 'Server error. Please try again later.';
        } else if (error.code?.startsWith('HTTP_4')) {
          userMessage = 'Request error. Please check your input and try again.';
        }
    }

    // Show toast notification
    toast({
      title: 'Error',
      description: userMessage,
      variant: 'destructive',
    });
  }

  // GET request
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = params 
      ? `${endpoint}?${new URLSearchParams(params).toString()}`
      : endpoint;
    
    return this.request<T>(url, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Upload file
  async upload<T>(endpoint: string, file: File, additionalData?: Record<string, any>): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    return this.request<T>(endpoint, {
      method: 'POST',
      headers: {}, // Let browser set Content-Type for FormData
      body: formData,
    });
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export individual methods for convenience
export const { get, post, put, patch, delete: del, upload } = apiClient;

// Utility function to handle API errors in components
export function handleApiError(error: unknown): void {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as ApiError;
    console.error('API Error in component:', apiError);
    
    toast({
      title: 'Error',
      description: apiError.message,
      variant: 'destructive',
    });
  } else {
    console.error('Unknown error:', error);
    toast({
      title: 'Error',
      description: 'An unexpected error occurred.',
      variant: 'destructive',
    });
  }
} 