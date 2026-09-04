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
        dark: {
          bg: '#0d0d0d',
          sidebar: '#171717',
          rail: '#111111',
          card: '#212121',
          hover: '#2a2a2a',
          border: '#262626',
          input: '#1e1e1e',
        },
        light: {
          bg: '#ffffff',
          sidebar: '#f7f7f8',
          rail: '#efeff1',
          card: '#f3f4f6',
          hover: '#e5e7eb',
          border: '#e5e7eb',
          input: '#ffffff',
        }
      }
    },
  },
  plugins: [],
}
