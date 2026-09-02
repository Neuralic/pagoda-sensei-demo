/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#D4AA25",
        foreground: "#404040",
      },
      fontFamily: {
        stentiga: ["var(--font-stentiga)", "system-ui", "arial"],
      },
    },
  },
  plugins: [],
};
