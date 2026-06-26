import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0E1726',
        blue: '#1B2740',
        amber: '#E8A33D',
        green: '#16A34A',
        red: '#DC3A45',
        page: '#F4F5F7',
        border: '#ECEEF1',
        ink: '#1A1F2B',
        muted: '#8B92A1',
        faint: '#97A0AE',
        medium: '#5A6172',
        divider: '#D7DAE0',
      },
      fontFamily: {
        display: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        'card-lg': '16px',
        xl2: '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04)',
        modal: '0 24px 60px rgba(0,0,0,.3)',
        slideover: '-12px 0 40px rgba(0,0,0,.2)',
      },
      maxWidth: {
        content: '1180px',
      },
    },
  },
  plugins: [],
} satisfies Config;
