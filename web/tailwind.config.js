/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Inter"',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          900: '#1a1a1a',
          700: '#404040',
          500: '#737373',
          400: '#a3a3a3',
          300: '#d4d4d4',
          200: '#e5e5e5',
          100: '#f5f5f5',
          50: '#fafafa',
        },
        accent: {
          DEFAULT: '#2f74ff',
          soft: '#eaf1ff',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', '0.95rem'],
      },
    },
  },
  plugins: [],
};
