/**
 * eslint.config.js — Flat Config (ESLint 9+)
 * ─────────────────────────────────────────────────────────────────────────────
 * Regras focadas em qualidade sem ser bloqueante no desenvolvimento.
 * Para instalar as dependências:
 *
 *   npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react \
 *     eslint-plugin-react-hooks eslint-plugin-react-refresh \
 *     eslint-plugin-jsx-a11y
 * ─────────────────────────────────────────────────────────────────────────────
 */

import js from '@eslint/js';
import tsPlugin from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierPlugin from 'eslint-plugin-prettier';

export default tsPlugin.config(
  // ── Arquivos ignorados ──────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'android-native/**',
      'public/**',
      '*.config.js',
      'scripts/**',
      // Worktrees temporários do Claude Code — não fazem parte do projeto
      '.claude/**',
      '.cursor/**',
      // Arquivos de script avulsos na raiz
      '*.mjs',
      '*.cjs',
      'check_*.ts',
      'run_*.ts',
      'execute_*.ts',
      // Subprojetos independentes ou fora do tsconfig principal
      'mobileapp/**',
      'mobile/**',
      'detalhes/**',
      'api-brasileirao/**',
      'stitch_reference/**',
      'supabase/**',
      'tmp/**',
      // Arquivos JS avulsos na raiz
      'EXEMPLOS_INTEGRACAO.js',
      // Artefatos de build/test e projetos externos
      'electron/**',
      'testsprite_tests/**',
      'vitest.config.ts',
      'vitest.setup.ts',
      // Arquivo TSX órfão (não importado, não incluído no tsconfig; usar features/livetv/constants.ts)
      'features/livetv/constants.tsx',
    ],
  },

  // ── Base JS ────────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript ─────────────────────────────────────────────────────────
  ...tsPlugin.configs.recommendedTypeChecked,

  // ── React + Hooks + Refresh ────────────────────────────────────────────
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ── React ──────────────────────────────────────────────────────────
      'react/react-in-jsx-scope': 'off', // não precisa importar React no v17+
      'react/prop-types': 'off', // TypeScript já valida props
      'react/display-name': 'warn', // facilita debug com React DevTools
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-target-blank': 'error',

      // ── React Hooks ────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error', // hooks só em componentes
      'react-hooks/exhaustive-deps': 'warn', // deps de useEffect incompletas

      // ── React Refresh (Fast HMR) ───────────────────────────────────────
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── Acessibilidade (jsx-a11y) ──────────────────────────────────────
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/media-has-caption': 'off', // streams ao vivo sem legenda
      'jsx-a11y/no-autofocus': 'off', // TV Box precisa de autoFocus

      // ── TypeScript ─────────────────────────────────────────────────────
      // any = warn globalmente; arquivos limpos upgradeados para error no bloco abaixo
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^_', // _varName é intencional
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'warn',
      // Em React, é idiomático passar async functions como props de evento (onClick, onPlay, etc.)
      // attributes: false evita falsos positivos em JSX event handlers
      '@typescript-eslint/no-misused-promises': [
        'warn',
        {
          checksVoidReturn: { attributes: false },
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'off', // muito verboso com dados TMDB/Supabase
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Regras do recommendedTypeChecked com muitos falsos positivos neste projeto:
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn', // frequente em código legado com type guards
      '@typescript-eslint/no-base-to-string': 'off', // falsos positivos com padrão `j['field'] ?? ''`
      '@typescript-eslint/restrict-template-expressions': 'off', // mesmo padrão de dados dinâmicos
      '@typescript-eslint/require-await': 'warn', // métodos async satisfazendo interface sem await
      '@typescript-eslint/unbound-method': 'off', // falsos positivos com métodos de Capacitor/libs
      '@typescript-eslint/prefer-promise-reject-errors': 'warn', // reject com string ainda é funcional
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn', // ternários com efeitos colaterais são comuns
      '@typescript-eslint/no-namespace': 'warn', // Cypress usa namespace para typings globais
      '@typescript-eslint/only-throw-error': 'warn', // projeto tem alguns throw string herdados
      '@typescript-eslint/ban-types': 'off', // Function type ainda usado em callbacks legados
      '@typescript-eslint/no-unsafe-function-type': 'warn', // alias moderno do ban-types para Function

      // ── Geral ──────────────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }], // usar logger.ts em vez de console.log
      // allowEmptyCatch: catch {} é idiomático para swallow de erros esperados (ex: .catch(() => {}))
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',

      // ── Prettier (formatação consistente) ─────────────────────────────
      'prettier/prettier': 'warn',
    },
  },

  // ── any → error gradual ─────────────────────────────────────────────────
  // Arquivos confirmados sem `any` explícito. Adicionar aqui conforme forem limpos.
  {
    files: [
      'utils/appSignals.ts',
      'pages/player/usePlayerKeyboard.ts',
      'services/accessCodeService.ts',
      'utils/dpadDebounce.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
);
