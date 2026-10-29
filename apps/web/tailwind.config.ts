import type { Config } from 'tailwindcss';

const v = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v('color-primary'), hover: v('color-primary-hover'), soft: v('color-primary-soft') },
        accent: v('color-accent'),
        background: v('color-background'),
        surface: { DEFAULT: v('color-surface'), muted: v('color-surface-muted') },
        border: v('color-border'),
        ink: { DEFAULT: v('color-text'), muted: v('color-text-muted') },
        success: v('color-success'),
        warning: v('color-warning'),
        danger: v('color-danger'),
        neutral: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, v(`neutral-${n}`)])),
      },
      borderRadius: { sm: v('radius-sm'), md: v('radius-md'), lg: v('radius-lg'), xl: v('radius-xl') },
      boxShadow: { sm: v('shadow-sm'), md: v('shadow-md'), lg: v('shadow-lg') },
      fontFamily: { sans: v('font-sans') },
    },
  },
} satisfies Config;
