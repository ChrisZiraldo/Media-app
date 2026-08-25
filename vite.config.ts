import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { outDir: "dist/client" },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3460",
      "/health": "http://127.0.0.1:3460",
    },
    watch: { ignored: ["**/.vs/**"] },
  },
});
