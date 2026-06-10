import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConversationBackupRecord, createConversationBackupRecord } from "../backup/backup-store";
import { bindBackupLibraryPopup, createBackupLibraryPopup } from "../popup/backup-library";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

const popupCss = readFileSync(resolve(process.cwd(), "src/popup/styles.css"), "utf8");

const chatgptSnapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "chatgpt-1",
  title: "ChatGPT backup",
  attachments: [],
  messages: [
    { id: "user-1", role: "user", text: "ChatGPT question" },
    { id: "assistant-1", role: "assistant", text: "ChatGPT answer" }
  ]
};

const deepseekSnapshot: ConversationSnapshot = {
  platformId: "deepseek",
  conversationId: "deepseek-1",
  title: "DeepSeek backup",
  attachments: [],
  messages: [
    { id: "user-1", role: "user", text: "DeepSeek question" }
  ]
};

const file: ExportFile = {
  path: "backup.zip",
  mimeType: "application/zip",
  content: new Uint8Array([1, 2, 3])
};

describe("backup library page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders a structured workbench with summary, platform navigation, list, and preview", () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const deepseek = buildConversationBackupRecord(deepseekSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:05:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([deepseek, chatgpt]);

    expect(root.textContent).toContain("备份库");
    expect(root.querySelector("[data-ai-chat-helper-backup-summary]")?.textContent).toContain("2 个会话");
    expect(root.querySelector("[data-ai-chat-helper-backup-summary]")?.textContent).toContain("2 个版本");
    expect(root.querySelector("[data-ai-chat-helper-backup-platform-nav]")?.textContent).toContain("全部");
    expect(root.textContent).toContain("ChatGPT");
    expect(root.textContent).toContain("通义千问");
    expect(root.textContent).toContain("豆包");
    expect(root.textContent).toContain("DeepSeek");
    expect(root.textContent).toContain("Claude");
    expect(root.textContent).toContain("ChatGPT backup");
    expect(root.textContent).toContain("DeepSeek backup");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-backup-record] span")?.textContent).toContain("DeepSeek · 1 个版本 · 自动 · 1 轮对话");
    expect(root.querySelector("[data-ai-chat-helper-backup-record] span")?.textContent).not.toContain("ZIP · 自动");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("DeepSeek backup");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("1. 用户");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("2. AI 回答");
    expect(root.querySelector(".ai-chat-helper-backup-message header")).toBeFalsy();
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(2);
  });

  it("shows backup detail conversation count by user turns", () => {
    const threadedSnapshot: ConversationSnapshot = {
      ...chatgptSnapshot,
      messages: [
        { id: "user-1", role: "user", text: "Question one" },
        { id: "assistant-1", role: "assistant", text: "Answer one" },
        { id: "user-2", role: "user", text: "Question two" },
        { id: "assistant-2", role: "assistant", text: "Answer two" }
      ]
    };
    const record = buildConversationBackupRecord(threadedSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);
    const detailHead = root.querySelector(".ai-chat-helper-backup-detail__head");

    expect(detailHead?.textContent).toContain("2 轮对话");
    expect(detailHead?.textContent).not.toContain("4 条消息");
  });

  it("does not render the removed backup detail meta strip", () => {
    const record = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);

    expect(root.querySelector(".ai-chat-helper-backup-detail__meta")).toBeFalsy();
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-detail__meta\b/);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__notice\b/);
  });

  it("renders markdown formatting in backup detail message previews", () => {
    const record = buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [{
        id: "assistant-md",
        role: "assistant",
        text: "### 备份小结\n\n- **重点**\n\n`code`"
      }]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);
    const messageText = root.querySelector<HTMLElement>(".ai-chat-helper-backup-message__text")!;

    expect(messageText.innerHTML).toContain("<h3>备份小结</h3>");
    expect(messageText.innerHTML).toContain("<ul>");
    expect(messageText.innerHTML).toContain("<strong>重点</strong>");
    expect(messageText.innerHTML).toContain("<code>code</code>");
  });

  it("selects records and switches platform filters without opening a modal", () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const deepseek = buildConversationBackupRecord(deepseekSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:05:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([deepseek, chatgpt]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [deepseek, chatgpt], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn()
    });

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("DeepSeek backup");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-platform='chatgpt']")?.click();
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(1);
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("ChatGPT backup");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-platform='all']")?.click();
    const chatgptRecordButton = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-record]"))
      .find((button) => button.textContent?.includes("ChatGPT backup"));
    chatgptRecordButton?.click();
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("ChatGPT question");
    expect(root.querySelector("[data-ai-chat-helper-backup-preview]")).toBeFalsy();
  });

  it("groups the same conversation into one row and switches version history", () => {
    const older = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "ChatGPT backup renamed",
      messages: [
        ...chatgptSnapshot.messages,
        { id: "assistant-2", role: "assistant", text: "Newer version answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T11:00:00.000Z",
      source: "manual"
    });
    newer.assetStatus = { cachedImages: 4, failedImages: 0 };
    const root = createBackupLibraryPopup([older, newer]);
    const onDownload = vi.fn();
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload,
      onDelete: vi.fn()
    });

    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(1);
    expect(root.querySelector("[data-ai-chat-helper-backup-summary]")?.textContent).toContain("1 个会话");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).toContain("2 个版本");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).toContain("1 轮对话");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).not.toContain("条");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("版本历史");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Newer version answer");

    const versionTrigger = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]");
    expect(versionTrigger).toBeTruthy();
    expect(versionTrigger?.getAttribute("aria-expanded")).toBe("false");
    expect(versionTrigger?.textContent).toContain("最新");
    expect(versionTrigger?.textContent).toContain("4 张图片已缓存");
    expect(root.querySelector("[data-ai-chat-helper-backup-version-list]")).toBeFalsy();

    versionTrigger?.click();

    const versionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    const versionCards = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version]");
    expect(versionTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(versionCards).toHaveLength(2);
    expect(versionCards[0].dataset.backupId).toBe(newer.id);
    expect(versionCards[1].dataset.backupId).toBe(older.id);
    expect(versionCards[0].textContent).toContain("1 轮对话");
    expect(versionCards[0].textContent).toContain("4 张图片已缓存");
    expect(versionCards[1].textContent).toContain("1 轮对话");
    expect(versionCards[0].textContent).not.toContain("条");

    versionCards[1].click();

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("Newer version answer");
    expect(root.querySelector("[data-ai-chat-helper-backup-version-list]")).toBeFalsy();
    root.querySelector<HTMLButtonElement>(".ai-chat-helper-backup-detail__actions [data-ai-chat-helper-backup-download]")?.click();
    expect(onDownload).toHaveBeenCalledWith(older.id);
  });

  it("renders cached image thumbnails and opens an image viewer", async () => {
    const imageSnapshot: ConversationSnapshot = {
      ...chatgptSnapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "图片消息",
        attachments: [{
          id: "image-1",
          fileName: "preview.png",
          mimeType: "image/png",
          content: "image content"
        }]
      }]
    };
    const record = await createConversationBackupRecord(imageSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([record]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [record], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn()
    });

    const thumbnail = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-image]");
    expect(thumbnail?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2UgY29udGVudA==");
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message__attachments\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(220px,\s*1fr\)\)/);

    thumbnail?.click();

    const viewer = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-image-viewer]");
    expect(viewer?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2UgY29udGVudA==");
    viewer?.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-image-viewer-close]")?.click();
    expect(root.querySelector("[data-ai-chat-helper-backup-image-viewer]")).toBeFalsy();
  });

  it("renders a clickable node rail for backup preview messages", () => {
    const threadedSnapshot: ConversationSnapshot = {
      ...chatgptSnapshot,
      messages: [
        { id: "user-1", role: "user", text: "ChatGPT question" },
        { id: "assistant-1", role: "assistant", text: "ChatGPT answer" },
        { id: "user-2", role: "user", text: "Follow up" },
        { id: "assistant-2", role: "assistant", text: "Follow up answer" }
      ]
    };
    const record = buildConversationBackupRecord(threadedSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([record]);
    document.body.appendChild(root);
    bindBackupLibraryPopup(root, [record], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn()
    });

    const rail = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-rail]");
    const indicator = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-node-indicator]");
    const messageList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message-list]");
    const nodes = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]");
    const messages = root.querySelectorAll<HTMLElement>("[data-ai-chat-helper-backup-message]");
    const scrollTo = vi.fn();
    if (messageList) {
      messageList.scrollTo = scrollTo;
      Object.defineProperty(messageList, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: 100, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
      });
    }
    Object.defineProperty(messages[1], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 340, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
    });
    Object.defineProperty(messages[2], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 118, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
    });
    Object.defineProperty(nodes[1], "offsetTop", {
      configurable: true,
      value: 30
    });
    Object.defineProperty(nodes[2], "offsetTop", {
      configurable: true,
      value: 60
    });

    expect(rail).toBeTruthy();
    expect(indicator).toBeTruthy();
    expect(messageList).toBeTruthy();
    expect(nodes).toHaveLength(4);
    expect(messages).toHaveLength(4);
    expect(nodes[0].classList.contains("ai-chat-helper-backup-message-node--user")).toBe(true);
    expect(nodes[1].classList.contains("ai-chat-helper-backup-message-node--assistant")).toBe(true);
    expect(nodes[0].textContent?.trim()).toBe("1");
    expect(nodes[1].textContent?.trim()).toBe("");
    expect(nodes[2].textContent?.trim()).toBe("2");
    expect(nodes[3].textContent?.trim()).toBe("");
    expect(nodes[1].dataset.threadIndex).toBe("1");
    expect(nodes[3].dataset.threadIndex).toBe("2");
    expect(nodes[1].getAttribute("aria-label")).toBe("定位到第 1 轮 AI 回答");

    nodes[1].click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "smooth" });
    expect(messages[1].classList.contains("is-focused")).toBe(true);
    expect(indicator?.style.getPropertyValue("--ai-chat-helper-backup-node-indicator-y")).toBe("28px");
    expect(indicator?.dataset.activeMessageIndex).toBe("1");

    messageList?.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(nodes[1].classList.contains("is-active")).toBe(false);
    expect(nodes[2].classList.contains("is-active")).toBe(true);
    expect(indicator?.style.getPropertyValue("--ai-chat-helper-backup-node-indicator-y")).toBe("58px");
    expect(indicator?.dataset.activeMessageIndex).toBe("2");
  });

  it("emits download with loading state, custom delete confirmation, and back actions", async () => {
    const record = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([record]);
    const onBack = vi.fn();
    let resolveDownload!: () => void;
    const downloadPromise = new Promise<void>((resolve) => {
      resolveDownload = resolve;
    });
    const onDownload = vi.fn(() => downloadPromise);
    const onDelete = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm");

    bindBackupLibraryPopup(root, [record], { onBack, onDownload, onDelete });

    const downloadButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-download]");
    downloadButton?.click();
    expect(downloadButton?.disabled).toBe(true);
    expect(root.textContent).toContain("正在准备文件");
    resolveDownload();
    await downloadPromise;
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(downloadButton?.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]")?.click();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-delete-confirm]");
    expect(dialog?.textContent).toContain("删除备份");
    expect(dialog?.textContent).toContain("ChatGPT backup");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-cancel]")?.click();
    expect(root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")).toBeFalsy();
    expect(onDelete).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-back]")?.click();

    expect(onDownload).toHaveBeenCalledWith(record.id);
    expect(onDelete).toHaveBeenCalledWith(record.id);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders an empty backup state", () => {
    const root = createBackupLibraryPopup([]);

    expect(root.textContent).toContain("暂无备份");
    expect(root.textContent).toContain("开启自动备份后");
    expect(root.querySelector("[data-ai-chat-helper-backup-record]")).toBeFalsy();
  });

  it("renders an old-backup preview warning when no preview snapshot is stored", () => {
    const record = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("旧备份");
  });

  it("lets backup detail messages fill the available detail height", () => {
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__header\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*auto\) minmax\(0,\s*1fr\);[^}]*gap:\s*12px;[^}]*align-items:\s*center;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__summary\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);[^}]*align-items:\s*stretch;[^}]*gap:\s*8px;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-workbench__summary\s*\{[^}]*repeat\(5/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__title h1\s*\{[^}]*font-size:\s*18px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__messages\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-detail__messages\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-detail__messages\s*\{[^}]*max-height:/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__messages-inner\s*\{[^}]*grid-template-columns:\s*24px minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message-rail\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__message-list\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message-node-indicator\s*\{[^}]*left:\s*50%;[^}]*width:\s*22px;[^}]*height:\s*22px;[^}]*border:\s*3px solid #0ea5e9;[^}]*transform:\s*translateX\(-50%\) translateY\(var\(--ai-chat-helper-backup-node-indicator-y,\s*0px\)\);[^}]*transition:\s*transform \.18s/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message-node\s*\{[^}]*background:\s*#0ea5e9;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-message-node(?:\:hover|:focus-visible|\.is-active)[^{]*\{[^}]*transform:\s*scale/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message--user\s*\{[^}]*width:\s*min\(72%,\s*520px\);[^}]*justify-self:\s*end;[^}]*border-color:\s*#dbe3ee;[^}]*border-radius:\s*14px 14px 4px 14px;[^}]*background:\s*#f1f5f9;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message--assistant\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-message--(?:user|assistant)\s*\{[^}]*inset 3px 0 0/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-message header/);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__version-list\.is-open\s*\{[^}]*animation:\s*ai-chat-helper-backup-version-open/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-detail__version-list\.is-closing\s*\{[^}]*animation:\s*ai-chat-helper-backup-version-close/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-toggle\s*\{[^}]*min-height:\s*40px;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*10px;[^}]*padding:\s*7px 10px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-toggle span\s*\{[^}]*flex:\s*1 1 auto;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-toggle small\s*\{[^}]*flex:\s*none;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;[^}]*padding:\s*7px 9px;/s);
  });

  it("keeps the backup page html and body background unified", () => {
    expect(popupCss).toMatch(/html:has\(body\.ai-chat-helper-backup-page-body\),\s*body\.ai-chat-helper-backup-page-body\s*\{[^}]*background:\s*#f6f8fb;/s);
  });
});
