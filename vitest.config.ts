/**
 * vitest.config.ts — Configuração de testes (Vitest 4.x)
 *
 * Dois projetos paralelos:
 *  node  → utils, services, config (lógica pura, sem DOM)
 *  jsdom → hooks, contexts, components (precisam de document/window)
 *
 * Rodar tudo:      npm test
 * Com cobertura:   npm run test:coverage
 * Modo watch:      npm run test:watch
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,

    // Excludes globais — evita descoberta de testes nas worktrees e builds
    exclude: [
      'node_modules/**',
      'dist/**',
      '.claude/**',
      '**/worktrees/**',
      'android/**',
      'electron/**',
      'public/**',
      'coverage/**',
    ],

    projects: [
      // ── Projeto 1: Node puro ────────────────────────────────────────────
      {
        resolve: {
          alias: { '@': path.resolve(__dirname, '.') },
        },
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: [
            'config/__tests__/**/*.test.ts',
            'utils/__tests__/**/*.test.ts',
            'services/__tests__/**/*.test.ts',
          ],
          // Excluir utilitários com DOM (ficam no projeto jsdom)
          exclude: ['utils/__tests__/dom/**'],
          coverage: {
            provider: 'v8',
            include: ['utils/*.ts', 'services/*.ts', 'config/*.ts'],
            thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
          },
        },
      },

      // ── Projeto 2: jsdom (React/DOM) ────────────────────────────────────
      {
        plugins: [react()],
        resolve: {
          alias: { '@': path.resolve(__dirname, '.') },
        },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: [
            'hooks/__tests__/**/*.test.{ts,tsx}',
            'components/__tests__/**/*.test.{ts,tsx}',
            'contexts/__tests__/**/*.test.{ts,tsx}',
            'pages/**/__tests__/**/*.test.{ts,tsx}',
            'utils/__tests__/dom/**/*.test.{ts,tsx}',
          ],
          coverage: {
            provider: 'v8',
            include: ['hooks/*.{ts,tsx}', 'contexts/*.{ts,tsx}'],
            thresholds: { lines: 65, functions: 65, branches: 65, statements: 65 },
          },
        },
      },
    ],
  },
});
