import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function copyStaticExtensionFiles() {
  return {
    name: "copy-static-extension-files",
    closeBundle() {
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
      cpSync(resolve(__dirname, "public/icons"), resolve(__dirname, "dist/icons"), { recursive: true });
      mkdirSync(resolve(__dirname, "dist/content"), { recursive: true });
      copyFileSync(resolve(__dirname, "src/content/styles.css"), resolve(__dirname, "dist/content/styles.css"));
    }
  };
}

export default defineConfig({
  plugins: [copyStaticExtensionFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/main": resolve(__dirname, "src/content/main.ts"),
        "injected/page-hooks": resolve(__dirname, "src/injected/page-hooks.ts"),
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
