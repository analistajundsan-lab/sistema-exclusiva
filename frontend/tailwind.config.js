module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
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
          700: '#00341b', // COR PRIMÁRIA — verde Exclusiva
          800: '#003219',
          900: '#002112',
          950: '#000f08',
        },
        accent: {
          300: '#ffd166',
          400: '#ffbe33',
          500: '#f29b00', // LARANJA/ÂMBAR — CTA Exclusiva
          600: '#d98700',
          700: '#b86f00',
        },
      },
    },
  },
  plugins: [],
}
