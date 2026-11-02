import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#08090d',
        surface: '#0c0e13',
        'surface-elevated': '#13161f',
        border: 'rgba(255, 255, 255, 0.08)',
        'border-strong': 'rgba(255, 255, 255, 0.16)',
        emerald: {
          light: '#00c758',
          DEFAULT: '#00a544',
          dark: '#016630',
        },
        saffron: {
          light: '#fe6e00',
          DEFAULT: '#f05100',
          dark: '#9f2d00',
        },
        techblue: {
          light: '#3080ff',
          DEFAULT: '#155dfc',
          dark: '#193cb8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
