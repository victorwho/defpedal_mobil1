/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: [
          {
            find: '@defensivepedal/core',
            replacement: path.resolve(__dirname, 'packages/core/src/index.ts'),
          },
          {
            find: /^@defensivepedal\/core\/(.*)$/,
            replacement: path.resolve(__dirname, 'packages/core/src/$1'),
          },
          {
            find: '@',
            replacement: path.resolve(__dirname, '.'),
          },
        ]
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './setupTests.ts',
        include: [
          'apps/**/*.{test,spec}.{ts,tsx}',
          'hooks/**/*.{test,spec}.{ts,tsx}',
          'packages/**/*.{test,spec}.{ts,tsx}',
          'services/**/*.{test,spec}.{ts,tsx}',
          'utils/**/*.{test,spec}.{ts,tsx}',
        ],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.claude/**',
          '**/.expo/**',
          '**/output/**',
          '**/tmp/**',
        ],
      }
    };
});
