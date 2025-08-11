import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { serviceWorkerManager } from "./lib/service-worker";

// Render the app
createRoot(document.getElementById("root")!).render(<App />);

// Register service worker after app is rendered
console.log('🔧 Initializing service worker manager...');
console.log('📍 Current location:', window.location.href);
console.log('🌍 Environment:', process.env.NODE_ENV);

serviceWorkerManager.register()
  .then(async () => {
    console.log('✅ Service worker initialization completed');
    
    // In development, force cleanup any remaining service workers
    if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
      console.log('🧹 Development mode detected, forcing cleanup...');
      await serviceWorkerManager.forceCleanup();
    }
  })
  .catch((error) => {
    console.error('❌ Service worker initialization failed:', error);
    
    // Try force cleanup on error
    if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
      console.log('🧹 Attempting force cleanup after error...');
      serviceWorkerManager.forceCleanup().catch(cleanupError => {
        console.error('❌ Force cleanup also failed:', cleanupError);
      });
    }
  });
