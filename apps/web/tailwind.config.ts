import type { Config } from 'tailwindcss';

const v = (name: string) => `var(--${name})`;
// rgb-less CSS vars: opacity modifiers (bg-primary/10) need color-mix
const c = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: c('color-primary'), hover: v('color-primary-hover'), soft: c('color-primary-soft'), line: c('color-primary-line') },
        accent: { DEFAULT: c('color-accent'), soft: c('color-accent-soft'), ink: v('color-accent-ink') },
        overlay: v('color-overlay'),
        background: v('color-background'),
        surface: { DEFAULT: v('color-surface'), muted: v('color-surface-muted') },
        border: v('color-border'),
        ink: { DEFAULT: c('color-text'), muted: v('color-text-muted') },
        success: { DEFAULT: c('color-success'), soft: c('color-success-soft') },
        warning: { DEFAULT: c('color-warning'), soft: c('color-warning-soft') },
        danger: { DEFAULT: c('color-danger'), soft: c('color-danger-soft') },
        neutral: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, c(`neutral-${n}`)])),
      },
      borderRadius: { sm: v('radius-sm'), md: v('radius-md'), lg: v('radius-lg'), xl: v('radius-xl') },
      boxShadow: { sm: v('shadow-sm'), md: v('shadow-md'), lg: v('shadow-lg'), button: v('shadow-button') },
      fontFamily: { sans: v('font-sans'), mono: v('font-mono') },
      transitionTimingFunction: { out: v('ease-out'), spring: v('ease-spring') },
      keyframes: {
        'overlay-in': { from: { opacity: '0' } },
        'overlay-out': { to: { opacity: '0' } },
        'dialog-in': { from: { opacity: '0', transform: 'translateY(10px) scale(0.97)' } },
        'dialog-out': { to: { opacity: '0', transform: 'translateY(4px) scale(0.985)' } },
        'menu-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' } },
      },
      animation: {
        'overlay-in': 'overlay-in 220ms var(--ease-out)',
        'overlay-out': 'overlay-out 160ms ease-in forwards',
        'dialog-in': 'dialog-in 560ms var(--ease-spring)',
        'dialog-out': 'dialog-out 140ms ease-in forwards',
        'menu-in': 'menu-in 260ms var(--ease-spring)',
        rise: 'rise 600ms var(--ease-out) both',
      },
    },
  },
} satisfies Config;
