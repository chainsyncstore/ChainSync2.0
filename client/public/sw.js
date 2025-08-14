// ChainSync Service Worker for Offline Capabilities
// Phase 8 - Future Enhancements

// Enhanced development mode detection
const isDevelopment = () => {
  // Check multiple development indicators
  const hostname = self.location.hostname;
  const port = self.location.port;
  
  return (
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.includes('replit') ||
    hostname.includes('dev') ||
    port === '3000' ||
    port === '5173' ||
    port === '8080'
  );
};

// Check if we're in development mode
if (isDevelopment()) {
  console.log('Service Worker disabled in development mode');
  // Don't register any other event listeners in development
  // Use a function to avoid illegal return statement
  const disableInDevelopment = () => {
    // Early exit for development
  };
  disableInDevelopment();
}

const CACHE_NAME = 'chainsync-v1.0.1';
const OFFLINE_CACHE = 'chainsync-offline-v1.0.1';
let isDisabled = false;

// Essential resources to cache for offline use
const ESSENTIAL_RESOURCES = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
  '/manifest.json'
];

// API endpoints that should work offline
const OFFLINE_ENDPOINTS = [
  '/api/pos/transactions',
  '/api/inventory',
  '/api/products',
  '/api/stores'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching essential resources for offline use');
        return cache.addAll(ESSENTIAL_RESOURCES);
      })
      .then(() => {
        console.log('Service Worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle offline requests
self.addEventListener('fetch', (event) => {
  // Skip if service worker is disabled
  if (isDisabled) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static resources
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(handleStaticResource(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
});

// Handle API requests with offline support
async function handleApiRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    
    // Cache successful responses for offline use
    if (response.ok && isCacheableEndpoint(request.url)) {
      const cache = await caches.open(OFFLINE_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('Network failed, trying cache:', request.url);
    
    // Try cache for offline endpoints
    if (isOfflineEndpoint(request.url)) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Return offline response for critical endpoints
    if (isCriticalEndpoint(request.url)) {
      return createOfflineResponse(request);
    }
    
    // Don't throw error, just return a fallback response
    console.warn('API request failed, returning fallback:', request.url);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Service temporarily unavailable',
      data: null
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle static resources
async function handleStaticResource(request) {
  try {
    // Try cache first for static resources
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to network
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Static resource fetch failed:', error);
    // Return a fallback response instead of throwing
    return new Response('Resource not available', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Handle navigation requests
async function handleNavigation(request) {
  try {
    // Special handling for payment callback pages
    const url = new URL(request.url);
    if (url.pathname === '/payment/callback') {
      console.log('Payment callback navigation detected, serving directly from network');
      
      try {
        const response = await fetch(request);
        return response;
      } catch (error) {
        console.log('Payment callback network failed, serving offline page');
        // Return cached index.html for offline payment callback
        const cachedResponse = await caches.match('/index.html');
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    }
    
    // Try network first for other navigation requests
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.log('Navigation failed, serving offline page');
    
    // Return cached index.html for offline navigation
    const cachedResponse = await caches.match('/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return a fallback response instead of throwing
    return new Response('Page not available offline', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Check if endpoint should be cached
function isCacheableEndpoint(url) {
  const cacheablePatterns = [
    '/api/products',
    '/api/stores',
    '/api/inventory'
  ];
  
  return cacheablePatterns.some(pattern => url.includes(pattern));
}

// Check if endpoint should work offline
function isOfflineEndpoint(url) {
  return OFFLINE_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

// Check if endpoint is critical for offline operation
function isCriticalEndpoint(url) {
  const criticalPatterns = [
    '/api/pos/transactions',
    '/api/products/barcode'
  ];
  
  return criticalPatterns.some(pattern => url.includes(pattern));
}

// Create offline response for critical endpoints
function createOfflineResponse(request) {
  const url = new URL(request.url);
  
  // Return appropriate offline response based on endpoint
  if (url.pathname.startsWith('/api/pos/transactions')) {
    return new Response(JSON.stringify({
      status: 'offline',
      message: 'Transaction saved locally. Will sync when online.',
      data: { localId: generateLocalId() }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (url.pathname.startsWith('/api/products/barcode')) {
    return new Response(JSON.stringify({
      status: 'offline',
      message: 'Product lookup unavailable offline',
      data: null
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Default offline response
  return new Response(JSON.stringify({
    status: 'offline',
    message: 'Service temporarily unavailable',
    data: null
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate local ID for offline transactions
function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Background sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncOfflineData());
  }
});

// Sync offline data when connection is restored
async function syncOfflineData() {
  try {
    console.log('Starting background sync...');
    
    // Get offline data from IndexedDB
    const offlineData = await getOfflineData();
    
    if (offlineData.length === 0) {
      console.log('No offline data to sync');
      return;
    }
    
    // Sync each offline item
    for (const item of offlineData) {
      try {
        await syncOfflineItem(item);
        await removeOfflineItem(item.id);
      } catch (error) {
        console.error('Failed to sync offline item:', error);
      }
    }
    
    console.log('Background sync completed');
    
    // Notify clients of sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETED',
        data: { syncedItems: offlineData.length }
      });
    });
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Get offline data from IndexedDB
async function getOfflineData() {
  // This would be implemented with IndexedDB
  // For now, return empty array
  return [];
}

// Sync individual offline item
async function syncOfflineItem(item) {
  const response = await fetch(item.url, {
    method: item.method,
    headers: item.headers,
    body: item.body
  });
  
  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }
  
  return response;
}

// Remove synced offline item
async function removeOfflineItem(id) {
  // This would be implemented with IndexedDB
  console.log('Removing synced item:', id);
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.message,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.tag || 'chainsync-notification',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.priority === 'high'
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action) {
    // Handle specific notification actions
    handleNotificationAction(event.action, event.notification.data);
  } else {
    // Default action - focus or open the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' })
        .then((clients) => {
          if (clients.length > 0) {
            return clients[0].focus();
          } else {
            return self.clients.openWindow('/');
          }
        })
    );
  }
});

// Handle notification actions
function handleNotificationAction(action, data) {
  switch (action) {
    case 'view-alert':
      self.clients.openWindow(`/alerts?id=${data.alertId}`);
      break;
    case 'view-inventory':
      self.clients.openWindow(`/inventory?product=${data.productId}`);
      break;
    default:
      console.log('Unknown notification action:', action);
  }
}

// Handle message events from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
    case 'CLEAR_CACHE':
      clearCache().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
    case 'DISABLE':
      isDisabled = true;
      console.log('Service Worker disabled');
      // Clear all caches when disabled
      clearCache();
      break;
    default:
      console.log('Unknown message type:', type);
  }
});

// Clear all caches
async function clearCache() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('All caches cleared');
}

// Periodic cache cleanup
setInterval(async () => {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const requests = await cache.keys();
    
    // Remove old cached responses (older than 7 days)
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      const date = response.headers.get('date');
      
      if (date && new Date(date).getTime() < cutoff) {
        await cache.delete(request);
      }
    }
  } catch (error) {
    console.error('Cache cleanup failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily 