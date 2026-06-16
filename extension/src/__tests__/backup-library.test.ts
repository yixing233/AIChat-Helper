import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConversationBackupRecord, createConversationBackupRecord } from "../backup/backup-store";
import { bindBackupLibraryPopup, createBackupLibraryPopup } from "../popup/backup-library";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

const popupCss = readFileSync(resolve(process.cwd(), "src/popup/styles.css"), "utf8");

async function waitForDialogClose(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 240));
}

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
    const header = root.querySelector(".ai-chat-helper-backup-workbench__header");
    const title = root.querySelector(".ai-chat-helper-backup-workbench__title");
    const brandIcon = title?.querySelector<HTMLImageElement>(".ai-chat-helper-backup-workbench__brand img");
    const summaryBar = root.querySelector(".ai-chat-helper-backup-workbench__summary-bar");
    const summary = root.querySelector("[data-ai-chat-helper-backup-summary]");
    const search = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-search]");

    expect(root.textContent).toContain("备份库");
    expect(header?.children).toHaveLength(2);
    expect(title?.querySelector(".ai-chat-helper-backup-workbench__brand")).toBeTruthy();
    expect(brandIcon?.getAttribute("src")).toBe("chrome-extension://test/icons/icon32.png");
    expect(title?.textContent).not.toContain("按平台查看自动备份");
    expect(summaryBar).toBeTruthy();
    expect(summary?.textContent).toContain("占用");
    expect(summary?.textContent).not.toContain("会话");
    expect(summary?.textContent).not.toContain("版本");
    expect(summaryBar?.textContent).not.toContain("状态");
    expect(summaryBar?.textContent).not.toContain("就绪");
    expect(search?.getAttribute("placeholder")).toContain("搜索");
    expect(root.textContent).toContain("ChatGPT");
    expect(root.textContent).toContain("通义千问");
    expect(root.textContent).toContain("豆包");
    expect(root.textContent).toContain("DeepSeek");
    expect(root.textContent).toContain("Claude");
    expect(root.textContent).toContain("DeepSeek backup");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-backup-record] span")?.textContent).toContain("DeepSeek · 1 个版本 · 自动 · 1 轮对话");
    expect(root.querySelector("[data-ai-chat-helper-backup-record] span")?.textContent).not.toContain("ZIP · 自动");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("DeepSeek backup");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("1. 用户");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("2. AI 回答");
    expect(root.querySelector(".ai-chat-helper-backup-message header")).toBeFalsy();
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(1);
    expect(root.querySelector("[data-ai-chat-helper-backup-platform='deepseek']")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("filters backup conversations through the workbench search box", () => {
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

    const search = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-search]");
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-platform='chatgpt']")?.click();
    expect(search).toBeTruthy();
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(1);

    search!.value = "question";
    search!.dispatchEvent(new Event("input", { bubbles: true }));

    const records = Array.from(root.querySelectorAll("[data-ai-chat-helper-backup-record]"));
    expect(records).toHaveLength(1);
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).toContain("ChatGPT backup");
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).not.toContain("DeepSeek backup");
  });

  it("keeps the backup search input focused while filtering", () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([chatgpt]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [chatgpt], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn()
    });

    const search = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-search]");
    expect(search).toBeTruthy();

    search!.focus();
    search!.value = "q";
    search!.setSelectionRange(1, 1);
    search!.dispatchEvent(new Event("input", { bubbles: true }));

    const updatedSearch = root.querySelector<HTMLInputElement>("[data-ai-chat-helper-backup-search]");
    expect(updatedSearch).toBeTruthy();
    expect(document.activeElement).toBe(updatedSearch);
    expect(updatedSearch?.value).toBe("q");
    expect(updatedSearch?.selectionStart).toBe(1);
    expect(updatedSearch?.selectionEnd).toBe(1);
  });

  it("clears the detail panel when switching to a platform without backups", () => {
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

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-platform='qwen']")?.click();

    expect(root.querySelector("[data-ai-chat-helper-backup-list]")?.textContent).toContain("通义千问暂无备份");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent || "").toContain("请选择一个备份查看预览");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("DeepSeek backup");
  });

  it("shows platform icons in the backup platform navigation", () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([chatgpt]);

    const chatgptButton = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-platform='chatgpt']");

    expect(chatgptButton?.querySelector("[data-ai-chat-helper-backup-platform-icon='chatgpt']")).toBeTruthy();
    expect(chatgptButton?.querySelector("img")?.getAttribute("src")).toBe("chrome-extension://test/icons/platforms/chatgpt.svg");
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-platform__icon\b/);
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

  it("centers block math in backup detail previews without changing inline math flow", () => {
    const record = buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [{
        id: "assistant-math",
        role: "assistant",
        text: "行内公式 \\(F=ma\\)\n\n$$F=\\frac{B^2A}{2\\mu}$$"
      }]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);
    const messageText = root.querySelector<HTMLElement>(".ai-chat-helper-backup-message__text")!;

    expect(messageText.innerHTML).toContain('class="math-inline math-rendered"');
    expect(messageText.innerHTML).toContain('class="math-display math-rendered"');
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message__text \.math-display\s*\{[\s\S]*text-align:\s*center;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-message__text \.math-inline\.math-rendered\s*\{[\s\S]*display:\s*inline-flex;/s);
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
    newer.assetStatus = { totalImages: 4, cachedImages: 4, failedImages: 0 };
    const root = createBackupLibraryPopup([older, newer]);
    const onDownload = vi.fn();
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload,
      onDelete: vi.fn()
    });

    expect(root.querySelectorAll("[data-ai-chat-helper-backup-record]")).toHaveLength(1);
    expect(root.querySelector("[data-ai-chat-helper-backup-summary]")?.textContent).toContain("占用");
    expect(root.querySelector("[data-ai-chat-helper-backup-summary]")?.textContent).not.toContain("1 个会话");
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
    const versionDeleteButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    expect(versionTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(versionCards).toHaveLength(2);
    expect(versionDeleteButtons).toHaveLength(2);
    expect(versionDeleteButtons[0].dataset.backupId).toBe(newer.id);
    expect(versionDeleteButtons[1].dataset.backupId).toBe(older.id);
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

  it("opens version management from detail actions and bulk deletes selected versions", async () => {
    const oldest = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "ChatGPT backup oldest",
      messages: [
        { id: "user-1", role: "user", text: "Question one" },
        { id: "assistant-1", role: "assistant", text: "Answer one" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "ChatGPT backup newer",
      messages: [
        { id: "user-1", role: "user", text: "Question two" },
        { id: "assistant-1", role: "assistant", text: "Answer two" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "manual"
    });
    const latest = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "ChatGPT backup latest",
      messages: [
        { id: "user-1", role: "user", text: "Question three" },
        { id: "assistant-1", role: "assistant", text: "Answer three" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T11:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([oldest, newer, latest]);
    const onDelete = vi.fn(async () => undefined);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [oldest, newer, latest], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete
    });

    const manageButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manage]");
    expect(manageButton).toBeTruthy();

    manageButton?.click();

    const dialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-manager]");
    const selectAll = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-select-all]");
    const bulkDelete = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]");
    expect(dialog?.textContent).toContain("历史版本");
    expect(dialog?.textContent).toContain("3 个版本");
    expect(dialog?.textContent).toContain("Answer three");
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-version-manager-item]")).toHaveLength(3);
    expect(bulkDelete?.disabled).toBe(true);

    selectAll?.click();

    const checkedItems = root.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-backup-version-manager-checkbox]:checked");
    const updatedBulkDelete = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]");
    expect(checkedItems).toHaveLength(3);
    expect(updatedBulkDelete?.disabled).toBe(false);
    expect(updatedBulkDelete?.textContent).toContain("批量删除");
    expect(updatedBulkDelete?.textContent).toContain("3");

    updatedBulkDelete?.click();

    const confirmDialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-delete-confirm]");
    expect(confirmDialog?.textContent).toContain("删除 3 个备份版本");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await waitForDialogClose();

    expect(onDelete).toHaveBeenCalledTimes(3);
    expect(onDelete).toHaveBeenNthCalledWith(1, latest.id);
    expect(onDelete).toHaveBeenNthCalledWith(2, newer.id);
    expect(onDelete).toHaveBeenNthCalledWith(3, oldest.id);
    expect(root.querySelector("[data-ai-chat-helper-backup-version-manager]")).toBeFalsy();
    expect(root.textContent).toContain("暂无备份");
    expect(root.textContent).toContain("开启自动备份后");
  });

  it("keeps the version manager dialog mounted while toggling selections", () => {
    const older = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "Older backup",
      messages: [
        { id: "user-1", role: "user", text: "Older question" },
        { id: "assistant-1", role: "assistant", text: "Older answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "Newer backup",
      messages: [
        { id: "user-1", role: "user", text: "Newer question" },
        { id: "assistant-1", role: "assistant", text: "Newer answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T11:00:00.000Z",
      source: "manual"
    });
    const root = createBackupLibraryPopup([older, newer]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn()
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manage]")?.click();

    const dialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-manager]");
    const firstToggle = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-toggle]");
    expect(dialog).toBeTruthy();
    expect(firstToggle).toBeTruthy();

    firstToggle?.click();

    const updatedDialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-manager]");
    expect(updatedDialog).toBe(dialog);
    expect(updatedDialog?.querySelectorAll("[data-ai-chat-helper-backup-version-manager-checkbox]:checked")).toHaveLength(1);
  });

  it("deletes a version from the dropdown list through its inline delete button", async () => {
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
    const root = createBackupLibraryPopup([older, newer]);
    const onDelete = vi.fn(async () => undefined);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]")[1]?.click();

    const confirmDialog = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-delete-confirm]");
    expect(confirmDialog?.textContent).toContain("删除备份");
    expect(confirmDialog?.textContent).toContain("ChatGPT backup");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(older.id);
  });

  it("keeps the version dropdown open with local loading feedback while deleting a version", async () => {
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
    let resolveDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const onDelete = vi.fn(() => deletePromise);
    const root = createBackupLibraryPopup([older, newer]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    const deleteButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    deleteButtons[1]?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();

    const updatedDeleteButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    const versionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(older.id);
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(updatedDeleteButtons).toHaveLength(2);
    expect(updatedDeleteButtons[1]?.disabled).toBe(true);
    expect(updatedDeleteButtons[1]?.getAttribute("aria-busy")).toBe("true");
    expect(updatedDeleteButtons[1]?.querySelector(".ai-chat-helper-backup-version-delete-spinner")).toBeTruthy();
    expect(updatedDeleteButtons[1]?.closest(".ai-chat-helper-backup-version-row")?.textContent).toContain("正在删除");
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-delete-spinner\s*\{[^}]*border-top-color:\s*#2563eb;[^}]*animation:\s*ai-chat-helper-popup-spin/s);

    resolveDelete();
    await deletePromise;
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const remainingDeleteButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    const remainingVersionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    expect(remainingVersionList).toBeTruthy();
    expect(remainingDeleteButtons).toHaveLength(1);
    expect(remainingDeleteButtons[0]?.dataset.backupId).toBe(newer.id);
  });

  it("keeps the same conversation selected and the version dropdown open after deleting a history version", async () => {
    const firstConversation = buildConversationBackupRecord({
      ...chatgptSnapshot,
      conversationId: "chatgpt-first",
      title: "First conversation",
      messages: [
        { id: "user-first", role: "user", text: "First question" },
        { id: "assistant-first", role: "assistant", text: "First answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T12:00:00.000Z",
      source: "auto"
    });
    const thirdOlder = buildConversationBackupRecord({
      ...chatgptSnapshot,
      conversationId: "chatgpt-third",
      title: "Third conversation",
      messages: [
        { id: "user-third-older", role: "user", text: "Third older question" },
        { id: "assistant-third-older", role: "assistant", text: "Third older answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T09:00:00.000Z",
      source: "auto"
    });
    const thirdNewer = buildConversationBackupRecord({
      ...chatgptSnapshot,
      conversationId: "chatgpt-third",
      title: "Third conversation",
      messages: [
        { id: "user-third-newer", role: "user", text: "Third newer question" },
        { id: "assistant-third-newer", role: "assistant", text: "Third newer answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T11:00:00.000Z",
      source: "manual"
    });
    const root = createBackupLibraryPopup([firstConversation, thirdOlder, thirdNewer]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [firstConversation, thirdOlder, thirdNewer], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn(async () => undefined)
    });

    const recordButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-record]");
    recordButtons[1]?.click();

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Third newer answer");
    expect(root.querySelector<HTMLElement>(`[data-backup-row="${thirdNewer.platformId}::${thirdNewer.conversationId}"]`)?.classList.contains("is-selected")).toBe(true);

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]")[1]?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const versionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(root.querySelector<HTMLElement>(`[data-backup-row="${thirdNewer.platformId}::${thirdNewer.conversationId}"]`)?.classList.contains("is-selected")).toBe(true);
    expect(root.querySelector<HTMLElement>(`[data-backup-row="${firstConversation.platformId}::${firstConversation.conversationId}"]`)?.classList.contains("is-selected")).toBe(false);
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Third newer answer");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("First answer");
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-version-delete]")).toHaveLength(1);
  });

  it("keeps a long version dropdown open after deleting one history version from the middle", async () => {
    const versions = [
      { createdAt: "2026-06-14T00:05:00.000Z", answer: "Version 1 answer" },
      { createdAt: "2026-06-14T00:21:00.000Z", answer: "Version 2 answer" },
      { createdAt: "2026-06-14T00:27:00.000Z", answer: "Version 3 answer" },
      { createdAt: "2026-06-14T01:34:00.000Z", answer: "Version 4 answer" },
      { createdAt: "2026-06-14T13:58:00.000Z", answer: "Latest version answer" }
    ].map((item, index) => buildConversationBackupRecord({
      ...chatgptSnapshot,
      conversationId: "chatgpt-long-history",
      title: "Long history conversation",
      messages: [
        { id: `user-${index + 1}`, role: "user", text: `Question ${index + 1}` },
        { id: `assistant-${index + 1}`, role: "assistant", text: item.answer }
      ]
    }, "zip", [file], {
      createdAt: item.createdAt,
      source: "auto"
    }));
    const targetDeleteRecord = versions[2];
    const root = createBackupLibraryPopup(versions);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, versions, {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn(async () => undefined)
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    const deleteButton = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]"))
      .find((button) => button.dataset.backupId === targetDeleteRecord.id);
    expect(deleteButton).toBeTruthy();

    deleteButton?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const versionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    const remainingDeleteButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]");
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.getAttribute("aria-expanded")).toBe("true");
    expect(remainingDeleteButtons).toHaveLength(4);
    expect(Array.from(remainingDeleteButtons).some((button) => button.dataset.backupId === targetDeleteRecord.id)).toBe(false);
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Latest version answer");
  });

  it("switches detail preview to the newest remaining version after deleting the selected version", async () => {
    const older = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "Older backup",
      messages: [
        { id: "user-1", role: "user", text: "Older question" },
        { id: "assistant-1", role: "assistant", text: "Older answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const newer = buildConversationBackupRecord({
      ...chatgptSnapshot,
      title: "Newer backup",
      messages: [
        { id: "user-1", role: "user", text: "Newer question" },
        { id: "assistant-1", role: "assistant", text: "Newer answer" }
      ]
    }, "zip", [file], {
      createdAt: "2026-06-09T11:00:00.000Z",
      source: "manual"
    });
    const root = createBackupLibraryPopup([older, newer]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [older, newer], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn(async () => undefined)
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version]")[1]?.click();

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Older answer");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("Newer answer");

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manage]")?.click();
    root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-toggle]")[1]?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-manager-delete]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await waitForDialogClose();

    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("Newer answer");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).not.toContain("Older answer");
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")?.textContent).toContain("1 个版本");
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
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-image\s*\{[^}]*min-height:\s*160px;[^}]*max-height:\s*min\(320px,\s*44dvh\);[^}]*overflow:\s*hidden;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-image\s*\{[^}]*aspect-ratio:\s*4 \/ 3;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-image img\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*max-height:\s*min\(320px,\s*44dvh\);[^}]*object-fit:\s*contain;/s);

    thumbnail?.click();

    const viewer = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-image-viewer]");
    expect(viewer?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2UgY29udGVudA==");
    viewer?.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-image-viewer-close]")?.click();
    await waitForDialogClose();
    expect(root.querySelector("[data-ai-chat-helper-backup-image-viewer]")).toBeFalsy();
  });

  it("opens a pasted text attachment preview from backup detail messages", () => {
    const record = buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [{
        id: "user-paste",
        role: "user",
        text: "请查看这个文本附件\n\n[附件1: 粘贴的文本 (1).txt]",
        attachments: [{
          id: "file-text-1",
          fileName: "粘贴的文本 (1).txt",
          mimeType: "text/plain",
          content: "第一行\n第二行\n第三行"
        }]
      }]
    }, "zip", [file], {
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

    const attachmentButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-text-attachment]");
    expect(attachmentButton).toBeTruthy();

    attachmentButton?.click();

    const preview = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-text-viewer]");
    const previewBox = root.querySelector<HTMLElement>(".ai-chat-helper-backup-text-viewer__box");
    const previewContent = root.querySelector<HTMLElement>(".ai-chat-helper-backup-text-viewer__content");
    expect(preview?.textContent).toContain("附件内容预览");
    expect(preview?.textContent).toContain("粘贴的文本 (1).txt");
    expect(preview?.textContent).toContain("text/plain");
    expect(preview?.textContent).toContain("第一行");
    expect(preview?.textContent).toContain("第三行");
    expect(previewBox).toBeTruthy();
    expect(previewContent?.textContent).toContain("第二行");
  });

  it("does not render the same ChatGPT user image twice in backup previews", () => {
    const record = buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [{
        id: "user-image",
        role: "user",
        text: "把背景弄的明亮一些\n\n![图片](data:image/jpeg;base64,AAA)\n\n[附件1: file_1]",
        attachments: [{
          id: "file_1",
          fileName: "file_1",
          mimeType: "image/jpeg",
          url: "data:image/jpeg;base64,AAA"
        }]
      }]
    }, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });

    const root = createBackupLibraryPopup([record]);
    const article = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-message]");

    expect(article?.querySelectorAll("[data-ai-chat-helper-backup-image]")).toHaveLength(1);
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

  it("shows the same hover information card on backup message nodes", () => {
    const record = buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [{
        id: "user-image",
        role: "user",
        text: "请参考这张图\n\n[附件1: photo.png]",
        attachments: [{
          id: "photo",
          fileName: "photo.png",
          mimeType: "image/png",
          url: "https://assets.example.com/photo.png"
        }]
      }]
    }, "zip", [file], {
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

    const node = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-message-node]")!;
    node.getBoundingClientRect = () => ({
      top: 120,
      left: 1180,
      right: 1191,
      bottom: 131,
      width: 11,
      height: 11,
      x: 1180,
      y: 120,
      toJSON: () => ({})
    });

    node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.innerHTML).toContain('<img src="https://assets.example.com/photo.png"');
    expect(tooltip?.textContent).toContain("请参考这张图");
    expect(tooltip?.textContent).not.toContain("[附件1: photo.png]");
    expect(tooltip?.dataset.side).toBe("right");
    expect(tooltip?.classList.contains("is-visible")).toBe(true);
    expect(node.getAttribute("aria-describedby")).toBe(tooltip?.id);

    node.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    expect(tooltip?.classList.contains("is-visible")).toBe(false);
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the shared custom tooltip for backup action buttons instead of native title", () => {
    const record = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
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

    const downloadButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-download]");
    expect(downloadButton).toBeTruthy();
    expect(downloadButton?.getAttribute("title")).toBeNull();

    downloadButton!.getBoundingClientRect = () => ({
      top: 100,
      left: 1180,
      right: 1195,
      bottom: 115,
      width: 15,
      height: 15,
      x: 1180,
      y: 100,
      toJSON: () => ({})
    });

    downloadButton!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip?.classList.contains("is-visible")).toBe(true);
    expect(tooltip?.textContent).toBe("下载备份");
    expect(downloadButton?.getAttribute("aria-describedby")).toBe(tooltip?.id);
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
    expect(downloadButton?.getAttribute("aria-busy")).toBe("true");
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
    await waitForDialogClose();
    expect(root.querySelector("[data-ai-chat-helper-backup-delete-confirm]")).toBeFalsy();
    expect(onDelete).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-back]")?.click();

    expect(onDownload).toHaveBeenCalledWith(record.id);
    expect(onDelete).toHaveBeenCalledWith(record.id);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows inline loading feedback while deleting a backup conversation", async () => {
    const record = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    let resolveDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const root = createBackupLibraryPopup([record]);
    document.body.appendChild(root);

    bindBackupLibraryPopup(root, [record], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn(() => deletePromise)
    });

    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]")?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();

    const deletingButtons = root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-delete]");
    expect(deletingButtons).toHaveLength(2);
    expect(deletingButtons[0]?.disabled).toBe(true);
    expect(deletingButtons[0]?.getAttribute("aria-busy")).toBe("true");
    expect(deletingButtons[0]?.querySelector(".ai-chat-helper-backup-action-spinner")).toBeTruthy();
    expect(deletingButtons[1]?.disabled).toBe(true);
    expect(deletingButtons[1]?.getAttribute("aria-busy")).toBe("true");
    expect(deletingButtons[1]?.querySelector(".ai-chat-helper-backup-action-spinner")).toBeTruthy();

    resolveDelete();
    await deletePromise;
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(root.textContent).toContain("暂无备份");
  });

  it("renders an empty backup state", () => {
    const root = createBackupLibraryPopup([]);

    expect(root.querySelector("[data-ai-chat-helper-backup-platform-nav]")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-backup-list]")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-backup-detail]")).toBeTruthy();
    expect(root.querySelector(".ai-chat-helper-backup-workbench__panel-head")?.textContent).toContain("ChatGPT");
    expect(root.querySelector(".ai-chat-helper-backup-workbench__panel-head")?.textContent).toContain("0 个会话");
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
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__summary-bar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;[^}]*gap:\s*8px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__brand\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*border-radius:\s*10px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__brand img\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*object-fit:\s*contain;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__storage-summary\s*\{[^}]*margin-top:\s*auto;[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-refresh\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*width:\s*38px;[^}]*height:\s*38px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__search\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*8px;[^}]*border:\s*1px solid #d7e1ed;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-workbench__search input\s*\{[^}]*height:\s*32px;[^}]*border:\s*none;[^}]*background:\s*transparent;/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-workbench__title p\s*\{/s);
    expect(popupCss).not.toMatch(/\.ai-chat-helper-backup-workbench__status\s*\{/s);
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
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*center;[^}]*gap:\s*4px;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-delete\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*border:\s*none;[^}]*background:\s*transparent;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-delete\s*\{[^}]*box-shadow:\s*none;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-manager__meta-top\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*start;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-manager__meta-top strong\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-manager__meta p\s*\{[^}]*display:\s*-webkit-box;[^}]*overflow:\s*hidden;[^}]*-webkit-line-clamp:\s*2;/s);
    expect(popupCss).toMatch(/@keyframes ai-chat-helper-dialog-overlay-in\s*\{/s);
    expect(popupCss).toMatch(/@keyframes ai-chat-helper-dialog-surface-in\s*\{/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-delete-confirm,\s*\.ai-chat-helper-backup-version-manager,\s*\.ai-chat-helper-backup-image-viewer,\s*\.ai-chat-helper-backup-text-viewer\s*\{[^}]*animation:\s*ai-chat-helper-dialog-overlay-in/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-version-manager__box,\s*\.ai-chat-helper-backup-image-viewer__box,\s*\.ai-chat-helper-backup-delete-confirm__box\s*\{[^}]*animation:\s*ai-chat-helper-dialog-surface-in/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-backup-delete-confirm\.is-closing,\s*\.ai-chat-helper-backup-version-manager\.is-closing,\s*\.ai-chat-helper-backup-image-viewer\.is-closing,\s*\.ai-chat-helper-backup-text-viewer\.is-closing\s*\{[^}]*animation:\s*ai-chat-helper-dialog-overlay-out/s);
  });

  it("keeps the backup page html and body background unified", () => {
    expect(popupCss).toMatch(/html:has\(body\.ai-chat-helper-backup-page-body\),\s*body\.ai-chat-helper-backup-page-body\s*\{[^}]*background:\s*#f6f8fb;/s);
  });

  it("styles the backup node hover information card like the page tooltip", () => {
    expect(popupCss).toMatch(/\.ai-chat-helper-node-tooltip\s*\{[\s\S]*position:\s*fixed;[\s\S]*max-width:\s*280px;[\s\S]*pointer-events:\s*none;[\s\S]*-webkit-line-clamp:\s*4;/s);
    expect(popupCss).toMatch(/\.ai-chat-helper-node-tooltip\.is-visible\s*\{[\s\S]*opacity:\s*1;/s);
  });

  it("triggers the onRefresh callback and shows loading spinner when clicking the refresh button", async () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([chatgpt]);
    const onRefresh = vi.fn().mockResolvedValue([chatgpt]);

    bindBackupLibraryPopup(root, [chatgpt], {
      onBack: vi.fn(),
      onDownload: vi.fn(),
      onDelete: vi.fn(),
      onRefresh
    });

    const refreshButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-refresh]");
    expect(refreshButton).toBeTruthy();

    refreshButton?.click();

    // 应该立即显示 loading
    const loadingButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-refresh]");
    expect(loadingButton).toBeTruthy();
    expect(loadingButton?.disabled).toBe(true);
    expect(root.querySelector(".ai-chat-helper-backup-refresh .fa-spin")).toBeTruthy();

    // 等待 refresh 异步完成并且加载状态完全清除
    await vi.waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(root.querySelector(".ai-chat-helper-backup-refresh .fa-spin")).toBeFalsy();
    });

    const finalButton = root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-refresh]");
    expect(finalButton?.disabled).toBe(false);
  });

  it("renders empty state with details panel folder open icon", () => {
    const root = createBackupLibraryPopup([]);
    expect(root.querySelector(".ai-chat-helper-backup-workbench__empty-icon-wrap")).toBeTruthy();
    expect(root.querySelector(".ai-chat-helper-backup-workbench__empty-icon-wrap .fa-folder-open")).toBeTruthy();
  });

  it("renders copy actions for conversation and messages", () => {
    const chatgpt = buildConversationBackupRecord(chatgptSnapshot, "zip", [file], {
      createdAt: "2026-06-09T10:00:00.000Z",
      source: "auto"
    });
    const root = createBackupLibraryPopup([chatgpt]);
    expect(root.querySelector("[data-ai-chat-helper-backup-copy-conversation]")).toBeTruthy();
    expect(root.querySelector("[data-ai-chat-helper-backup-copy-message]")).toBeTruthy();
  });
});
