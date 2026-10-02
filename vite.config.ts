import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore background dataset, training logs, and venvs from triggering dev-server reloads
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/dataset/**',
          '**/logs/**',
          '**/venv_train/**',
          '**/whisper-paxton*/**',
          '**/uploads/**',
          '**/*.log',
          '**/*.csv',
          '**/training_data.json',
          '**/audio_bank.json',
          '**/.cache/**',
        ],
      },
    },
  };
});
