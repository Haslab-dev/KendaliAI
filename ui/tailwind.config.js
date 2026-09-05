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
        // Semantic design tokens (GOALS.md P7). Values are RGB channel
        // triplets defined in src/index.css and flip on `html.dark`, so
        // components never hard-code dark or light hex values.
        //   app    – page background
        //   panel  – sidebar / panels
        //   rail   – icon rail / deepest chrome
        //   raised – cards, buttons, tiles
        //   hoverbg – hover state surface
        //   inputbg – text inputs
        //   line   – borders
        //   hi/mid/lo – text hierarchy (high contrast → muted)
        app: 'rgb(var(--c-app) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        rail: 'rgb(var(--c-rail) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        hoverbg: 'rgb(var(--c-hoverbg) / <alpha-value>)',
        inputbg: 'rgb(var(--c-inputbg) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        hi: 'rgb(var(--c-hi) / <alpha-value>)',
        mid: 'rgb(var(--c-mid) / <alpha-value>)',
        lo: 'rgb(var(--c-lo) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}
