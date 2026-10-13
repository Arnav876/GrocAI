/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#3BB77E",
          "green-hover": "#2FA66F",
          "green-light": "#DEF9EC",
          "green-tint": "#E8F8EE",
          navy: "#253D4E",
          grey: "#7E7E7E",
          border: "#ECECEC",
          bg: "#FFFFFF",
          peach: "#FEEFEA",
          lavender: "#EDE9FE",
          pink: "#FDE1E6",
          cream: "#FFF3EB",
          sky: "#E7F3FF",
          lime: "#F2FCE4",
        },
        platform: {
          blinkit: "#F8CB46",
          zepto: "#6739B7",
          instamart: "#FC8019",
          bigbasket: "#84C225",
        },
      },
      fontFamily: {
        quicksand: ["Quicksand", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
        hero: "24px",
        pill: "9999px",
      },
      maxWidth: {
        container: "1400px",
      },
      boxShadow: {
        card: "0 2px 10px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 8px 24px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
