import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build as viteBuild, defineConfig, type Plugin } from "vite";

function finalizeExtensionBundle(): Plugin {
  return {
    name: "finalize-extension-bundle",
    async closeBundle() {
      await buildClassicScript("content/main", "src/content/main.ts", "AIChatHelperContent");
      await buildClassicScript("injected/page-hooks", "src/injected/page-hooks.ts", "AIChatHelperPageHooks");

      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
      cpSync(resolve(__dirname, "public/icons"), resolve(__dirname, "dist/icons"), { recursive: true });
      mkdirSync(resolve(__dirname, "dist/content"), { recursive: true });
      copyFileSync(resolve(__dirname, "src/content/styles.css"), resolve(__dirname, "dist/content/styles.css"));
      mkdirSync(resolve(__dirname, "dist/popup"), { recursive: true });
      copyFileSync(resolve(__dirname, "src/popup/popup.html"), resolve(__dirname, "dist/popup/popup.html"));
      copyFileSync(resolve(__dirname, "src/popup/styles.css"), resolve(__dirname, "dist/popup/styles.css"));
      mkdirSync(resolve(__dirname, "dist/backup"), { recursive: true });
      copyFileSync(resolve(__dirname, "src/backup/backup.html"), resolve(__dirname, "dist/backup/backup.html"));
    }
  };
}

async function buildClassicScript(fileName: string, entry: string, name: string) {
  await viteBuild({
    root: __dirname,
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: true,
      lib: {
        entry: resolve(__dirname, entry),
        formats: ["iife"],
        name,
        fileName: () => `${fileName}.js`
      }
    }
  });
}

export default defineConfig({
  plugins: [finalizeExtensionBundle()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "backup/main": resolve(__dirname, "src/backup/main.ts"),
        "popup/main": resolve(__dirname, "src/popup/main.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
