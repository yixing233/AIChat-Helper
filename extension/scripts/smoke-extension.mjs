import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, "..");
const extensionDir = resolve(extensionRoot, "dist");
const userDataDir = mkdtempSync(resolve(tmpdir(), "ai-chat-helper-extension-"));

function findEdgeExecutable() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

async function main() {
  if (!existsSync(resolve(extensionDir, "manifest.json"))) {
    throw new Error(`Missing built extension at ${extensionDir}. Run npm run build first.`);
  }

  const executablePath = findEdgeExecutable();
  if (!executablePath) {
    throw new Error("Microsoft Edge was not found. Set EDGE_PATH to a Chromium-compatible browser executable.");
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--disable-default-apps",
      "--no-first-run"
    ]
  });

  try {
    const page = await context.newPage();
    await page.route("https://chatgpt.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <head><title>Mock ChatGPT</title></head>
            <body>
              <main>
                <article id="turn-1" data-message-author-role="user">Hello from smoke test</article>
                <article id="turn-2" data-message-author-role="assistant">Smoke test response</article>
              </main>
            </body>
          </html>`
      });
    });

    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ai-chat-helper-panel", { timeout: 10000 });

    const platform = await page.locator("html").getAttribute("data-ai-chat-helper-platform");
    const nodeCount = await page.locator(".ai-chat-helper-node").count();
    const panelText = await page.locator("#ai-chat-helper-panel").innerText();

    if (platform !== "chatgpt") {
      throw new Error(`Expected chatgpt platform marker, got ${platform || "missing"}.`);
    }
    if (nodeCount < 2) {
      throw new Error(`Expected at least 2 rendered nodes, got ${nodeCount}.`);
    }
    if (!panelText.includes("AI Chat Helper") || !panelText.includes("ChatGPT")) {
      throw new Error("Extension panel rendered without expected title/platform text.");
    }

    console.log(`Extension smoke passed: platform=${platform}, nodes=${nodeCount}`);
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  rmSync(userDataDir, { recursive: true, force: true });
  process.exit(1);
});
