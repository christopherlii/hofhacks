/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nyu-violet': '#57068c',
        'nyu-violet-dark': '#3d0066',
      },
    },
  },
  plugins: [],
}
