/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5ff',
          100: '#e0ecff',
          200: '#c7dcfe',
          300: '#a3c4fd',
          400: '#75a2fa',
          500: '#467af6',
          600: '#2b58ea',
          700: '#2041d4',
          800: '#1d36ac',
          900: '#1d3287',
          950: '#142053',
        },
        slate: {
          850: '#162032',
          925: '#0b1120',
          950: '#070d18',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
