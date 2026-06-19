import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0A1F3D',
        blue: '#1E4175',
        amber: '#F59E0B',
        green: '#16A34A',
        red: '#DC2626',
        page: '#F6F7F9',
        border: '#E5E7EB',
        ink: '#0F172A',
        muted: '#64748B',
        faint: '#94A3B8',
        medium: '#475569',
        divider: '#CBD5E1',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        'card-lg': '15px',
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
