/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'playfair': ['"Playfair Display"', 'serif'],
        'garamond': ['"EB Garamond"', 'serif'],
        'cormorant': ['"Cormorant Garamond"', 'serif'],
        'space': ['"Space Grotesk"', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f7f7f7',
          100: '#e9e9e9',
          200: '#d2d2d2',
          300: '#b1b1b1',
          400: '#929292',
          500: '#787878',
          600: '#5e5e5e',
          700: '#4a4a4a',
          800: '#2c2c2c',
          900: '#1a1a1a',
        },
        accent: {
          light: '#f8f0e3',
          DEFAULT: '#d9c2a7',
          dark: '#a58a67',
        },
      },
      borderRadius: {
        'card': '1rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'card': '0 4px 14px 0 rgba(0, 0, 0, 0.1)',
        'card-hover': '0 10px 25px 0 rgba(0, 0, 0, 0.15)',
      },
      height: {
        'card': '70vh',
      },
      width: {
        'card': '90vw',
        'card-desktop': '450px',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'smooth-scroll': 'smooth-scroll 1s cubic-bezier(0.16, 1, 0.3, 1)',
        'parallax-bg': 'parallax-bg 1s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'smooth-scroll': {
          '0%': { transform: 'translateY(100px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'parallax-bg': {
          '0%': { transform: 'translateY(0) scale(1)' },
          '100%': { transform: 'translateY(-20px) scale(1.05)' },
        }
      },
      transitionTimingFunction: {
        'apple-easing': 'cubic-bezier(0.16, 1, 0.3, 1)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
    require('tailwind-scrollbar'),
  ],
} 