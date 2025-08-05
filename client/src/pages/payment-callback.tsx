import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function PaymentCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handlePaymentCallback = async () => {
      try {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const reference = urlParams.get('reference');
        const trx_ref = urlParams.get('trx_ref'); // Flutterwave
        const status = urlParams.get('status');
        
        const paymentReference = reference || trx_ref;
        
        if (!paymentReference) {
          setStatus('error');
          setMessage('Payment reference not found');
          return;
        }

        // Verify payment with backend
        const response = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reference: paymentReference,
            status: status
          }),
        });

        if (response.ok) {
          setStatus('success');
          setMessage('Payment successful! Your subscription is now active.');
          
          // Redirect to dashboard after 3 seconds
          setTimeout(() => {
            setLocation('/dashboard');
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Payment verification failed. Please contact support.');
        }
      } catch (error) {
        console.error('Payment callback error:', error);
        setStatus('error');
        setMessage('An error occurred while processing your payment.');
      }
    };

    handlePaymentCallback();
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
            </div>
          )}
          
          <div className="flex flex-col space-y-2">
            {status === 'success' && (
              <Button 
                onClick={() => setLocation('/dashboard')}
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