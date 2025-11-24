import axios, { AxiosError } from 'axios';
import { TRUSTED_PAYMENT_PROVIDERS, ValidProvider } from '../lib/constants';
import { PaymentError } from '../lib/errors';

export interface PaymentRequest {
  email: string;
  amount: number; // Changed to number for server-side validation
  currency: string;
  reference: string;
  callback_url?: string;
  metadata?: Record<string, any>;
  // Optional: provider-managed plan identifier to create a subscription on first charge
  providerPlanId?: string;
  channels?: string[];
  paymentOptions?: string;
}

export interface PaymentResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url?: string;
    access_code?: string;
    reference: string;
    link?: string;
  };
}

interface PaymentChargeResult {
  success: boolean;
  reference?: string;
  raw?: any;
  message?: string;
}

interface PaymentRefundResult {
  success: boolean;
  message?: string;
  raw?: any;
}

export interface AutopayDetails {
  autopayReference: string;
  email?: string;
  last4?: string;
  expMonth?: string;
  expYear?: string;
  cardType?: string;
  bank?: string;
  raw?: any;
}

export class PaymentService {
  private paystackSecretKey: string;
  private flutterwaveSecretKey: string;
  private paystackBaseUrl = 'https://api.paystack.co';
  private flutterwaveBaseUrl = 'https://api.flutterwave.com/v3';

  constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    
    // Log the keys for debugging (without exposing full keys)
    console.log('PaymentService initialization:', {
      paystackKeyPresent: !!this.paystackSecretKey,
      flutterwaveKeyPresent: !!this.flutterwaveSecretKey,
      environment: process.env.NODE_ENV,
      baseUrl: process.env.BASE_URL
    });
    
