/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        carbon: {
          DEFAULT: "#0E0E10",
          soft: "#17171A",
          line: "#26262B"
        },
        gold: {
          DEFAULT: "#C9A24B",
          soft: "#E8D9B5",
          dim: "#8A6F35"
        },
        cream: {
          DEFAULT: "#F7F3EC",
          card: "#FFFFFF"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["\"Fraunces\"", "Georgia", "serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,14,16,0.06), 0 1px 1px rgba(14,14,16,0.04)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
