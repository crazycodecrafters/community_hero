/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neu: {
          50: '#f0f2f5',
          100: '#e4e7ec',
          200: '#c9cdd6',
          300: '#aeb3bf',
          400: '#9399a9',
          500: '#787f92',
          600: '#5d6575',
          700: '#424b58',
          800: '#2d3436',
          900: '#1a1d21',
        },
        primary: {
          light: '#6c5ce7',
          DEFAULT: '#5a4bd1',
          dark: '#4834b5',
        },
        accent: {
          green: '#00b894',
          orange: '#fdcb6e',
          red: '#e17055',
          blue: '#74b9ff',
        },
      },
      boxShadow: {
        neup: '8px 8px 16px #c9cdd6, -8px -8px 16px #ffffff',
        neupress: 'inset 4px 4px 8px #c9cdd6, inset -4px -4px 8px #ffffff',
        neup_sm: '4px 4px 8px #c9cdd6, -4px -4px 8px #ffffff',
        neupress_sm: 'inset 2px 2px 4px #c9cdd6, inset -2px -2px 4px #ffffff',
        neup_dark: '8px 8px 16px #1a1d21, -8px -8px 16px #404752',
        neupress_dark: 'inset 4px 4px 8px #1a1d21, inset -4px -4px 8px #404752',
        neup_colored: '8px 8px 16px rgba(90, 75, 209, 0.15), -8px -8px 16px rgba(255, 255, 255, 0.8)',
      },
      borderRadius: {
        neup: '16px',
        neup_sm: '12px',
        neup_lg: '24px',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'xp-pop': 'xpPop 0.5s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        xpPop: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.3)', opacity: '0.8' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
