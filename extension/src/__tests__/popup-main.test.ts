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
});
