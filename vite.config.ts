import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEditor } from "./scripts/localEditor";
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "edit" ? [localEditor()] : [])],
  base: "./",
  server: { host: "127.0.0.1" },
}));
