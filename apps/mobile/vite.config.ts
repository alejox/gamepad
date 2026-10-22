import vue from "@vitejs/plugin-vue";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  // Consume @gamepad/shared from its TypeScript sources (no prior build needed).
  resolve: { conditions: ["source", ...defaultClientConditions] },
  server: { port: 5173 },
  build: { target: "es2022" },
});
