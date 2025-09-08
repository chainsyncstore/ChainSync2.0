// Global type declarations for external libraries

declare global {
  interface Window {
    __TESTRUN__?: boolean;
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
    hcaptcha: {
      execute: (options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
        'error-callback': () => void;
      }) => void;
    };
  }
}

export {};
