import { beforeEach, describe, expect, it, vi } from "vitest";

describe("popup main content commands", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    let lastError: { message: string } | undefined;
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          get lastError() {
            return lastError;
          },
          getManifest: () => ({ version: "1.0.0" }),
          getURL: (path: string) => `chrome-extension://test/${path}`
        },
        tabs: {
          create: vi.fn(async () => undefined),
          query: vi.fn(async () => [{ id: 7, url: "https://chatgpt.com/c/test" }]),
          sendMessage: vi.fn((_tabId: number, _message: unknown, callback: (response?: { ok?: boolean; error?: string }) => void) => {
            if ((chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length === 1) {
              lastError = { message: "Could not establish connection. Receiving end does not exist." };
              callback(undefined);
              lastError = undefined;
              return;
            }
            callback({ ok: true });
          })
        },
        scripting: {
          insertCSS: vi.fn(async () => undefined),
          executeScript: vi.fn(async () => undefined)
        },
        storage: {
          local: {
            get: vi.fn((_key: string, callback: (items: Record<string, unknown>) => void) => callback({})),
            set: vi.fn((_items: Record<string, unknown>, callback?: () => void) => callback?.())
          }
        }
      }
    });
  });

  it("injects the content script and retries when batch export has no receiving end", async () => {
    const { sendContentCommand } = await import("../popup/main");

    await expect(sendContentCommand(7, "export-batch")).resolves.toBeUndefined();

    expect(chrome.scripting.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["content/styles.css"]
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["content/main.js"]
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("opens the backup library in a dedicated extension page", async () => {
    document.body.innerHTML = '<div id="ai-chat-helper-popup-root"></div>';
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { sendContentCommand } = await import("../popup/main");
    void sendContentCommand;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>("[data-ai-chat-helper-popup-action='open-backups']")?.click();
    await Promise.resolve();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/backup/backup.html"
    });
    expect(document.querySelector("[data-ai-chat-helper-backup-record]")).toBeFalsy();
  });

  it("shows the current conversation last automatic backup time from backup storage", async () => {
    document.body.innerHTML = '<div id="ai-chat-helper-popup-root"></div>';
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const storageGet = vi.fn((key: string, callback: (items: Record<string, unknown>) => void) => {
      if (key === "ai-chat-helper:backup-status:chatgpt:test:last-auto-backup-at") {
        callback({
          [key]: "2026-06-11T10:20:30.000Z"
        });
        return;
      }
      if (key === "ai-chat-helper:backups:records") {
        callback({
          [key]: [
            {
              id: "claude-old",
              platformId: "claude",
              conversationId: "other",
              title: "Claude Backup",
              digest: "a",
              createdAt: "2026-06-10T01:00:00.000Z",
              files: [],
              snapshot: {}
            },
            {
              id: "chatgpt-other-auto",
              platformId: "chatgpt",
              conversationId: "other",
              title: "Other ChatGPT Backup",
              digest: "b",
              source: "auto",
              createdAt: "2026-06-11T08:20:30.000Z",
              files: [],
              snapshot: {}
            },
            {
              id: "chatgpt-current-manual",
              platformId: "chatgpt",
              conversationId: "test",
              title: "Manual Current ChatGPT Backup",
              digest: "c",
              source: "manual",
              createdAt: "2026-06-11T09:20:30.000Z",
              files: [],
              snapshot: {}
            },
            {
              id: "chatgpt-current-auto",
              platformId: "chatgpt",
              conversationId: "test",
              title: "Auto Current ChatGPT Backup",
              digest: "d",
              source: "auto",
              createdAt: "2026-06-11T07:20:30.000Z",
              files: [],
              snapshot: {}
            }
          ]
        });
        return;
      }
      callback({});
    });
    chrome.storage.local.get = storageGet as unknown as typeof chrome.storage.local.get;

    const { sendContentCommand } = await import("../popup/main");
    void sendContentCommand;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const lastBackup = document.querySelector<HTMLElement>("[data-ai-chat-helper-last-backup]");
    expect(lastBackup?.textContent).toContain("上次自动备份");
    expect(lastBackup?.textContent).toContain("2026");
    expect(lastBackup?.textContent).toContain("18:20");
    expect(lastBackup?.textContent).not.toContain("15:20");
    expect(lastBackup?.textContent).not.toContain("尚无记录");
  });

  it("triggers current conversation auto backup bootstrap when no auto backup record exists", async () => {
    document.body.innerHTML = '<div id="ai-chat-helper-popup-root"></div>';
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const storageGet = vi.fn((key: string, callback: (items: Record<string, unknown>) => void) => {
      if (key === "ai-chat-helper:settings:autoBackupEnabled") {
        callback({ [key]: true });
        return;
      }
      if (key === "ai-chat-helper:backup-status:chatgpt:test:last-auto-backup-at") {
        callback({});
        return;
      }
      if (key === "ai-chat-helper:backups:records") {
        callback({ [key]: [] });
        return;
      }
      callback({});
    });
    chrome.storage.local.get = storageGet as unknown as typeof chrome.storage.local.get;

    await import("../popup/main");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      {
        type: "ai-chat-helper:content-command",
        command: "bootstrap-auto-backup"
      },
      expect.any(Function)
    );

    const lastBackup = document.querySelector<HTMLElement>("[data-ai-chat-helper-last-backup]");
    expect(lastBackup?.textContent).toContain("尚无记录");
  });
});
