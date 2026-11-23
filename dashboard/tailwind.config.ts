import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b1326",
          dim: "#0b1326",
          bright: "#31394d",
          low: "#131b2e",
          mid: "#171f33",
          high: "#222a3d",
          highest: "#2d3449",
        },
        ink: {
          DEFAULT: "#dae2fd",
          variant: "#bbcabf",
          muted: "#86948a",
        },
        primary: {
          DEFAULT: "#10b981",
          hover: "#059669",
          soft: "rgba(16,185,129,0.12)",
        },
        accent: {
          cyan: "#06b6d4",
          indigo: "#6366f1",
        },
        danger: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["Space Grotesk", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl2: "1.5rem",
      },
      boxShadow: {
        glass: "0 10px 25px -5px rgba(0,0,0,0.6)",
        neon: "0 0 20px -4px rgba(16,185,129,0.25)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
