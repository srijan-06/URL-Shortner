import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local dev we proxy /api and the redirect paths to the backend so the
// browser can talk to :4000 without CORS friction. In production the frontend
// uses VITE_API_BASE_URL (see src/api.js) to point at the deployed API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
