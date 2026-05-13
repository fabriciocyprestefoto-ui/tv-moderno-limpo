/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './LegacyApp.tsx',
    './index.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './features/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
    './layouts/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './config/**/*.{js,ts,jsx,tsx}',
    './types/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /**
       * Paleta de cores do design system.
       * Uso: bg-brand-purple, text-surface-card, border-focus-ring, etc.
       * Também disponíveis via CSS: var(--color-brand-purple) (definido no @theme do index.css)
       */
      colors: {
        brand: {
          purple: '#c084fc',
          'purple-dim': '#9333ea',
          red: '#e50914',
          'red-dim': '#b00710',
        },
        surface: {
          DEFAULT: '#0f0f0f',
          elevated: '#1a1a1a',
          card: '#222222',
          overlay: 'rgba(0, 0, 0, 0.85)',
        },
      },

      /**
       * Tipografia: Inter como fonte principal (sem download extra — usa system stack).
       * Para produção, adicionar <link> do Google Fonts no index.html.
       */
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Cascadia Code', 'monospace'],
      },

      /** Escala de font-size estendida com tamanhos pequenos para badges e labels. */
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }], // 10px
      },

      /** Raios de borda semânticos. */
      borderRadius: {
        card: '24px',
        button: '12px',
        badge: '6px',
        modal: '20px',
        '4xl': '32px',
        '5xl': '40px',
      },

      /** Sombras semânticas. */
      boxShadow: {
        card: '0 8px 32px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 16px 48px rgba(0, 0, 0, 0.7)',
        'focus-glow': '0 0 0 3px rgba(192, 132, 252, 0.6)',
        'purple-glow': '0 0 40px rgba(168, 85, 247, 0.4)',
        'red-glow': '0 0 40px rgba(229, 9, 20, 0.4)',
      },

      /** Durações para uso em transition-duration e animation-duration. */
      transitionDuration: {
        instant: '50ms',
        fast: '120ms',
        normal: '200ms',
        slow: '350ms',
        slower: '500ms',
      },

      /** Curvas de easing para transições suaves (estilo Netflix). */
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-back': 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      /**
       * Keyframes e animações customizadas.
       * As animações existentes em animations.css são mantidas intactas;
       * aqui adicionamos novas para uso via classe Tailwind (animate-fade-in, etc.).
       */
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-bottom': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(168, 85, 247, 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(168, 85, 247, 0.6)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-up': 'fade-in-up 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-bottom': 'slide-in-bottom 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },

      /** Espaçamentos semânticos de layout. */
      spacing: {
        sidebar: '54px',
        'sidebar-expanded': '204px',
        'page-x': '48px',
        'row-gap': '32px',
      },

      /**
       * Backdrop blur estendido para glassmorphism consistente.
       * O projeto usa bastante blur(40px) — adicionamos 'heavy' para esse caso.
       */
      backdropBlur: {
        heavy: '40px',
        ultra: '80px',
      },
    },
  },
  plugins: [],
};
