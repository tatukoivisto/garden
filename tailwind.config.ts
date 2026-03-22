import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        garden: {
          soil:       "#5C3D2E",
          "soil-light": "#7A5240",
          leaf:       "#4A7C59",
          "leaf-light": "#6BAF7A",
          "leaf-dark":  "#2F5E3A",
          sprout:     "#A8C66C",
          sun:        "#F4B942",
          bark:       "#8B5E3C",
          stone:      "#9E9E8E",
          cream:      "#F5F0E8",
          "cream-dark": "#EDE4D0",
          sky:        "#87CEEB",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "garden-gradient":
          "linear-gradient(135deg, #2F5E3A 0%, #4A7C59 50%, #A8C66C 100%)",
      },
      animation: {
        "fade-in":    "fadeIn 0.3s ease-in-out",
        "slide-up":   "slideUp 0.4s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
