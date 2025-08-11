import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { apiClient, handleApiError } from "@/lib/api-client";

export default function PaymentCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState<string>('');

  useEffect(() => {
    const handlePaymentCallback = async () => {
      try {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const reference = urlParams.get('reference');
        const trxref = urlParams.get('trxref'); // Paystack
        const trx_ref = urlParams.get('trx_ref'); // Flutterwave
        const status = urlParams.get('status');
        
        // Log all URL parameters for debugging
        console.log('Payment callback URL parameters:', {
          reference,
          trxref,
          trx_ref,
          status,
          fullUrl: window.location.href,
          searchParams: window.location.search
        });
        
        // Paystack uses 'reference' and 'trxref', Flutterwave uses 'trx_ref'
        const paymentReference = reference || trxref || trx_ref;
        
        if (!paymentReference) {
          console.error('No payment reference found in URL parameters');
          setStatus('error');
          setMessage('Payment reference not found');
          setErrorDetails('No payment reference found in URL parameters. Please check the payment link.');
          return;
        }

        console.log('Processing payment callback with reference:', paymentReference);

        // Verify payment with backend
        const data = await apiClient.post<{ success: boolean; message?: string }>('/payment/verify', {
          reference: paymentReference,
          status: status
        });

        console.log('Payment verification response:', data);

        if (data.success) {
          setStatus('success');
          setMessage('Payment successful! Your subscription is now active.');
          
          // Redirect to analytics page after 3 seconds (default admin view)
          setTimeout(() => {
            console.log('Redirecting to analytics page...');
            setLocation('/analytics');
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Payment verification failed. Please contact support.');
          setErrorDetails(`Payment verification returned: ${JSON.stringify(data)}`);
        }
      } catch (error) {
        console.error('Payment callback error:', error);
        
        // Handle different types of errors
        let errorMessage = 'An error occurred while processing your payment.';
        let details = '';
        
        if (error instanceof Error) {
          errorMessage = error.message;
          details = error.stack || '';
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = (error as any).message || 'Unknown error occurred';
          details = JSON.stringify(error);
        }
        
        setStatus('error');
        setMessage(errorMessage);
        setErrorDetails(details);
        
        // Try to handle API errors
        try {
          handleApiError(error);
        } catch (handleError) {
          console.error('Error handling API error:', handleError);
        }
      }
    };

    // Add a small delay to ensure the component is fully mounted
    const timer = setTimeout(handlePaymentCallback, 100);
    
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'loading' && (
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          )}
          {status === 'error' && (
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          )}
          
          <CardTitle className="text-2xl font-bold">
            {status === 'loading' && 'Processing Payment...'}
            {status === 'success' && 'Payment Successful!'}
            {status === 'error' && 'Payment Failed'}
          </CardTitle>
          
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your payment...'}
            {status === 'success' && 'Your subscription has been activated successfully.'}
            {status === 'error' && 'There was an issue with your payment.'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-center text-gray-600">
            {message}
          </p>
          
          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">What's Next?</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Your 2-week free trial is now active</li>
                <li>• You can access all features immediately</li>
                <li>• We'll notify you before your trial ends</li>
              </ul>
            </div>
          )}
          
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Need Help?</h4>
              <p className="text-sm text-red-700">
                If you believe this is an error, please contact our support team with your payment reference.
              </p>
              {errorDetails && (
                <details className="mt-3">
                  <summary className="text-sm text-red-600 cursor-pointer hover:text-red-700">
                    Technical Details
                  </summary>
                  <pre className="text-xs text-red-600 mt-2 whitespace-pre-wrap break-words bg-red-100 p-2 rounded">
                    {errorDetails}
                  </pre>
                </details>
              )}
            </div>
          )}
          
          <div className="flex flex-col space-y-2">
            {status === 'success' && (
              <Button 
                onClick={() => setLocation('/analytics')}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            )}
            
            {status === 'error' && (
              <>
                <Button 
                  onClick={() => setLocation('/signup')}
                  className="w-full"
                >
                  Try Again
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setLocation('/')}
                  className="w-full"
                >
                  Back to Home
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 