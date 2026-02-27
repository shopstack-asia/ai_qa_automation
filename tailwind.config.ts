import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        elevated: "#243047",
        foreground: "#f8fafc",
        border: "rgba(255,255,255,0.06)",
        "border-hover": "rgba(255,255,255,0.1)",
        muted: "#64748b",
        "muted-foreground": "#94a3b8",
        accent: "#3b82f6",
        indigo: "#6366f1",
        success: "#22c55e",
        warning: "#f59e0b",
        destructive: "#ef4444",
      },
      borderRadius: {
        card: "1rem",
        input: "0.75rem",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.2), 0 1px 2px -1px rgba(0,0,0,0.2)",
        glow: "0 0 0 1px rgba(59, 130, 246, 0.2)",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "gradient-shift": "gradient-shift 8s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
