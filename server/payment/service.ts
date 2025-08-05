import axios from 'axios';

export interface PaymentRequest {
  email: string;
  amount: string;
  currency: string;
  reference: string;
  callback_url?: string;
  metadata?: Record<string, any>;
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

export class PaymentService {
  private paystackSecretKey: string;
  private flutterwaveSecretKey: string;
  private paystackBaseUrl = 'https://api.paystack.co';
  private flutterwaveBaseUrl = 'https://api.flutterwave.com/v3';

  constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_...';
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-...';
  }

  async initializePaystackPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: request.email,
          amount: request.amount,
          currency: request.currency,
          reference: request.reference,
          callback_url: request.callback_url || `${process.env.BASE_URL}/payment/callback`,
          metadata: request.metadata
        },
        {
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Paystack payment initialization error:', error);
      throw new Error('Failed to initialize Paystack payment');
    }
  }

  async initializeFlutterwavePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/payments`,
        {
          tx_ref: request.reference,
          amount: request.amount,
          currency: request.currency,
          redirect_url: request.callback_url || `${process.env.BASE_URL}/payment/callback`,
          customer: {
            email: request.email
          },
          meta: request.metadata,
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

      return {
        status: response.data.status === 'success',
        message: response.data.message,
        data: {
          link: response.data.data.link,
          reference: request.reference
        }
      };
    } catch (error) {
      console.error('Flutterwave payment initialization error:', error);
      throw new Error('Failed to initialize Flutterwave payment');
    }
  }

  async verifyPaystackPayment(reference: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.paystackSecretKey}`
          }
        }
      );

      return response.data.data.status === 'success';
    } catch (error) {
      console.error('Paystack payment verification error:', error);
      return false;
    }
  }

  async verifyFlutterwavePayment(transactionId: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            'Authorization': `Bearer ${this.flutterwaveSecretKey}`
          }
        }
      );

      return response.data.data.status === 'successful';
    } catch (error) {
      console.error('Flutterwave payment verification error:', error);
      return false;
    }
  }

  generateReference(provider: 'paystack' | 'flutterwave'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${provider.toUpperCase()}_${timestamp}_${random}`;
  }

  // Mock payment methods for development/testing
  async mockPaystackPayment(request: PaymentRequest): Promise<PaymentResponse> {
    return {
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: `https://checkout.paystack.com/${Math.random().toString(36).substring(2, 15)}`,
        access_code: Math.random().toString(36).substring(2, 15),
        reference: request.reference
      }
    };
  }

  async mockFlutterwavePayment(request: PaymentRequest): Promise<PaymentResponse> {
    return {
      status: true,
      message: "Payment link generated",
      data: {
        link: `https://checkout.flutterwave.com/v3/hosted/pay/${Math.random().toString(36).substring(2, 15)}`,
        reference: request.reference
      }
    };
  }
} 