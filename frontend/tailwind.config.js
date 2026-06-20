module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f7f3',
          100: '#d9ede2',
          200: '#b3dbc6',
          300: '#7ec2a2',
          400: '#45a37a',
          500: '#228860',
          600: '#0f6e4a',
          700: '#00341b',
          800: '#003219',
          900: '#002112',
          950: '#000f08',
        },
        accent: {
          50:  '#fff8ed',
          100: '#fff4e0',
          200: '#ffe3b3',
          300: '#ffd166',
          400: '#ffbe33',
          500: '#f29b00',
          600: '#d98700',
          700: '#b86f00',
        },
        // Custom mid-tone for dark-mode table heads (between gray-700 and 800).
        // Shallow-merged into Tailwind's default gray ramp, so 50–950 stay intact.
        gray: {
          750: '#262f3c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Refined two-light elevation system — a near-opaque hairline ambient plus a
      // soft directional key light at low opacity with tight offsets. Calm, premium;
      // deliberately NOT the stock-Tailwind "borrachuda" look.
      boxShadow: {
        'xs':       '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        'card':     '0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px 0 rgb(16 24 40 / 0.05)',
        'card-md':  '0 2px 4px -1px rgb(16 24 40 / 0.06), 0 4px 10px -2px rgb(16 24 40 / 0.08)',
        'card-lg':  '0 4px 8px -2px rgb(16 24 40 / 0.06), 0 12px 24px -6px rgb(16 24 40 / 0.10)',
        'modal':    '0 8px 16px -4px rgb(16 24 40 / 0.10), 0 24px 48px -12px rgb(16 24 40 / 0.22)',
        // Brand-tinted glow for primary emphasis — used sparingly.
        'brand':    '0 6px 16px -4px rgb(0 52 27 / 0.28)',
        // Hairline ring for crisp card edges.
        'ring-hairline': '0 0 0 1px rgb(17 24 39 / 0.04)',
      },
      // Three-speed motion system (micro / base / screen).
      transitionDuration: {
        'micro':  '120ms',
        'base':   '200ms',
        'screen': '320ms',
      },
      transitionTimingFunction: {
        'standard':   'cubic-bezier(0.2, 0, 0, 1)',
        'decelerate': 'cubic-bezier(0, 0, 0.2, 1)',
        'accelerate': 'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        'ex-rise':    { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'ex-fade':    { from: { opacity: '0' }, to: { opacity: '1' } },
        'ex-scale':   { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        'ex-spin':    { to: { transform: 'rotate(360deg)' } },
        'ex-shimmer': { '100%': { transform: 'translateX(100%)' } },
        'pulse-dot':  { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'ex-rise':   'ex-rise 320ms cubic-bezier(0, 0, 0.2, 1) both',
        'ex-fade':   'ex-fade 320ms cubic-bezier(0, 0, 0.2, 1) both',
        'ex-scale':  'ex-scale 320ms cubic-bezier(0, 0, 0.2, 1) both',
        'ex-spin':   'ex-spin 0.7s linear infinite',
        'pulse-dot': 'pulse-dot 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      width: {
        sidebar: '15rem',
      },
    },
  },
  plugins: [],
}
