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

  private async ensureCsrfToken(): Promise<string> {
    if (!this.csrfToken) {
      try {
        const response = await fetch(`${this.baseURL}/auth/csrf-token`, {
          method: 'GET',
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          this.csrfToken = data.csrfToken;
        } else {
          console.warn('Failed to fetch CSRF token');
          this.csrfToken = '';
        }
      } catch (error) {
        console.warn('Error fetching CSRF token:', error);
        this.csrfToken = '';
      }
    }
    return this.csrfToken || '';
  }

  /**
   * Get CSRF token from secure cookie (set by server)
   */
  private getCsrfTokenFromCookie(): string | null {
    // The server sets the CSRF token in a secure httpOnly cookie
    // We need to fetch it from the server endpoint
    return null; // Will be fetched via ensureCsrfToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    // Always get CSRF token for non-GET requests to ensure security
    let csrfToken = '';
    if (options.method && options.method !== 'GET') {
      csrfToken = await this.ensureCsrfToken();
      
      // If CSRF token fetch fails, throw an error for security
      if (!csrfToken) {
        throw new Error('CSRF token is required for this request but could not be obtained');
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
      const response = await fetch(url, config);
      const data: ApiResponse<T> = await response.json();

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