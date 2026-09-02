import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Skin Care Assistant",
        short_name: "SkinCare",
        description: "Your trusted dermatology guide — English & Bangla",
        theme_color: "#0F9B8E",
        background_color: "#F7FAFB",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /^\/api\/data/, handler: "NetworkFirst", options: { cacheName: "app-data", expiration: { maxAgeSeconds: 86400 } } }
        ]
      }
    })
  ],
  build: { chunkSizeWarningLimit: 3000 }
});
