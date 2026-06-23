import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production the seating chart is served from /seating-chart/ as part of
// The Teacher's Desk suite. Vite needs the matching base so built asset URLs
// resolve correctly. Override with VITE_BASE=/ if running standalone.
const base = process.env.VITE_BASE ?? "/seating-chart/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    // Force a single React instance — Vite dev otherwise pre-bundles some
    // Radix packages (e.g. react-toast) against a duplicate React, which
    // throws "Invalid hook call" in the dev server. No-op for the prod build.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: { port: 5173, open: true },
});
