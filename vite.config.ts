/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Set BASE_PATH (for example "/daily-quest/") when the app is served from a sub-path such as GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    react(),
    VitePWA({
      // A new version waits until the person taps Reload, so an update never interrupts a photo or a form.
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Daily Quest",
        short_name: "Daily Quest",
        description: "Turn your daily schedule into a game. Works offline.",
        display: "standalone",
        orientation: "portrait",
        background_color: "#edf0f7",
        theme_color: "#edf0f7",
        categories: ["productivity", "lifestyle"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
