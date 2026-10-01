/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Secondary text that still meets WCAG AA (gray-500 on white = 4.8:1). Use instead of gray-400.
        subtle: "#6b7280",
        // Atlassian/Jira-inspired blue scale
        brand: {
          50: "#eef4ff",
          100: "#dde9fe",
          200: "#b8d4fe",
          300: "#85b8fd",
          400: "#4c96f8",
          500: "#1d7afc",
          600: "#0c66e4",
          700: "#0955c5",
          800: "#0c4aa3",
          900: "#103f81",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(9, 30, 66, 0.08), 0 0 1px rgba(9, 30, 66, 0.16)",
        popover: "0 4px 8px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.2)",
      },
      keyframes: {
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "toast-in": "toast-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};
