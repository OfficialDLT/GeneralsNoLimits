import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/.build-tools/**', '**/launcher/web/**'] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
});
