import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { serviceWorkerManager } from "./lib/service-worker";
import { enqueueOfflineSale } from "./lib/offline-queue";

// Render the app
createRoot(document.getElementById("root")!).render(<App />);

// Register service worker after app is rendered
console.log('🔧 Initializing service worker manager...');
console.log('📍 Current location:', window.location.href);
console.log('🌍 Environment:', import.meta.env.MODE);

serviceWorkerManager.register()
  .then(async () => {
    console.log('✅ Service worker initialization completed');
    
    // In development, force cleanup any remaining service workers
    if (import.meta.env.MODE === 'development' || window.location.hostname === 'localhost') {
      console.log('🧹 Development mode detected, forcing cleanup...');
      await serviceWorkerManager.forceCleanup();
    }
  })
  .catch((error) => {
    console.error('❌ Service worker initialization failed:', error);
    
    // Try force cleanup on error
    if (import.meta.env.MODE === 'development' || window.location.hostname === 'localhost') {
      console.log('🧹 Attempting force cleanup after error...');
      serviceWorkerManager.forceCleanup().catch(cleanupError => {
        console.error('❌ Force cleanup also failed:', cleanupError);
      });
    }
  });

// Expose test helper for E2E
// @ts-ignore
if (typeof window !== 'undefined') window.enqueueTestSale = async (payload) => {
  const { generateIdempotencyKey } = await import('./lib/offline-queue');
  const idempotencyKey = generateIdempotencyKey();
  await enqueueOfflineSale({ url: '/api/pos/sales', payload, idempotencyKey });
  return idempotencyKey;
};
