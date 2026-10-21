/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- Semantic design tokens (forgeADE parity) -------------------
        // Values are RGB channel triplets defined in src/index.css and flip
        // on `html.dark` / `html[data-theme]`. Components never hardcode
        // hex values for themed surfaces.
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        popover: 'rgb(var(--popover) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-fg) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-fg) / <alpha-value>)',
        },
        'subtle-fg': 'rgb(var(--subtle-fg) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        message: {
          DEFAULT: 'rgb(var(--message) / <alpha-value>)',
          foreground: 'rgb(var(--message-fg) / <alpha-value>)',
        },
        chrome: 'rgb(var(--chrome) / <alpha-value>)',
        destructive: 'rgb(var(--destructive) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        'full-access': 'rgb(var(--full-access) / <alpha-value>)',
        focus: 'rgb(var(--focus) / <alpha-value>)',

        // ---- forge-ade parity aliases (ported component vocabulary) ------
        'fg-primary': 'rgb(var(--foreground) / <alpha-value>)',
        'fg-secondary': 'rgb(var(--muted-fg) / <alpha-value>)',
        'fg-tertiary': 'rgb(var(--subtle-fg) / <alpha-value>)',
        'secondary-label': 'rgb(var(--muted-fg) / <alpha-value>)',
        'icon-muted': 'rgb(var(--subtle-fg) / <alpha-value>)',
        'foreground-subtle': 'rgb(var(--muted-fg) / <alpha-value>)',
        'foreground-subtlest': 'rgb(var(--subtle-fg) / <alpha-value>)',
        surface: 'rgb(var(--card) / <alpha-value>)',
        'surface-hover': 'rgb(var(--accent) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        'sidebar-border': 'rgb(var(--border) / <alpha-value>)',
        'toolbar-control': 'rgb(var(--accent) / 0.6)',
        'border-default': 'rgb(var(--border) / <alpha-value>)',
        placeholder: 'rgb(var(--muted-fg) / <alpha-value>)',
        chrome: 'rgb(var(--chrome) / <alpha-value>)',
        brand: 'rgb(var(--primary) / <alpha-value>)',
        secondary: 'rgb(var(--muted) / <alpha-value>)',
        'message-action': {
          DEFAULT: 'rgb(var(--foreground) / <alpha-value>)',
          foreground: 'rgb(var(--background) / <alpha-value>)',
          hover: 'rgb(var(--foreground) / 0.88)',
        },
        'tool-error-icon': 'rgb(var(--destructive) / <alpha-value>)',
        'trajectory-reasoning': 'rgb(var(--primary) / <alpha-value>)',
        ring: 'rgb(var(--focus) / <alpha-value>)',

        // ---- Legacy monochrome tokens (GOALS.md P7 consumers) -----------
        // Aliased to the semantic palette in index.css so existing panes
        // track the active theme.
        app: 'rgb(var(--c-app) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        rail: 'rgb(var(--c-rail) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        hoverbg: 'rgb(var(--c-hoverbg) / <alpha-value>)',
        inputbg: 'rgb(var(--c-inputbg) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        hi: 'rgb(var(--c-hi) / <alpha-value>)',
        mid: 'rgb(var(--c-mid) / <alpha-value>)',
        lo: 'rgb(var(--c-lo) / <alpha-value>)',

        // ---- Fixed reference colors kept for compatibility --------------
        canvas: '#F7F7F5',
        surface: '#FFFFFF',
        deeprail: '#0F0F0F',
        outline: '#E5E7EB',
        subtext: '#8A8A85',
        peach: '#FFF5EB',
        peachborder: '#F5E3CF',
        ambertext: '#D97706',
        techblue: '#007AFF',
        techbluelight: '#EBF5FF',
        agentorange: '#F97316',
        successgreen: '#16A34A',
        successlight: '#DCFCE7',
      },
      fontSize: {
        // t3/forgeADE type scale — dense UI metadata up to titles.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '4xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        'ui-xs': ['0.75rem', { lineHeight: '1.125rem' }],
        'ui-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'ui-base': ['0.875rem', { lineHeight: '1.375rem' }],
        'ui-lg': ['1rem', { lineHeight: '1.5rem' }],
        'ui-xl': ['1.125rem', { lineHeight: '1.625rem' }],
      },
      borderRadius: {
        // Whole-app corner language derives from --radius (0.625rem).
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 12px)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'monospace'],
        funnel: ['"Funnel Sans"', 'system-ui', 'sans-serif'],
        geist: ['Geist', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        composer: 'var(--shadow-composer)',
        dialog: 'var(--shadow-dialog)',
        'control-highlight': 'inset 0 1px rgb(255 255 255 / 16%)',
      },
    },
  },
  plugins: [],
}
