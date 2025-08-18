/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{vue,js,ts}",
    "./pages/**/*.{vue,js,ts}",
    "./app.vue",
  ],
  theme: {
    extend: {
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 0 rgba(0,0,0,0)' },
          '50%': { opacity: 0.95, boxShadow: '0 0 12px rgba(239, 68, 68, 0.6)' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}