import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { serviceWorkerManager } from "./lib/service-worker";

// Render the app
createRoot(document.getElementById("root")!).render(<App />);

// Register service worker after app is rendered
console.log('🔧 Initializing service worker manager...');
serviceWorkerManager.register()
  .then(() => {
    console.log('✅ Service worker initialization completed');
  })
  .catch((error) => {
    console.error('❌ Service worker initialization failed:', error);
  });
