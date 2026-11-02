import type { Config } from 'tailwindcss';

/**
 * Leash design tokens: "signed instrument".
 * Security-printing vernacular (banknote paper, intaglio ink, guilloché),
 * with verdict colours borrowed from rubber stamps.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#E8EBE3',
          raised: '#F5F6F1',
          sunk: '#DCE0D5',
        },
        ink: {
          DEFAULT: '#142039',
          soft: '#4A5670',
          faint: '#7C8598',
        },
        intaglio: {
          DEFAULT: '#2440B8',
          deep: '#182D86',
          wash: '#D9DEF3',
        },
        allow: { DEFAULT: '#1D7350', wash: '#D3E6DA' },
        hold: { DEFAULT: '#A66C06', wash: '#F1E3C4' },
        block: { DEFAULT: '#B42A1F', wash: '#F2D6D1' },
        rule: 'rgba(20, 32, 57, 0.14)',
        'rule-strong': 'rgba(20, 32, 57, 0.28)',
      },
      fontFamily: {
        display: ['Gloock', 'Georgia', 'serif'],
        sans: ['"Schibsted Grotesk Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Modular scale (ratio 1.25) anchored at 16px
        'step--1': ['0.8rem', { lineHeight: '1.45' }],
        'step-0': ['1rem', { lineHeight: '1.55' }],
        'step-1': ['1.25rem', { lineHeight: '1.45' }],
        'step-2': ['1.563rem', { lineHeight: '1.3' }],
        'step-3': ['1.953rem', { lineHeight: '1.2' }],
        'step-4': ['2.441rem', { lineHeight: '1.1' }],
        'step-5': ['3.052rem', { lineHeight: '1.05' }],
        'step-6': ['3.815rem', { lineHeight: '1.0' }],
        'step-7': ['4.768rem', { lineHeight: '0.98' }],
      },
      borderRadius: {
        note: '3px',
        sheet: '10px',
      },
      boxShadow: {
        sheet: '0 1px 0 rgba(20,32,57,0.06), 0 12px 32px -18px rgba(20,32,57,0.35)',
      },
      keyframes: {
        stamp: {
          '0%': { transform: 'scale(1.8) rotate(-14deg)', opacity: '0' },
          '60%': { transform: 'scale(0.94) rotate(-8deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-8deg)', opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        stamp: 'stamp 420ms cubic-bezier(.2,.9,.3,1.2) both',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
