import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platformId: "chatgpt",
  conversationId: "current",
  scanDomNodes: vi.fn(),
  jumpToNode: vi.fn(),
  getActiveNode: vi.fn(),
  fetchConversationDetail: vi.fn(),
  hydrateFromCapturedApi: vi.fn(),
  storageValues: new Map<string, unknown>(),
  storageChangeListeners: [] as Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>,
  contentCommandListeners: [] as Array<(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | undefined>
}));

vi.mock("../platforms", () => ({
  getPlatformAdapter: vi.fn(() => ({
    id: mocks.platformId,
    name: "ChatGPT",
    matches: () => true,
    getConversationId: () => mocks.conversationId,
    scanDomNodes: mocks.scanDomNodes,
    jumpToNode: mocks.jumpToNode,
    getActiveNode: mocks.getActiveNode,
    hydrateFromCapturedApi: mocks.hydrateFromCapturedApi,
    fetchConversationDetail: mocks.fetchConversationDetail
  }))
}));

vi.mock("../messaging/bridge", async () => {
  const actual = await vi.importActual<typeof import("../messaging/bridge")>("../messaging/bridge");
  return {
    ...actual,
    sendBackgroundRequest: vi.fn(async (request: { type: string }) => {
      if (request.type === "get-version") return { ok: true, value: "1.0.0" };
      return { ok: false, error: `Unhandled request ${request.type}` };
    })
  };
});

vi.mock("../storage/extension-storage", () => ({
  createExtensionStorage: () => ({
    get: async <T>(key: string, defaultValue: T) => {
      const scopedKey = `ai-chat-helper:settings:${key}`;
      if (mocks.storageValues.has(scopedKey)) return mocks.storageValues.get(scopedKey) as T;
      return mocks.storageValues.has(key) ? mocks.storageValues.get(key) as T : defaultValue;
    },
    set: async () => undefined,
    remove: async () => undefined
  }),
  migrateLocalStorageKey: async () => false
}));

