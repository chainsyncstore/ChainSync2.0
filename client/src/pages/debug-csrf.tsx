import React, { useState } from 'react';
import { debugCookies, testCsrfToken } from '@/lib/utils';

export default function DebugCsrfPage() {
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDebugCookies = () => {
    debugCookies();
    setDebugInfo('Cookie debug completed. Check console for details.');
  };

  const handleTestCsrf = async () => {
    setIsLoading(true);
    setDebugInfo('Testing CSRF token... Check console for details.');
    
    try {
      await testCsrfToken();
      setDebugInfo('CSRF test completed. Check console for details.');
    } catch (error) {
      setDebugInfo(`CSRF test failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">CSRF Token & Cookie Debug</h1>
      
      <div className="space-y-6">
        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Debug Tools</h2>
          <div className="flex gap-4">
            <button 
              onClick={handleDebugCookies}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Debug Cookies
            </button>
            <button 
              onClick={handleTestCsrf}
              disabled={isLoading}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              Test CSRF Token
            </button>
          </div>
          
          {debugInfo && (
            <div className="mt-4 p-4 bg-gray-100 rounded">
              <p>{debugInfo}</p>
            </div>
          )}
        </div>

        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Current Cookie Status</h2>
          <div className="space-y-2">
            <div>
              <strong>Document Cookies:</strong>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                {document.cookie || 'No cookies found'}
              </pre>
            </div>
            
            <div>
              <strong>CSRF Token Cookie:</strong>
              <div className="mt-2">
                {(() => {
                  const cookies = document.cookie.split(';');
                  const csrfCookie = cookies.find(c => c.trim().startsWith('csrf-token='));
                  if (csrfCookie) {
                    const [, value] = csrfCookie.split('=');
                    return (
                      <span className="text-green-600 font-mono text-sm">
                        ✅ Found: {value.substring(0, 8)}...
                      </span>
                    );
                  } else {
                    return <span className="text-red-600">❌ Not found</span>;
                  }
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
