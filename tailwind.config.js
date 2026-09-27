/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Per-language stacks live in index.css (--font-game), switched by the `lang` attribute.
        game: ['var(--font-game)'],
      },
    },
  },
  plugins: [],
};