describe("content main node auto refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ai-chat-helper-platform");
    mocks.platformId = "chatgpt";
    mocks.conversationId = "current";
    mocks.storageValues.clear();
    mocks.storageChangeListeners.length = 0;
    mocks.contentCommandListeners.length = 0;
    mocks.scanDomNodes.mockReset();
    mocks.jumpToNode.mockReset();
    mocks.getActiveNode.mockReset();
    mocks.fetchConversationDetail.mockReset();
    mocks.hydrateFromCapturedApi.mockReset();
    mocks.getActiveNode.mockReturnValue(null);
    mocks.fetchConversationDetail.mockRejectedValue(new Error("detail unavailable"));
    mocks.hydrateFromCapturedApi.mockRejectedValue(new Error("captured snapshot unavailable"));
    mocks.scanDomNodes.mockImplementation((root: ParentNode = document) => {
      return Array.from(root.querySelectorAll<HTMLElement>("[data-chat-node]")).map((element, index) => ({
        id: element.dataset.chatNode || String(index),
        title: element.textContent?.trim() || `Node ${index + 1}`,
        index,
        role: index % 2 === 0 ? "user" : "assistant",
        elementSelector: `[data-chat-node="${element.dataset.chatNode}"]`
      }));
    });
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          getURL: (path: string) => `chrome-extension://test/${path}`,
          getManifest: () => ({ version: "1.0.0" }),
          sendMessage: vi.fn(),
          onMessage: {
            addListener: vi.fn((listener: (
              message: unknown,
              sender: chrome.runtime.MessageSender,
              sendResponse: (response?: unknown) => void
            ) => boolean | undefined) => {
              mocks.contentCommandListeners.push(listener);
            })
          }
        },
        storage: {
          local: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn()
          },
          onChanged: {
            addListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
              mocks.storageChangeListeners.push(listener);
            })
          }
        }
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
    Reflect.deleteProperty(globalThis, "chrome");
  });

  it("refreshes rendered node dots when the chat DOM changes", async () => {
    appendChatNode("first", "First prompt");

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First prompt"]);

    appendChatNode("second", "Second answer");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(renderedNodeTitles()).toEqual(["First prompt", "Second answer"]);
  });

  it("registers popup command receiver before the async panel mount finishes", async () => {
    await import("../content/main");

    try {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      expect(mocks.contentCommandListeners.length).toBe(1);
      expect(document.getElementById("ai-chat-helper-panel")).toBeNull();
    } finally {
      await flushMount();
    }
  });

  it("re-renders nodes when popup settings are saved to extension storage", async () => {
    appendChatNode("first", "First prompt");
    appendChatNode("second", "Second answer");

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First prompt", "Second answer"]);
    expect(mocks.storageChangeListeners.length).toBeGreaterThan(0);

    mocks.storageValues.set("ai-chat-helper:settings:visibleLimit", 1);
    emitStorageChange("visibleLimit", 20, 1);
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First prompt"]);
  });

  it("keeps previously discovered rail nodes when a virtualized chat DOM recycles them", async () => {
    const first = appendChatNode("first", "First prompt");
    appendChatNode("second", "Second answer");

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First prompt", "Second answer"]);

    first.remove();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(renderedNodeTitles()).toEqual(["First prompt", "Second answer"]);
  });

  it("uses API snapshot user messages as the rail source for virtual-list platforms", async () => {
    mocks.platformId = "qwen";
    appendChatNode("visible", "Visible DOM prompt");
    mocks.fetchConversationDetail.mockResolvedValue({
      platformId: "qwen",
      conversationId: "current",
      title: "Qwen conversation",
      attachments: [],
      messages: [
        { id: "api-user-1", sourceMessageId: "req-1", role: "user", text: "First API prompt" },
        { id: "api-answer-1", sourceMessageId: "resp-1", role: "assistant", text: "Answer" },
        { id: "api-user-2", sourceMessageId: "req-2", role: "user", text: "Second API prompt" }
      ]
    });

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First API prompt", "Second API prompt"]);
  });

  it("uses ChatGPT API snapshot user messages as the rail source instead of DOM nodes", async () => {
    mocks.platformId = "chatgpt";
    appendChatNode("visible-dom", "Visible DOM prompt");
    mocks.fetchConversationDetail.mockResolvedValue({
      platformId: "chatgpt",
      conversationId: "current",
      title: "ChatGPT conversation",
      attachments: [],
      messages: [
        { id: "api-user-1", sourceMessageId: "gpt-user-1", role: "user", text: "First API ChatGPT prompt" },
        { id: "api-answer-1", sourceMessageId: "gpt-answer-1", role: "assistant", text: "Answer" },
        { id: "api-user-2", sourceMessageId: "gpt-user-2", role: "user", text: "Second API ChatGPT prompt" }
      ]
    });

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["First API ChatGPT prompt", "Second API ChatGPT prompt"]);
  });

  it("ignores stale captured virtual nodes from a previous conversation", async () => {
    mocks.platformId = "qwen";
    mocks.conversationId = "session-current";
    mocks.hydrateFromCapturedApi.mockResolvedValue({
      platformId: "qwen",
      conversationId: "session-old",
      title: "Old Qwen conversation",
      attachments: [],
      messages: [
        { id: "old-user", sourceMessageId: "old-req", role: "user", text: "Old captured prompt" }
      ]
    });
    mocks.fetchConversationDetail.mockResolvedValue({
      platformId: "qwen",
      conversationId: "session-current",
      title: "Current Qwen conversation",
      attachments: [],
      messages: [
        { id: "current-user", sourceMessageId: "current-req", role: "user", text: "Current API prompt" }
      ]
    });

    await import("../content/main");
    await flushMount();

    expect(renderedNodeTitles()).toEqual(["Current API prompt"]);
    expect(mocks.fetchConversationDetail).toHaveBeenCalledWith("session-current", undefined, expect.any(Array));
  });

  it("uses the platform jump hook when a rendered node dot is clicked", async () => {
    appendChatNode("first", "First prompt");
    mocks.jumpToNode.mockResolvedValue(true);

    await import("../content/main");
    await flushMount();

    document.querySelector<HTMLButtonElement>("#ai-chat-helper-panel .ai-chat-helper-node-dot")?.click();

    expect(mocks.jumpToNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", title: "First prompt" }),
      expect.objectContaining({
        readingLineOffset: 150,
        nodes: expect.arrayContaining([expect.objectContaining({ id: "first" })])
      })
    );
  });

  it("passes the previous active node id to platform jump hooks", async () => {
    const first = appendChatNode("first", "First prompt");
    const second = appendChatNode("second", "Second prompt");
    const third = appendChatNode("third", "Third prompt");
    mocks.jumpToNode.mockResolvedValue(true);
    setElementTop(first, -260);
    setElementTop(second, 130);
    setElementTop(third, 420);

    await import("../content/main");
    await flushMount();
    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();

    const buttons = document.querySelectorAll<HTMLButtonElement>("#ai-chat-helper-panel .ai-chat-helper-node-dot");
    buttons[2]?.click();
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("Third prompt");
    expect(mocks.jumpToNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "third" }),
      expect.objectContaining({ activeNodeId: "second" })
    );
  });

  it("falls back to selector scrolling when the platform jump hook does not report a handled jump", async () => {
    const first = appendChatNode("first", "First prompt");
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    mocks.jumpToNode.mockReturnValue(undefined);
    setElementTop(first, 320);

    await import("../content/main");
    await flushMount();

    document.querySelector<HTMLButtonElement>("#ai-chat-helper-panel .ai-chat-helper-node-dot")?.click();
    await Promise.resolve();

    expect(mocks.jumpToNode).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: 170, behavior: "smooth" });
  });

  it("updates the active rail dot from the node nearest to the reading line", async () => {
    const first = appendChatNode("first", "First prompt");
    const second = appendChatNode("second", "Second answer");
    setElementTop(first, 80);
    setElementTop(second, 260);

    await import("../content/main");
    await flushMount();

    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("First prompt");

    setElementTop(first, -260);
    setElementTop(second, 120);
    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("Second answer");
  });

  it("initializes the active rail dot from the reading line instead of defaulting to the first node", async () => {
    const first = appendChatNode("first", "First prompt");
    const second = appendChatNode("second", "Second answer");
    setElementTop(first, -260);
    setElementTop(second, 130);

    await import("../content/main");
    await flushMount();
    await vi.advanceTimersByTimeAsync(90);

    expect(activeNodeTitle()).toBe("Second answer");
  });

  it("chooses the visible node nearest to the reading line even when it is below the line", async () => {
    const first = appendChatNode("first", "First prompt");
    const second = appendChatNode("second", "Second answer");
    setElementTop(first, 80);
    setElementTop(second, 170);

    await import("../content/main");
    await flushMount();

    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("Second answer");
  });

  it("updates the active rail dot when an internal chat scroller moves", async () => {
    const scroller = document.createElement("div");
    scroller.dataset.chatScroller = "true";
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    const first = appendChatNode("first", "First prompt", scroller);
    const second = appendChatNode("second", "Second answer", scroller);
    document.body.appendChild(scroller);
    setElementTop(first, -260);
    setElementTop(second, 130);

    await import("../content/main");
    await flushMount();

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("Second answer");
  });

  it("uses the platform active hook for virtual-list API nodes without DOM selectors", async () => {
    mocks.platformId = "qwen";
    mocks.fetchConversationDetail.mockResolvedValue({
      platformId: "qwen",
      conversationId: "current",
      title: "Qwen conversation",
      attachments: [],
      messages: [
        { id: "api-user-1", sourceMessageId: "req-1", role: "user", text: "First API prompt" },
        { id: "api-user-2", sourceMessageId: "req-2", role: "user", text: "Second API prompt" }
      ]
    });
    mocks.getActiveNode.mockImplementation(({ nodes }: { nodes: Array<{ id: string }> }) => nodes[1] || null);

    await import("../content/main");
    await flushMount();

    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();

    expect(mocks.getActiveNode).toHaveBeenCalled();
    expect(activeNodeTitle()).toBe("Second API prompt");
  });

  it("activates the last generic node when the chat scroller is at the bottom", async () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 800, writable: true });
    const first = appendChatNode("first", "First prompt", scroller);
    const second = appendChatNode("second", "Last prompt", scroller);
    document.body.appendChild(scroller);
    setElementTop(first, 40);
    setElementTop(second, 720);

    await import("../content/main");
    await flushMount();

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    await Promise.resolve();

    expect(activeNodeTitle()).toBe("Last prompt");
  });
});

function appendChatNode(id: string, text: string, parent: HTMLElement = document.body): HTMLElement {
  const node = document.createElement("article");
  node.dataset.chatNode = id;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

async function flushMount(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

function renderedNodeTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("#ai-chat-helper-panel .ai-chat-helper-node-dot"))
    .map((button) => button.title);
}

function activeNodeTitle(): string {
  return document.querySelector<HTMLButtonElement>("#ai-chat-helper-panel .ai-chat-helper-node--active")?.title || "";
}

function setElementTop(element: HTMLElement, top: number): void {
  element.getBoundingClientRect = () => ({
    top,
    left: 0,
    right: 400,
    bottom: top + 80,
    width: 400,
    height: 80,
    x: 0,
    y: top,
    toJSON: () => ({})
  });
}

function emitStorageChange(key: string, oldValue: unknown, newValue: unknown): void {
  const changes = {
    [`ai-chat-helper:settings:${key}`]: { oldValue, newValue }
  };
  mocks.storageChangeListeners.forEach((listener) => listener(changes, "local"));
}
