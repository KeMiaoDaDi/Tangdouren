import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm studio palette
        cream:   { DEFAULT: '#FDF8F3', 50: '#FFFDF9', 100: '#FDF8F3', 200: '#FAF0E6' },
        sand:    { DEFAULT: '#E8D5B7', 100: '#F5ECD9', 200: '#E8D5B7', 300: '#D4B896' },
        terracotta: { DEFAULT: '#C4714F', light: '#D4876A', dark: '#A8563A' },
        sage:    { DEFAULT: '#7A9E7E', light: '#9BB89F', dark: '#5D8261' },
        charcoal:{ DEFAULT: '#3D3530', light: '#5C504A', dark: '#2A2420' },
        warm:    { 50: '#FDF8F3', 100: '#FAF0E4', 200: '#F5E1CC', 300: '#EAC89A' },
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif:   ['var(--font-serif)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        warm:   '0 4px 24px rgba(196, 113, 79, 0.12)',
        'warm-lg': '0 8px 40px rgba(196, 113, 79, 0.18)',
        card:   '0 2px 16px rgba(61, 53, 48, 0.08)',
      },
      animation: {
        'fade-in':    'fadeIn 0.6s ease forwards',
        'slide-up':   'slideUp 0.5s ease forwards',
        'float':      'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },              to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        float:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
    },
  },
  plugins: [],
}

export default config
