import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  server: {
    port: 5190,
    proxy: { "/api": "http://127.0.0.1:8770" },
  },
});
