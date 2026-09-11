/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bcdcff",
          300: "#8ec5ff",
          400: "#59a5ff",
          500: "#3182f6",
          600: "#1c64da",
          700: "#1750b0",
          800: "#18448c",
          900: "#193c72",
        },
      },
    },
  },
  plugins: [],
};
