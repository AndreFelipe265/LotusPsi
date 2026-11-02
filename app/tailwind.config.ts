import type { Config } from "tailwindcss";
import { themeColors } from "./src/lib/theme";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: themeColors,
      fontFamily: {
        sans: [
          '"Open Sans Local"',
          '"Nunito"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        base: ["1rem", { lineHeight: "1.5rem" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
