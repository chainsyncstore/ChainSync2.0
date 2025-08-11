// Service Worker Registration Utility
// Handles service worker registration with proper error handling and development fallbacks

export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;
  private isDevelopment = process.env.NODE_ENV === 'development' || 
                          typeof window !== 'undefined' && (
                            window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' || 
                            window.location.hostname.includes('replit')
                          );

  private constructor() {}

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  async register(): Promise<void> {
    // Skip service worker in development mode to avoid conflicts
    if (this.isDevelopment) {
      console.log('Service Worker disabled in development mode');
      
      // Unregister any existing service workers in development
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('Unregistered service worker in development mode');
        }
      } catch (error) {
        console.log('No service workers to unregister');
      }
      return;
    }

    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported in this browser');
      return;
    }

    try {
      // Unregister any existing service workers first
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('Unregistered old service worker');
      }

      // Register new service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });

      console.log('Service Worker registered successfully:', this.registration);

      // Handle service worker updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available');
              this.showUpdateNotification();
            }
          });
        }
      });

      // Handle service worker messages
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('Service Worker message received:', event.data);
      });

      // Handle service worker errors
      navigator.serviceWorker.addEventListener('error', (event) => {
        console.error('Service Worker error:', event.error);
      });

    } catch (error) {
      console.error('Service Worker registration failed:', error);
      
      // Fallback: disable service worker functionality
      this.disableServiceWorker();
    }
  }

  private showUpdateNotification(): void {
    // Show a notification to the user that an update is available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ChainSync Update Available', {
        body: 'A new version is available. Please refresh the page.',
        icon: '/icon-192x192.png',
        tag: 'update-notification'
      });
    }
  }

  private disableServiceWorker(): void {
    // Remove service worker event listeners and disable functionality
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'DISABLE'
      });
    }
  }

  async unregister(): Promise<void> {
    if (this.registration) {
      await this.registration.unregister();
      this.registration = null;
      console.log('Service Worker unregistered');
    }
  }

  isRegistered(): boolean {
    return this.registration !== null;
  }

  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }
}

// Export singleton instance
export const serviceWorkerManager = ServiceWorkerManager.getInstance();
