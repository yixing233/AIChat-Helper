import { afterEach, describe, expect, it, vi } from "vitest";

describe("page hooks", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalPostMessage = window.postMessage;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL
    });
    Object.defineProperty(window, "postMessage", {
      configurable: true,
      writable: true,
      value: originalPostMessage
    });
    HTMLAnchorElement.prototype.click = originalAnchorClick;
  });

  it("captures downloaded HTML blob content with the download file name", async () => {
    const messages: any[] = [];
    Object.defineProperty(window, "postMessage", {
      configurable: true,
      writable: true,
      value: vi.fn((message: any) => {
        messages.push(message);
      })
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:https://claude.ai/html-preview")
    });
    HTMLAnchorElement.prototype.click = vi.fn();

    await import("../injected/page-hooks");

    const blob = new Blob(["<section><h2>Cached Widget</h2></section>"], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const link = document.createElement("a");
    link.href = url;
    link.download = "preview.html";
    link.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const captured = messages
      .map((message) => message.payload)
      .find((payload) => payload?.kind === "blob-url" && payload.fileName === "preview.html");

    expect(captured).toMatchObject({
      url: "blob:https://claude.ai/html-preview",
      mimeType: "text/html",
      fileName: "preview.html",
      responseText: "<section><h2>Cached Widget</h2></section>"
    });
  });

  it("captures request headers from fetch and xhr calls", async () => {
    const messages: any[] = [];
    Object.defineProperty(window, "postMessage", {
      configurable: true,
      writable: true,
      value: vi.fn((message: any) => {
        messages.push(message);
      })
    });
    const fetchResponse = new Response("{}", { status: 200 });
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: vi.fn(async () => fetchResponse)
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:https://example.com/unused")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn()
    });

    const xhrInstances: Array<{
      listeners: Record<string, () => void>;
      headers: Record<string, string>;
      open: (method: string, url: string) => void;
      setRequestHeader: (name: string, value: string) => void;
      send: (body?: string) => void;
      status: number;
      responseText: string;
    }> = [];
    const NativeXHR = window.XMLHttpRequest;
    class FakeXHR {
      listeners: Record<string, () => void> = {};
      headers: Record<string, string> = {};
      status = 200;
      responseText = "{}";

      constructor() {
        xhrInstances.push(this);
      }

      open(_method: string, _url: string) {
        // Hook metadata is recorded by the patched prototype method.
      }

      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }

      addEventListener(type: string, listener: () => void) {
        this.listeners[type] = listener;
      }

      send(_body?: string) {
        this.listeners.load?.();
      }
    }
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: FakeXHR
    });

    try {
      await import("../injected/page-hooks");

      await fetch("/api/v0/chat/history_messages", {
        headers: {
          authorization: "Bearer deepseek-token",
          "x-client-locale": "zh-CN"
        }
      });

      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/v0/chat_session/fetch_page");
      xhr.setRequestHeader("authorization", "Bearer xhr-token");
      xhr.setRequestHeader("x-app-version", "2026.6");
      xhr.send();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      Object.defineProperty(window, "XMLHttpRequest", {
        configurable: true,
        writable: true,
        value: NativeXHR
      });
    }

    const fetchCaptured = messages
      .map((message) => message.payload)
      .find((payload) => payload?.kind === "fetch" && payload.url === "/api/v0/chat/history_messages");
    const xhrCaptured = messages
      .map((message) => message.payload)
      .find((payload) => payload?.kind === "xhr" && payload.url === "/api/v0/chat_session/fetch_page");

    expect(fetchCaptured.requestHeaders).toMatchObject({
      authorization: "Bearer deepseek-token",
      "x-client-locale": "zh-CN"
    });
    expect(xhrCaptured.requestHeaders).toMatchObject({
      authorization: "Bearer xhr-token",
      "x-app-version": "2026.6"
    });
  });
});
