import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    outDir: "build",
    emptyOutDir: true,
    lib: {
      entry: "src/module.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
