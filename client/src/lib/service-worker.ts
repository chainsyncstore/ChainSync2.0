// Service Worker Registration Utility
// Handles service worker registration with proper error handling and development fallbacks

export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;
  private isDevelopment = process.env.NODE_ENV === 'development' || 
                          typeof window !== 'undefined' && (
                            window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' || 
                            window.location.hostname.includes('replit') ||
                            window.location.hostname.includes('dev') ||
                            window.location.port === '3000' ||
                            window.location.port === '5173' ||
                            window.location.port === '8080'
                          );

  private constructor() {}

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  // Manual cleanup function for development
  async forceCleanup(): Promise<void> {
    console.log('🔄 Force cleaning up service workers...');
    
    try {
      if ('serviceWorker' in navigator) {
        // Get all registrations
        const registrations = await navigator.serviceWorker.getRegistrations();
        console.log(`Found ${registrations.length} service worker registrations`);
        
        // Unregister all
        for (const registration of registrations) {
          console.log('Unregistering:', registration.scope);
          await registration.unregister();
        }
        
        // Clear all caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          console.log(`Found ${cacheNames.length} caches`);
          
          for (const cacheName of cacheNames) {
            console.log('Deleting cache:', cacheName);
            await caches.delete(cacheName);
          }
        }
        
        console.log('✅ Service worker cleanup completed');
      }
    } catch (error) {
      console.error('❌ Service worker cleanup failed:', error);
    }
  }

  async register(): Promise<void> {
    // Skip service worker in development mode to avoid conflicts
    if (this.isDevelopment) {
      console.log('Service Worker disabled in development mode');
      
      // Force unregister any existing service workers in development
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          console.log(`Found ${registrations.length} existing service worker registrations`);
          
          for (const registration of registrations) {
            console.log('Unregistering service worker:', registration.scope);
            await registration.unregister();
            console.log('Service worker unregistered successfully');
          }
          
          // Also try to unregister from the main thread
          if (navigator.serviceWorker.controller) {
            console.log('Unregistering controller service worker');
            navigator.serviceWorker.controller.postMessage({ type: 'DISABLE' });
          }
        }
      } catch (error) {
        console.log('Error unregistering service workers:', error);
      }
      
      // Clear any service worker caches
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) {
            if (cacheName.includes('chainsync')) {
              await caches.delete(cacheName);
              console.log('Deleted cache:', cacheName);
            }
          }
        }
      } catch (error) {
        console.log('Error clearing caches:', error);
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

      // Try to register background sync for offline queue
      try {
        if ('sync' in this.registration) {
          await (this.registration as any).sync.register('background-sync');
          console.log('Background sync registered');
        }
      } catch (err) {
        console.log('Background sync not available', err);
      }

      // Signal SW to prewarm caches for POS data
      try {
        this.registration.active?.postMessage({ type: 'PREWARM_CACHES' });
      } catch {}

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
      navigator.serviceWorker.addEventListener('error', (_event) => {
        console.error('Service Worker error event');
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

// Global cleanup function for browser console
if (typeof window !== 'undefined') {
  (window as any).cleanupServiceWorkers = async () => {
    console.log('🧹 Manual service worker cleanup initiated...');
    await serviceWorkerManager.forceCleanup();
    console.log('✅ Manual cleanup completed. You can now refresh the page.');
  };
  
  console.log('🛠️  Manual cleanup available: run cleanupServiceWorkers() in console');
}
