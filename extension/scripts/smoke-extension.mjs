import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, "..");
const extensionDir = resolve(extensionRoot, "dist");
const userDataDir = mkdtempSync(resolve(tmpdir(), "ai-chat-helper-extension-"));
const downloadsDir = mkdtempSync(resolve(tmpdir(), "ai-chat-helper-downloads-"));
const CLAUDE_ORG_ID = "00000000-0000-4000-8000-000000000001";

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
    acceptDownloads: true,
    downloadsPath: downloadsDir,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--disable-default-apps",
      "--no-first-run"
    ]
  });

  try {
    const page = await context.newPage();
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        console.warn(`[page:${message.type()}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      console.warn(`[page:error] ${error.message}`);
    });
    await installMockRoutes(page);
    await installQwenApiRoutes(page);

    for (const platformCase of platformCases) {
      await page.goto(platformCase.url, { waitUntil: "domcontentloaded" });
      await assertPanel(page, platformCase.id, platformCase.name);
      await assertToggleVisibility(page, platformCase);
      if (platformCase.id === "chatgpt") {
        await assertCurrentHtmlExport(page, context);
        await assertBatchZipExport(page, context, 2);
      }
      if (platformCase.id === "claude") {
        await assertBatchZipExport(page, context, 2);
      }
      if (platformCase.id === "qwen") {
        await assertBatchZipExport(page, context, 2);
      }
      if (platformCase.id === "doubao") {
        await assertBatchZipExport(page, context, 2);
      }
      if (platformCase.id === "deepseek") {
        await assertBatchZipExport(page, context, 2);
      }
    }

    console.log(`Extension smoke passed: ${platformCases.map((item) => item.id).join(", ")} panels rendered; ChatGPT HTML plus all supported batch ZIP exports verified`);
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(downloadsDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(downloadsDir, { recursive: true, force: true });
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
    headers: { "set-cookie": `lastActiveOrg=${CLAUDE_ORG_ID}; Path=/; SameSite=Lax` },
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
      if (platformCase.id === "chatgpt" && await fulfillChatGptApiRoute(route)) return;
      if (platformCase.id === "claude" && await fulfillClaudeApiRoute(route)) return;
      if (platformCase.id === "doubao" && await fulfillDoubaoApiRoute(route)) return;
      if (platformCase.id === "deepseek" && await fulfillDeepSeekApiRoute(route)) return;

      await route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: platformCase.headers || {},
        body: platformCase.body
      });
    });
  }
}

async function installQwenApiRoutes(page) {
  await page.route("https://chat2-api.qianwen.com/**", async (route) => {
    if (await fulfillQwenApiRoute(route)) return;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: qwenCorsHeaders(),
      body: JSON.stringify({ error: "Unhandled Qwen smoke route" })
    });
  });
}

async function fulfillQwenApiRoute(route) {
  const request = route.request();
  const url = new URL(request.url());

  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: qwenCorsHeaders()
    });
    return true;
  }

  if (url.pathname === "/api/v2/session/page/list") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: qwenCorsHeaders(),
      body: JSON.stringify({
        data: {
          list: [
            {
              session_id: "qwen-batch-1",
              title: "Qwen Smoke One",
              modifiedTime: "2026-06-08T03:00:00Z",
              message_count: 2
            },
            {
              session_id: "qwen-batch-2",
              title: "Qwen Smoke Two",
              modifiedTime: "2026-06-08T03:00:01Z",
              message_count: 2
            }
          ]
        }
      })
    });
    return true;
  }

  if (url.pathname === "/api/v1/session/msg/list") {
    const id = url.searchParams.get("session_id") || "qwen-batch-1";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: qwenCorsHeaders(),
      body: JSON.stringify(qwenConversationPayload(id, id === "qwen-batch-2" ? "Qwen Smoke Two" : "Qwen Smoke One"))
    });
    return true;
  }

  return false;
}

function qwenCorsHeaders() {
  return {
    "access-control-allow-origin": "https://www.qianwen.com",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-platform"
  };
}

async function fulfillDoubaoApiRoute(route) {
  const url = new URL(route.request().url());

  if (url.pathname === "/im/chain/recent_conv") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        downlink_body: {
          pull_recent_conv_chain_downlink_body: {
            conversation_list: [
              {
                conversation_id: "doubao-batch-1",
                title: "Doubao Smoke One",
                updated_at: 1780000001000,
                message_count: 2
              },
              {
                conversation_id: "doubao-batch-2",
                title: "Doubao Smoke Two",
                updated_at: 1780000002000,
                message_count: 2
              }
            ]
          }
        }
      })
    });
    return true;
  }

  if (url.pathname === "/im/chain/single") {
    const id = extractJsonConversationId(route.request().postData()) || "doubao-batch-1";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(doubaoConversationPayload(id, id === "doubao-batch-2" ? "Doubao Smoke Two" : "Doubao Smoke One"))
    });
    return true;
  }

  return false;
}

async function fulfillDeepSeekApiRoute(route) {
  const url = new URL(route.request().url());

  if (url.pathname === "/api/v0/chat_session/fetch_page") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          biz_data: {
            chat_sessions: [
              {
                id: "deepseek-batch-1",
                title: "DeepSeek Smoke One",
                updated_at: "2026-06-08T02:00:05Z",
                message_count: 2
              },
              {
                id: "deepseek-batch-2",
                title: "DeepSeek Smoke Two",
                updated_at: "2026-06-08T02:00:06Z",
                message_count: 2
              }
            ]
          }
        }
      })
    });
    return true;
  }

  if (url.pathname === "/api/v0/chat/history_messages") {
    const id = url.searchParams.get("chat_session_id") || "deepseek-batch-1";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deepSeekConversationPayload(id, id === "deepseek-batch-2" ? "DeepSeek Smoke Two" : "DeepSeek Smoke One"))
    });
    return true;
  }

  return false;
}

async function fulfillClaudeApiRoute(route) {
  const url = new URL(route.request().url());

  if (url.pathname === `/api/organizations/${CLAUDE_ORG_ID}/chat_conversations_v2`) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            uuid: "claude-batch-1",
            name: "Claude Smoke One",
            updated_at: "2026-06-08T01:00:03Z",
            chat_messages_count: 2
          },
          {
            uuid: "claude-batch-2",
            name: "Claude Smoke Two",
            updated_at: "2026-06-08T01:00:04Z",
            chat_messages_count: 2
          }
        ]
      })
    });
    return true;
  }

  const detailMatch = url.pathname.match(new RegExp(`^/api/organizations/${CLAUDE_ORG_ID}/chat_conversations/([^/]+)$`));
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(claudeConversationPayload(id, id === "claude-batch-2" ? "Claude Smoke Two" : "Claude Smoke One"))
    });
    return true;
  }

  return false;
}

async function fulfillChatGptApiRoute(route) {
  const url = new URL(route.request().url());

  if (url.pathname === "/backend-api/conversations") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { id: "batch-1", title: "Smoke Batch One", update_time: 1780000000 },
          { id: "batch-2", title: "Smoke Batch Two", update_time: 1780000001 }
        ]
      })
    });
    return true;
  }

  const conversationMatch = url.pathname.match(/^\/backend-api\/conversation\/([^/]+)$/);
  if (conversationMatch) {
    const id = decodeURIComponent(conversationMatch[1]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(chatGptConversationPayload(id, id === "batch-2" ? "Smoke Batch Two" : "Smoke Batch One"))
    });
    return true;
  }

  return false;
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

async function assertCurrentHtmlExport(page, context) {
  const existingDownloadIds = await getChromeDownloadIds(context);
  await page.locator("[data-ai-chat-helper-export]").click();
  await page.waitForSelector("#ai-chat-helper-export-modal", { timeout: 10000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.locator("#ai-chat-helper-export-modal [data-format='html']").click();
  try {
    await page.waitForFunction(() => {
      const status = document.querySelector("[data-ai-chat-helper-status]");
      return status?.textContent?.includes("Current conversation export started.");
    }, null, { timeout: 10000 });
  } catch (error) {
    const statusText = await page.locator("[data-ai-chat-helper-status]").innerText().catch(() => "");
    throw new Error(`Current HTML export did not report success. Status: ${statusText || "empty"}`);
  }

  const download = await downloadPromise;
  if (download) {
    const suggestedName = download.suggestedFilename();
    if (!suggestedName.endsWith(".html")) {
      throw new Error(`Expected an HTML download, got ${suggestedName}.`);
    }
    return;
  }

  const chromeDownload = await findLatestHtmlChromeDownload(context, existingDownloadIds);
  if (!chromeDownload) {
    throw new Error("Current HTML export reported success but no completed Chrome HTML download record was observed.");
  }
}

async function assertBatchZipExport(page, context, expectedCount) {
  const existingDownloadIds = await getChromeDownloadIds(context);
  await page.locator("[data-ai-chat-helper-batch-export]").click();
  try {
    await page.waitForFunction((count) => {
      return document.querySelectorAll("[data-ai-chat-helper-batch-item]:checked").length === count;
    }, expectedCount, { timeout: 10000 });
  } catch (error) {
    const modalText = await page.locator("#ai-chat-helper-export-modal").innerText().catch(() => "");
    const selectedBatchItems = await page.locator("[data-ai-chat-helper-batch-item]:checked").count();
    throw new Error(`Expected ${expectedCount} selected batch conversations, got ${selectedBatchItems}. Modal: ${modalText || "missing"}`);
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await page.locator("#ai-chat-helper-export-modal [data-format='zip']").click();
  try {
    await page.waitForFunction((count) => {
      const status = document.querySelector("[data-ai-chat-helper-status]");
      return status?.textContent?.includes(`Batch export started for ${count} conversations.`);
    }, expectedCount, { timeout: 10000 });
  } catch (error) {
    const statusText = await page.locator("[data-ai-chat-helper-status]").innerText().catch(() => "");
    throw new Error(`Batch ZIP export did not report success. Status: ${statusText || "empty"}`);
  }

  const download = await downloadPromise;
  if (download) {
    const suggestedName = download.suggestedFilename();
    if (!suggestedName.endsWith(".zip")) {
      throw new Error(`Expected a ZIP download, got ${suggestedName}.`);
    }
    return;
  }

  const chromeDownload = await findLatestChromeDownload(context, "application/zip", "data:application/zip", existingDownloadIds);
  if (!chromeDownload) {
    throw new Error("Batch ZIP export reported success but no completed Chrome ZIP download record was observed.");
  }
}

async function findLatestHtmlChromeDownload(context, excludedIds = new Set()) {
  return findLatestChromeDownload(context, "text/html", "data:text/html", excludedIds);
}

async function findLatestChromeDownload(context, expectedMime, expectedUrlPrefix, excludedIds = new Set()) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const downloads = await searchChromeDownloads(context);
    const matchedDownload = downloads.find((item) => {
      const mime = String(item.mime || "").toLowerCase();
      const url = String(item.finalUrl || item.url || "").toLowerCase();
      return !excludedIds.has(item.id) && item.state === "complete" && (mime.includes(expectedMime) || url.startsWith(expectedUrlPrefix));
    });
    if (matchedDownload) return matchedDownload;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function getChromeDownloadIds(context) {
  const downloads = await searchChromeDownloads(context);
  return new Set(downloads.map((item) => item.id));
}

async function searchChromeDownloads(context) {
  const worker = await getExtensionServiceWorker(context);
  return worker.evaluate(() => new Promise((resolve) => {
    chrome.downloads.search({ limit: 20, orderBy: ["-startTime"] }, resolve);
  }));
}

async function getExtensionServiceWorker(context) {
  const existing = context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://"));
  if (existing) return existing;

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const worker = context.serviceWorkers().find((item) => item.url().startsWith("chrome-extension://"));
    if (worker) return worker;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Extension service worker was not available for download inspection.");
}

function mockPage(title, body) {
  return `<!doctype html>
    <html>
      <head><title>${title}</title></head>
      <body><main>${body}</main></body>
    </html>`;
}

function chatGptConversationPayload(id, title) {
  return {
    id,
    title,
    current_node: `${id}-assistant`,
    create_time: 1780000000,
    update_time: 1780000001,
    mapping: {
      "client-created-root": {
        id: "client-created-root",
        parent: null,
        children: [`${id}-user`]
      },
      [`${id}-user`]: {
        id: `${id}-user`,
        parent: "client-created-root",
        children: [`${id}-assistant`],
        message: {
          id: `${id}-user-message`,
          author: { role: "user" },
          content: { parts: [`Question for ${title}`] },
          create_time: 1780000000
        }
      },
      [`${id}-assistant`]: {
        id: `${id}-assistant`,
        parent: `${id}-user`,
        children: [],
        message: {
          id: `${id}-assistant-message`,
          author: { role: "assistant" },
          content: { parts: [`Answer for ${title}`] },
          create_time: 1780000001
        }
      }
    }
  };
}

function qwenConversationPayload(id, title) {
  return {
    data: {
      list: [
        {
          req_id: `${id}-request`,
          session_id: id,
          request_messages: [
            {
              content: `[(think_1)] Question for ${title}`,
              resource_infos: [{ file_name: `${id}.txt` }]
            }
          ],
          response_messages: [
            { mime_type: "text/plain", content: `Answer for ${title}` },
            { mime_type: "bar/progress", content: "ignore me" }
          ]
        }
      ]
    }
  };
}

function doubaoConversationPayload(id, title) {
  return {
    status_code: 0,
    downlink_body: {
      pull_singe_chain_downlink_body: {
        messages: [
          {
            message_id: `${id}-user`,
            user_type: 1,
            index_in_conv: 1,
            create_time: 1780000000,
            tts_content: `Question for ${title}`,
            content: JSON.stringify({
              entities: [
                { entity_content: { file: { file_name: `${id}.pdf` } } }
              ]
            })
          },
          {
            message_id: `${id}-assistant`,
            user_type: 2,
            index_in_conv: 2,
            create_time: 1780000001,
            content_block: [
              { content: { text_block: { text: `Answer for ${title}` } } },
              { content: { reference_block: { text: { text: "Smoke reference" } } } }
            ]
          }
        ]
      }
    }
  };
}

function claudeConversationPayload(id, title) {
  return {
    uuid: id,
    name: title,
    updated_at: "2026-06-08T01:00:04Z",
    chat_messages: [
      {
        uuid: `${id}-human`,
        sender: "human",
        created_at: "2026-06-08T01:00:00Z",
        content: [{ type: "text", text: `Question for ${title}` }]
      },
      {
        uuid: `${id}-assistant`,
        sender: "assistant",
        created_at: "2026-06-08T01:00:03Z",
        content: [{ type: "text", text: `Answer for ${title}` }]
      }
    ]
  };
}

function extractJsonConversationId(text) {
  if (!text) return "";
  try {
    const payload = JSON.parse(text);
    return String(payload?.uplink_body?.pull_singe_chain_uplink_body?.conversation_id || "");
  } catch {
    return "";
  }
}

function deepSeekConversationPayload(id, title) {
  return {
    data: {
      biz_data: {
        chat_session: {
          id,
          title,
          inserted_at: "2026-06-08T02:00:00Z",
          updated_at: "2026-06-08T02:00:05Z"
        },
        chat_messages: [
          {
            message_id: `${id}-request`,
            fragments: [
              {
                id: `${id}-request-fragment`,
                type: "REQUEST",
                content: `Question for ${title}`
              }
            ]
          },
          {
            message_id: `${id}-assistant`,
            role: "ASSISTANT",
            fragments: [
              {
                id: `${id}-think-fragment`,
                type: "THINK",
                content: `Thinking about ${title}`
              },
              {
                id: `${id}-response-fragment`,
                type: "RESPONSE",
                content: `Answer for ${title} [citation:1]`
              },
              {
                id: `${id}-search-fragment`,
                type: "SEARCH",
                results: [
                  {
                    cite_index: 1,
                    title: "Smoke Source",
                    url: "https://example.com/deepseek-smoke"
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };
}
