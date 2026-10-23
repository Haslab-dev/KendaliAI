/** @type {import('tailwindcss').Config} */

function alpha(variable, fallback) {
  return ({ opacityValue }) => {
    const expr = fallback ? `var(${variable}, ${fallback})` : `var(${variable})`;
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, ${expr} calc(${opacityValue} * 100%), transparent)`;
    }
    return expr;
  };
}

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        '7.5': '1.875rem',
      },
      borderColor: ({ theme }) => ({
        DEFAULT: 'var(--contrast-border, var(--border))',
        ...theme('colors'),
      }),
      colors: {
        // ---- Semantic design tokens (ForgeADE design system) ------------
        // Variables resolve directly to CSS custom properties (oklch, color-mix, hex)
        // written by themeEngine.ts and index.css.
        background: alpha('--background'),
        foreground: alpha('--contrast-foreground', 'var(--foreground)'),
        card: alpha('--card'),
        popover: alpha('--popover'),
        primary: {
          DEFAULT: alpha('--primary'),
          foreground: alpha('--primary-foreground', '#ffffff'),
        },
        muted: {
          DEFAULT: alpha('--muted'),
          foreground: alpha('--contrast-muted-foreground', 'var(--muted-foreground)'),
        },
        'subtle-fg': alpha('--contrast-placeholder', 'var(--placeholder)'),
        accent: {
          DEFAULT: alpha('--accent'),
          foreground: alpha('--contrast-accent-foreground', 'var(--foreground)'),
        },
        border: alpha('--contrast-border', 'var(--border)'),
        'border-strong': alpha('--contrast-border', 'var(--border)'),
        input: alpha('--contrast-input', 'var(--input)'),
        sidebar: alpha('--sidebar'),
        message: {
          DEFAULT: alpha('--message-surface'),
          foreground: alpha('--contrast-message-foreground', 'var(--message-foreground, var(--foreground))'),
        },
        'message-surface': alpha('--message-surface'),
        'message-action': alpha('--message-action'),
        'message-action-foreground': alpha('--message-action-foreground', '#ffffff'),
        'message-action-hover': alpha('--message-action-hover'),
        chrome: alpha('--app-chrome-background', 'var(--chrome)'),
        destructive: alpha('--error', 'var(--destructive, #ef4444)'),
        warning: alpha('--warning', '#f59e0b'),
        success: alpha('--success', '#10b981'),
        info: alpha('--info', '#3b82f6'),
        'full-access': alpha('--full-access-accent', '#f97316'),
        focus: alpha('--focus'),

        // ---- forge-ade parity aliases -----------------------------------
        'fg-primary': alpha('--contrast-foreground', 'var(--foreground)'),
        'fg-secondary': alpha('--contrast-secondary-label', 'var(--secondary-label, var(--muted-foreground))'),
        'fg-tertiary': alpha('--contrast-placeholder', 'var(--placeholder)'),
        'secondary-label': alpha('--contrast-secondary-label', 'var(--secondary-label, var(--muted-foreground))'),
        'icon-muted': alpha('--contrast-icon-muted', 'var(--icon-muted, var(--placeholder))'),
        'foreground-subtle': alpha('--contrast-secondary-label', 'var(--secondary-label, var(--muted-foreground))'),
        'foreground-subtlest': alpha('--contrast-placeholder', 'var(--placeholder)'),
        surface: alpha('--card'),
        'surface-raised': alpha('--surface-raised', 'var(--card)'),
        'surface-hover': alpha('--accent'),
        'surface-active': alpha('--accent'),
        'sidebar-border': alpha('--contrast-sidebar-border', 'var(--sidebar-border, var(--border))'),
        'toolbar-control': alpha('--toolbar-control', 'var(--accent)'),
        'border-default': alpha('--contrast-border', 'var(--border)'),
        'border-subtle': 'color-mix(in srgb, var(--contrast-border, var(--border)) 55%, transparent)',
        placeholder: alpha('--contrast-placeholder', 'var(--placeholder)'),
        brand: alpha('--focus'),
        secondary: alpha('--secondary'),
        ring: alpha('--focus'),

        // ---- Legacy aliases kept for compatibility ----------------------
        app: alpha('--background'),
        panel: alpha('--card'),
        rail: alpha('--sidebar'),
        raised: alpha('--surface-raised', 'var(--card)'),
        hoverbg: alpha('--accent'),
        inputbg: alpha('--input'),
        line: alpha('--contrast-border', 'var(--border)'),
        hi: alpha('--contrast-foreground', 'var(--foreground)'),
        mid: alpha('--contrast-muted-foreground', 'var(--muted-foreground)'),
        lo: alpha('--contrast-placeholder', 'var(--placeholder)'),
      },
      fontSize: {
        '5xs': ['0.4375rem', { lineHeight: '1' }],
        '4xs': ['0.5rem', { lineHeight: '1' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'ui-xs': ['0.75rem', { lineHeight: '1.125rem' }],
        'ui-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'ui-base': ['0.875rem', { lineHeight: '1.375rem' }],
        'ui-lg': ['1rem', { lineHeight: '1.5rem' }],
        'ui-xl': ['1.125rem', { lineHeight: '1.625rem' }],
      },
      borderRadius: {
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
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"SFMono-Regular"',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      boxShadow: {
        composer: 'var(--shadow-composer, 0 12px 28px -18px rgb(0 0 0 / 40%))',
        'composer-dark': 'var(--shadow-composer-dark, 0 14px 32px -18px rgb(0 0 0 / 75%))',
        dialog: 'var(--shadow-dialog, 0 24px 64px -24px rgb(0 0 0 / 45%))',
      },
    },
  },
  plugins: [],
};
