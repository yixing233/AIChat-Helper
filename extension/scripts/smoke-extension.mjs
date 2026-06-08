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
    await installMockRoutes(page);

    for (const platformCase of platformCases) {
      await page.goto(platformCase.url, { waitUntil: "domcontentloaded" });
      await assertPanel(page, platformCase.id, platformCase.name);
      await assertToggleVisibility(page, platformCase);
    }

    console.log(`Extension smoke passed: ${platformCases.map((item) => item.id).join(", ")} panels rendered`);
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

const platformCases = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    route: "https://chatgpt.com/**",
    body: mockPage("Mock ChatGPT", `
      <article id="turn-1" data-message-author-role="user">Hello from smoke test</article>
      <article id="turn-2" data-message-author-role="assistant">Smoke test response</article>
    `)
  },
  {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai/chat/00000000-0000-0000-0000-000000000000",
    route: "https://claude.ai/**",
    body: mockPage("Mock Claude", `
      <article data-testid="user-message">Claude smoke question</article>
      <article data-testid="assistant-message">Claude smoke answer</article>
    `)
  },
  {
    id: "qwen",
    name: "Tongyi Qianwen",
    url: "https://www.qianwen.com/chat/smoketest01",
    route: "https://www.qianwen.com/**",
    expectedToggle: "[data-ai-chat-helper-remove-qwen-ads]",
    body: mockPage("Mock Qwen", `
      <article class="message">Qwen smoke question</article>
      <article class="message">Qwen smoke answer</article>
      <section data-c="result_card">Sponsored result</section>
    `)
  },
  {
    id: "doubao",
    name: "Doubao",
    url: "https://www.doubao.com/chat/smoketest",
    route: "https://www.doubao.com/**",
    body: mockPage("Mock Doubao", `
      <article class="message">Doubao smoke question</article>
      <article class="message">Doubao smoke answer</article>
    `)
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/chat",
    route: "https://chat.deepseek.com/**",
    expectedToggle: "[data-ai-chat-helper-hide-deepseek-native-nav]",
    body: mockPage("Mock DeepSeek", `
      <article class="message">DeepSeek smoke question</article>
      <article class="message">DeepSeek smoke answer</article>
      <nav class="_189b4a0"><div class="ds-virtual-list">Native navigation</div></nav>
    `)
  }
];

async function installMockRoutes(page) {
  for (const platformCase of platformCases) {
    await page.route(platformCase.route, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: platformCase.body
      });
    });
  }
}

async function assertPanel(page, expectedPlatform, expectedName) {
  await page.waitForSelector("#ai-chat-helper-panel", { timeout: 10000 });

  const platform = await page.locator("html").getAttribute("data-ai-chat-helper-platform");
  const nodeCount = await page.locator(".ai-chat-helper-node").count();
  const panelText = await page.locator("#ai-chat-helper-panel").innerText();

  if (platform !== expectedPlatform) {
    throw new Error(`Expected ${expectedPlatform} platform marker, got ${platform || "missing"}.`);
  }
  if (nodeCount < 2) {
    throw new Error(`Expected at least 2 rendered nodes for ${expectedPlatform}, got ${nodeCount}.`);
  }
  if (!panelText.includes("AI Chat Helper") || !panelText.includes(expectedName)) {
    throw new Error(`${expectedPlatform} panel rendered without expected title/platform text.`);
  }
}

async function assertToggleVisibility(page, platformCase) {
  const platformToggleSelectors = [
    "[data-ai-chat-helper-remove-qwen-ads]",
    "[data-ai-chat-helper-hide-deepseek-native-nav]"
  ];

  for (const selector of platformToggleSelectors) {
    const count = await page.locator(selector).count();
    if (selector === platformCase.expectedToggle) {
      if (!count) throw new Error(`${platformCase.id} panel did not render expected platform toggle ${selector}.`);
    } else if (count) {
      throw new Error(`${platformCase.id} panel unexpectedly rendered platform toggle ${selector}.`);
    }
  }
}

function mockPage(title, body) {
  return `<!doctype html>
    <html>
      <head><title>${title}</title></head>
      <body><main>${body}</main></body>
    </html>`;
}
