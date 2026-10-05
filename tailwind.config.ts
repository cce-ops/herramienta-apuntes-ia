import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1F4E79",
        secondary: "#2E74B5",
        ideaBg: "#F1F8E9",
        ideaBorder: "#4CAF50",
        cajaAzul: "#E3F2FD",
        cajaAzulBorde: "#1976D2",
        cajaAmarilla: "#FFF8E1",
        cajaAmarillaBorde: "#F9A825",
        cajaVerde: "#E8F5E9",
        cajaVerdeBorde: "#388E3C",
      },
    },
  },
  plugins: [],
};
export default config;