import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildConversationBackupRecord } from "../backup/backup-store";

const chatgptSnapshot = {
  platformId: "chatgpt" as const,
  conversationId: "chatgpt-page-test",
  title: "Backup Page Conversation",
  attachments: [],
  messages: [
    { id: "user-1", role: "user" as const, text: "Question" },
    { id: "assistant-1", role: "assistant" as const, text: "Answer" }
  ]
};

const file = {
  path: "backup.zip",
  mimeType: "application/zip",
  content: new Uint8Array([1, 2, 3])
};

describe("backup page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.innerHTML = '<div id="ai-chat-helper-backup-page-root"></div>';
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          getURL: (path: string) => `chrome-extension://test/${path}`
        },
        storage: {
          local: {
            get: vi.fn(),
            set: vi.fn((_items: Record<string, unknown>, callback?: () => void) => callback?.())
          }
        }
      }
    });
  });

  it("keeps the version dropdown open after deleting a history version on the backup page", async () => {
    const records = [
      { createdAt: "2026-06-14T00:05:00.000Z", answer: "Version 1 answer" },
      { createdAt: "2026-06-14T00:21:00.000Z", answer: "Version 2 answer" },
      { createdAt: "2026-06-14T00:27:00.000Z", answer: "Version 3 answer" },
      { createdAt: "2026-06-14T01:34:00.000Z", answer: "Version 4 answer" },
      { createdAt: "2026-06-14T13:58:00.000Z", answer: "Latest version answer" }
    ].map((item, index) => buildConversationBackupRecord({
      ...chatgptSnapshot,
      messages: [
        { id: `user-${index + 1}`, role: "user", text: `Question ${index + 1}` },
        { id: `assistant-${index + 1}`, role: "assistant", text: item.answer }
      ]
    }, "zip", [file], {
      createdAt: item.createdAt,
      source: "auto"
    }));
    const storageGet = vi.fn((_key: string, callback: (items: Record<string, unknown>) => void) => {
      callback({
        "ai-chat-helper:backups:records": records
      });
    });
    const storageSet = vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      const nextRecords = items["ai-chat-helper:backups:records"];
      if (Array.isArray(nextRecords)) {
        records.splice(0, records.length, ...(nextRecords as typeof records));
      }
      callback?.();
    });
    chrome.storage.local.get = storageGet as unknown as typeof chrome.storage.local.get;
    chrome.storage.local.set = storageSet as unknown as typeof chrome.storage.local.set;

    await import("../backup/main");
    await Promise.resolve();
    await Promise.resolve();

    const root = document.getElementById("ai-chat-helper-backup-page-root")!;
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.click();
    const targetDeleteButton = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-ai-chat-helper-backup-version-delete]"))[2];
    expect(targetDeleteButton).toBeTruthy();

    targetDeleteButton?.click();
    root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-delete-confirm-action]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const versionList = root.querySelector<HTMLElement>("[data-ai-chat-helper-backup-version-list]");
    expect(versionList).toBeTruthy();
    expect(versionList?.classList.contains("is-open")).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-ai-chat-helper-backup-version-toggle]")?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelectorAll("[data-ai-chat-helper-backup-version-delete]")).toHaveLength(4);
  });
});
