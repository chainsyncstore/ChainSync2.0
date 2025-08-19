// Ambient typings for captcha globals used by the client security utilities

export {};

declare global {
  interface Window {
    grecaptcha?: {
      ready(cb: () => void): void;
      execute(siteKey: string, options?: { action?: string }): Promise<string>;
      render?(container: string | HTMLElement, parameters?: any): any;
    };
    hcaptcha?: {
      execute(config?: Record<string, any>): Promise<string> | string;
      render?(container: string | HTMLElement, parameters?: any): any;
      reset?(id?: string | number): void;
    };
  }
}