    // In development mode, allow missing keys and use mock services
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: PaymentService initialized with mock support');
      if (!this.paystackSecretKey && !this.flutterwaveSecretKey) {
        console.warn('No payment keys found in development mode - will use mock services');
      }
    } else {
      // In production, require at least one key
      if (!this.paystackSecretKey && !this.flutterwaveSecretKey) {
        throw new Error('At least one payment service key is required. Please set PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY in environment variables.');
      }
    }
  }

  async fetchPaystackTransaction(reference: string): Promise<any> {
    if (!reference) {
      throw new Error('Paystack transaction reference is required');
    }

    if (!this.paystackSecretKey) {
      throw new Error('Paystack secret key is not configured');
    }

    const response = await axios.get(
      `${this.paystackBaseUrl}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );

    return response.data?.data;
  }

  async fetchFlutterwaveTransaction(reference: string): Promise<any> {
    if (!reference) {
      throw new Error('Flutterwave transaction reference is required');
    }

    if (!this.flutterwaveSecretKey) {
      throw new Error('Flutterwave secret key is not configured');
    }

    const response = await axios.get(
      `${this.flutterwaveBaseUrl}/transactions/verify_by_reference`,
      {
        headers: {
          Authorization: `Bearer ${this.flutterwaveSecretKey}`,
        },
        params: {
          tx_ref: reference,
        },
      },
    );

    return response.data?.data;
  }

  async refundPaystackTransaction(
    transaction: string | number,
    amountMinor?: number,
  ): Promise<PaymentRefundResult> {
    if (!this.paystackSecretKey) {
      throw new Error('Paystack secret key is not configured');
    }

    if (!transaction) {
      throw new Error('Paystack refund requires a transaction reference or id');
    }

    try {
      const payload: Record<string, string | number> = {
        transaction,
      };

      if (typeof amountMinor === 'number' && Number.isFinite(amountMinor) && amountMinor > 0) {
        payload.amount = Math.trunc(amountMinor);
      }

      const response = await axios.post(
        `${this.paystackBaseUrl}/refund`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: response.data?.status === true,
        message: response.data?.message,
        raw: response.data,
      } satisfies PaymentRefundResult;
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        message: (axiosError.response?.data as { message?: string } | undefined)?.message || axiosError.message,
        raw: axiosError.response?.data,
      } satisfies PaymentRefundResult;
    }
  }

  async refundFlutterwaveTransaction(
    transactionId: string | number,
    amountMajor?: number,
    currency?: string,
  ): Promise<PaymentRefundResult> {
    if (!this.flutterwaveSecretKey) {
      throw new Error('Flutterwave secret key is not configured');
    }

    if (!transactionId) {
      throw new Error('Flutterwave refund requires a transaction id');
    }

    try {
      const payload: Record<string, string | number> = {};
      if (typeof amountMajor === 'number' && Number.isFinite(amountMajor) && amountMajor > 0) {
        payload.amount = Number(amountMajor.toFixed(2));
      }
      if (currency) {
        payload.currency = currency;
      }

      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/transactions/${transactionId}/refund`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: response.data?.status === 'success',
        message: response.data?.message,
        raw: response.data,
      } satisfies PaymentRefundResult;
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        message: (axiosError.response?.data as { message?: string } | undefined)?.message || axiosError.message,
        raw: axiosError.response?.data,
      } satisfies PaymentRefundResult;
    }
  }

  /**
   * Validates that a payment URL is from a trusted provider domain
   * @param url - The payment URL to validate
   * @param provider - The expected payment provider
   * @returns true if the URL is from a trusted domain, false otherwise
   */
  private validatePaymentUrl(url: string, provider: ValidProvider): boolean {
    try {
      const urlObj = new URL(url);
      const trustedDomains = TRUSTED_PAYMENT_PROVIDERS[provider];
      
      // Check if the hostname matches any of the trusted domains
      const isValidDomain = trustedDomains.some(domain => 
        urlObj.hostname === domain || 
        urlObj.hostname.endsWith(`.${domain}`)
      );

      if (!isValidDomain) {
        console.error(`Payment URL validation failed: ${url} is not from trusted provider ${provider}`);
        console.error(`Expected domains: ${trustedDomains.join(', ')}`);
        console.error(`Actual hostname: ${urlObj.hostname}`);
      }

      return isValidDomain;
    } catch (error) {
      console.error('Invalid URL format during payment URL validation:', error);
      return false;
    }
  }

  /**
   * Safely extracts and validates payment URLs from provider responses
   * @param response - The payment provider response
   * @param provider - The payment provider
   * @returns Validated payment URL or throws error if invalid
   */
  private extractAndValidatePaymentUrl(response: any, provider: ValidProvider): string {
    let paymentUrl: string;

    if (provider === 'paystack') {
      paymentUrl = response.data?.authorization_url;
    } else if (provider === 'flutterwave') {
      paymentUrl = response.data?.link;
    } else {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }

    if (!paymentUrl) {
      throw new Error(`No payment URL received from ${provider}`);
    }

    // Validate the payment URL is from a trusted domain
    if (!this.validatePaymentUrl(paymentUrl, provider)) {
      throw new Error(`Payment URL validation failed for ${provider}: ${paymentUrl}`);
    }

    return paymentUrl;
  }

  async initializePaystackPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`Initializing Paystack payment with callback URL: ${request.callback_url}`);
      
      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: request.email,
          amount: request.amount,
          currency: request.currency,
          reference: request.reference,
          callback_url: request.callback_url || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/callback`,
          metadata: request.metadata,
          // If provided, attach Paystack plan code (creates/associates subscription on success)
          plan: request.providerPlanId,
          channels: request.channels,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Paystack payment initialized successfully:', response.data);
      
      // Validate the payment URL before returning
      const validatedUrl = this.extractAndValidatePaymentUrl(response.data, 'paystack');
      
      return {
        ...response.data,
        data: {
          ...response.data.data,
          authorization_url: validatedUrl // Use validated URL
        }
      };
    } catch (error) {
      console.error('Paystack payment initialization error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Paystack API response:', error.response?.data);
      }
      throw new Error('Failed to initialize Paystack payment');
    }
  }

  async initializeFlutterwavePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`Initializing Flutterwave payment with callback URL: ${request.callback_url}`);
      
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/payments`,
        {
          tx_ref: request.reference,
          amount: request.amount,
          currency: request.currency,
          redirect_url: request.callback_url || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/callback`,
          customer: {
            email: request.email
          },
          meta: request.metadata,
          // Flutterwave: payment plans are specified with payment_plan
          payment_plan: request.providerPlanId,
          payment_options: request.paymentOptions,
          customizations: {
            title: 'ChainSync Subscription',
            description: 'Complete your subscription payment',
            logo: 'https://chainsync.com/logo.png'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.flutterwaveSecretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Flutterwave payment initialized successfully:', response.data);
      
      // Validate the payment URL before returning
      const validatedUrl = this.extractAndValidatePaymentUrl(response.data, 'flutterwave');
      
      return {
        status: response.data.status === 'success',
        message: response.data.message,
        data: {
          link: validatedUrl, // Use validated URL
          reference: request.reference
        }
      };
    } catch (error) {
      console.error('Flutterwave payment initialization error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Flutterwave API response:', error.response?.data);
      }
      throw new Error('Failed to initialize Flutterwave payment');
    }
  }

  async verifyPaystackPayment(reference: string, maxRetries: number = 3): Promise<boolean> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Paystack verification attempt ${attempt}/${maxRetries} for reference: ${reference}`);
        
        const response = await axios.get(
          `${this.paystackBaseUrl}/transaction/verify/${reference}`,
          {
            headers: {
              'Authorization': `Bearer ${this.paystackSecretKey}`
            },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.data.data.status === 'success') {
          console.log(`Paystack verification successful on attempt ${attempt}`);
          return true;
        } else {
          console.log(`Paystack verification failed - status: ${response.data.data.status}`);
          return false;
        }
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        
        console.error(`Paystack verification attempt ${attempt} failed:`, {
          status: axiosError.response?.status,
          message: axiosError.message,
          reference
        });

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500 && axiosError.response.status !== 429) {
          console.log('Client error detected, not retrying');
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`Paystack verification failed after ${maxRetries} attempts for reference: ${reference}`);
    throw new PaymentError(
      `Payment verification failed after ${maxRetries} attempts`,
      { reference, lastError: lastError?.message }
    );
  }

  async verifyFlutterwavePayment(reference: string, maxRetries: number = 3): Promise<boolean> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Flutterwave verification attempt ${attempt}/${maxRetries} for reference: ${reference}`);
        
        // Flutterwave verification endpoint expects the transaction reference
        const response = await axios.get(
          `${this.flutterwaveBaseUrl}/transactions/verify_by_reference?tx_ref=${reference}`,
          {
            headers: {
              'Authorization': `Bearer ${this.flutterwaveSecretKey}`
            },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.data.data.status === 'successful') {
          console.log(`Flutterwave verification successful on attempt ${attempt}`);
          return true;
        } else {
          console.log(`Flutterwave verification failed - status: ${response.data.data.status}`);
          return false;
        }
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        
        console.error(`Flutterwave verification attempt ${attempt} failed:`, {
          status: axiosError.response?.status,
          message: axiosError.message,
          reference
        });

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500 && axiosError.response.status !== 429) {
          console.log('Client error detected, not retrying');
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`Flutterwave verification failed after ${maxRetries} attempts for reference: ${reference}`);
    throw new PaymentError(
      `Payment verification failed after ${maxRetries} attempts`,
      { reference, lastError: lastError?.message }
    );
  }

  generateReference(provider: 'paystack' | 'flutterwave'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${provider.toUpperCase()}_${timestamp}_${random}`;
  }

  async getAutopayDetails(provider: 'PAYSTACK' | 'FLW', reference: string): Promise<AutopayDetails | null> {
    const normalized = provider.toUpperCase() as 'PAYSTACK' | 'FLW';
    const trimmedRef = reference?.trim();
    if (!trimmedRef) {
      return null;
    }

    if (normalized === 'PAYSTACK') {
      if (!this.paystackSecretKey) {
        return { autopayReference: trimmedRef };
      }

      try {
        const response = await axios.get(
          `${this.paystackBaseUrl}/transaction/verify/${trimmedRef}`,
          {
            headers: {
              Authorization: `Bearer ${this.paystackSecretKey}`,
            },
          },
        );

        const data = response.data?.data;
        const authorization = data?.authorization;
        const authorizationCode = authorization?.authorization_code;
        if (!authorizationCode) {
          return null;
        }

        return {
          autopayReference: authorizationCode,
          email: data?.customer?.email,
          last4: authorization?.last4,
          expMonth: authorization?.exp_month ? String(authorization.exp_month) : undefined,
          expYear: authorization?.exp_year ? String(authorization.exp_year) : undefined,
          cardType: authorization?.card_type || authorization?.brand,
          bank: authorization?.bank,
          raw: data,
        } satisfies AutopayDetails;
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error('Failed to fetch Paystack autopay details', {
          reference: trimmedRef,
          status: axiosError.response?.status,
          message: axiosError.message,
        });
        throw new PaymentError('Failed to fetch Paystack autopay details', {
          provider: 'PAYSTACK',
          reference: trimmedRef,
          status: axiosError.response?.status,
        });
      }
    }

    if (!this.flutterwaveSecretKey) {
      return { autopayReference: trimmedRef };
    }

    try {
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/transactions/verify_by_reference`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
          params: { tx_ref: trimmedRef },
        },
      );

      const data = response.data?.data;
      const card = data?.card || data?.source?.card;
      const token = card?.token || data?.card_token || data?.meta?.authorization?.token;
      if (!token) {
        return null;
      }

      let expMonth: string | undefined;
      let expYear: string | undefined;
      const expiryCandidate = card?.expiry || card?.expiry_date || data?.card?.expiry;
      if (typeof expiryCandidate === 'string' && expiryCandidate.includes('/')) {
        const [month, year] = expiryCandidate.split('/');
        expMonth = month?.trim() || undefined;
        expYear = year?.trim() || undefined;
      } else {
        expMonth = card?.expirymonth || data?.card?.expirymonth;
        expYear = card?.expiryyear || data?.card?.expiryyear;
      }

      return {
        autopayReference: token,
        email: data?.customer?.email || data?.customer?.email_address,
        last4: card?.last_4digits || card?.last4 || data?.card?.last_4digits,
        cardType: card?.type,
        expMonth,
        expYear,
        bank: card?.issuer || data?.card?.issuer,
        raw: data,
      } satisfies AutopayDetails;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Failed to fetch Flutterwave autopay details', {
        reference: trimmedRef,
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      throw new PaymentError('Failed to fetch Flutterwave autopay details', {
        provider: 'FLW',
        reference: trimmedRef,
        status: axiosError.response?.status,
      });
    }
  }

  async chargePaystackAuthorization(
    authorizationCode: string,
    email: string,
    amountMinor: number,
    currency: string,
    reference?: string,
    metadata?: Record<string, any>
  ): Promise<PaymentChargeResult> {
    try {
      const payload: Record<string, any> = {
        authorization_code: authorizationCode,
        email,
        amount: amountMinor,
        currency,
        metadata,
      };
      if (reference) {
        payload.reference = reference;
      }

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/charge_authorization`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data?.data;
      const status = data?.status === 'success';
      return {
        success: status,
        reference: data?.reference || data?.id || reference,
        raw: response.data,
        message: data?.gateway_response,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as { message?: string } | undefined;
      return {
        success: false,
        reference,
        raw: axiosError.response?.data,
        message: responseData?.message || axiosError.message,
      };
    }
  }

  async chargeFlutterwaveToken(
    token: string,
    email: string,
    amountMajor: number,
    currency: string,
    reference?: string,
    metadata?: Record<string, any>
  ): Promise<PaymentChargeResult> {
    try {
      const txRef = reference || this.generateReference('flutterwave');
      const payload: Record<string, any> = {
        token,
        email,
        amount: amountMajor,
        currency,
        tx_ref: txRef,
        meta: metadata,
      };

      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/tokenized-charges`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data?.data;
      const status = data?.status === 'successful';
      return {
        success: status,
        reference: data?.flw_ref || data?.id || txRef,
        raw: response.data,
        message: response.data?.message,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as { message?: string } | undefined;
      return {
        success: false,
        reference,
        raw: axiosError.response?.data,
        message: responseData?.message || axiosError.message,
      };
    }
  }

  // Mock payment methods for development/testing
  async mockPaystackPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const mockUrl = `https://checkout.paystack.com/${Math.random().toString(36).substring(2, 15)}`;
    
    // Validate mock URL (should always pass for trusted domains)
    if (!this.validatePaymentUrl(mockUrl, 'paystack')) {
      throw new Error('Mock Paystack URL validation failed');
    }
    
    return {
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: mockUrl,
        access_code: Math.random().toString(36).substring(2, 15),
        reference: request.reference
      }
    };
  }

  async mockFlutterwavePayment(request: PaymentRequest): Promise<PaymentResponse> {
    const mockUrl = `https://checkout.flutterwave.com/v3/hosted/pay/${Math.random().toString(36).substring(2, 15)}`;
    
    // Validate mock URL (should always pass for trusted domains)
    if (!this.validatePaymentUrl(mockUrl, 'flutterwave')) {
      throw new Error('Mock Flutterwave URL validation failed');
    }
    
    return {
      status: true,
      message: "Payment link generated",
      data: {
        link: mockUrl,
        reference: request.reference
      }
    };
  }
}