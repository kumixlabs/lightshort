import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
  build: {
    emptyOutDir: true,
    sourcemap: false,
    // ponytail: language packs are lazy-loaded shiki chunks; large files are fine for a desktop app
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom"))
            return "react";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (
            id.includes("node_modules/framer-motion") ||
            id.includes("node_modules/@kumix/ui/dist/components/motion") ||
            id.includes("node_modules/@kumix/ui/dist/components/custom")
          )
            return "motion";
          if (id.includes("node_modules/@kumix") || id.includes("node_modules/@base-ui"))
            return "ui";
        },
      },
    },
  },
  server: {
    port: 8000,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});
