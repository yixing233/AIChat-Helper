import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "../platforms/chatgpt/adapter";
import { claudeAdapter } from "../platforms/claude/adapter";
import { deepseekAdapter } from "../platforms/deepseek/adapter";
import { doubaoAdapter } from "../platforms/doubao/adapter";
import { qwenAdapter } from "../platforms/qwen/adapter";
import { getPlatformAdapter, platformAdapters } from "../platforms";
import type { ConversationNode } from "../shared/types";

describe("platform adapter registry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000", "claude"],
    ["https://www.qianwen.com/chat/abcdefghi", "qwen"],
    ["https://www.doubao.com/chat/abc", "doubao"],
    ["https://chat.deepseek.com/chat/123e4567-e89b-12d3-a456-426614174000", "deepseek"]
  ])("returns adapter for %s", (url, expected) => {
    expect(getPlatformAdapter(new URL(url))?.id).toBe(expected);
  });

  it("registers all first-version platforms", () => {
    expect(platformAdapters.map((adapter) => adapter.id).sort()).toEqual([
      "chatgpt",
      "claude",
      "deepseek",
      "doubao",
      "qwen"
    ]);
  });

  it("mirrors the userscript by scanning only ChatGPT user turns for rail nodes", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-id="u1" data-message-author-role="user">Plan Alpha</article>
        <article data-message-id="a1" data-message-author-role="assistant">Answer Alpha</article>
        <article data-testid="conversation-turn-user">Plan Beta</article>
      </main>
    `;

    const nodes = chatgptAdapter.scanDomNodes(document);

    expect(nodes.map((node) => node.text)).toEqual(["Plan Alpha", "Plan Beta"]);
    expect(nodes.map((node) => node.role)).toEqual(["user", "user"]);
  });

  it("ChatGPT jump searches recycled conversation turns until the target user node is rendered", async () => {
    const scroller = createScrollableArea();
    appendChatGPTUserTurn(scroller, "turn-1", "First ChatGPT prompt");
    document.body.appendChild(scroller);
    const scrollIntoView = stubScrollIntoView();
    const scrollDeltas: number[] = [];

    scroller.scrollBy = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const delta = getScrollDelta(options, y);
      scrollDeltas.push(delta);
      scroller.scrollTop += delta;
      if (delta > 0 && !document.querySelector("[data-message-id='turn-3']")) {
        appendChatGPTUserTurn(scroller, "turn-3", "Target ChatGPT prompt");
      }
    });

    const nodes: ConversationNode[] = [
      chatgptNode("turn-1", "First ChatGPT prompt", 0),
      chatgptNode("turn-2", "Middle ChatGPT prompt", 1),
      chatgptNode("turn-3", "Target ChatGPT prompt", 2)
    ];

    const handled = await chatgptAdapter.jumpToNode?.(nodes[2], {
      nodes,
      activeNodeId: "turn-1",
      readingLineOffset: 150,
      root: document
    });

    expect(handled).toBe(true);
    expect(scrollDeltas.some((delta) => delta > 0)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("Qwen jump searches the virtualized message window until the target API node is rendered", async () => {
    const scroller = createScrollableArea();
    appendQwenUserRow(scroller, "req-1-question", "First prompt");
    document.body.appendChild(scroller);
    const scrollIntoView = stubScrollIntoView();
    const scrollDeltas: number[] = [];

    scroller.scrollBy = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const delta = getScrollDelta(options, y);
      scrollDeltas.push(delta);
      scroller.scrollTop += delta;
      if (delta > 0 && !document.querySelector("[data-msgid='req-3-question']")) {
        appendQwenUserRow(scroller, "req-3-question", "Target prompt");
      }
    });

    const nodes: ConversationNode[] = [
      qwenNode("req-1", "First prompt", 0),
      qwenNode("req-2", "Middle prompt", 1),
      qwenNode("req-3", "Target prompt", 2)
    ];

    const handled = await qwenAdapter.jumpToNode?.(nodes[2], {
      nodes,
      activeNodeId: "req-1",
      readingLineOffset: 150,
      root: document
    });

    expect(handled).toBe(true);
    expect(scrollDeltas.some((delta) => delta > 0)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("Qwen active node maps an answer row crossing the reading line back to its question node", () => {
    const scroller = createScrollableArea();
    const question = appendQwenUserRow(scroller, "req-1-question", "First prompt");
    const answer = appendQwenAnswerRow(scroller, "req-1-answer", "First answer");
    const nextQuestion = appendQwenUserRow(scroller, "req-2-question", "Second prompt");
    document.body.appendChild(scroller);
    setRect(question, -90, 80);
    setRect(answer, 90, 180);
    setRect(nextQuestion, 310, 80);

    const nodes: ConversationNode[] = [
      qwenNode("req-1", "First prompt", 0),
      qwenNode("req-2", "Second prompt", 1)
    ];

    const active = qwenAdapter.getActiveNode?.({
      nodes,
      activeNodeId: "",
      readingLineOffset: 150,
      root: document
    });

    expect(active?.id).toBe("req-1");
  });

  it("Doubao active node maps assistant content at the reading line to the previous user node", () => {
    const scroller = createScrollableArea();
    const user = appendDoubaoUserRow(scroller, "doubao-msg-1", "Doubao first prompt");
    const assistant = appendDoubaoAssistantRow(scroller, "Doubao answer");
    const nextUser = appendDoubaoUserRow(scroller, "doubao-msg-2", "Doubao second prompt");
    document.body.appendChild(scroller);
    setRect(user, -110, 80);
    setRect(assistant, 80, 180);
    setRect(nextUser, 340, 80);

    const nodes: ConversationNode[] = [
      doubaoNode("doubao-msg-1", "Doubao first prompt", 0),
      doubaoNode("doubao-msg-2", "Doubao second prompt", 1)
    ];

    const active = doubaoAdapter.getActiveNode?.({
      nodes,
      activeNodeId: "",
      readingLineOffset: 150,
      root: document
    });

    expect(active?.id).toBe("doubao-msg-1");
  });

  it("DeepSeek active node uses the user-to-answer group range around the reading line", () => {
    const scroller = createScrollableArea();
    const user = appendDeepSeekUserRow(scroller, "row-user-1", "DeepSeek first prompt");
    const assistant = appendDeepSeekAssistantRow(scroller, "DeepSeek answer");
    const nextUser = appendDeepSeekUserRow(scroller, "row-user-2", "DeepSeek second prompt");
    document.body.appendChild(scroller);
    setRect(user, -70, 60);
    setRect(assistant, 40, 220);
    setRect(nextUser, 340, 70);

    const nodes: ConversationNode[] = [
      deepseekNode("row-user-1", "DeepSeek first prompt", 0),
      deepseekNode("row-user-2", "DeepSeek second prompt", 1)
    ];

    const active = deepseekAdapter.getActiveNode?.({
      nodes,
      activeNodeId: "",
      readingLineOffset: 150,
      root: document
    });

    expect(active?.id).toBe("row-user-1");
  });

  it("Doubao jump locates the current user bubble by message id before scrolling", async () => {
    const scroller = createScrollableArea();
    appendDoubaoUserRow(scroller, "doubao-msg-2", "Doubao target prompt");
    document.body.appendChild(scroller);
    const scrollIntoView = stubScrollIntoView();

    const node: ConversationNode = {
      id: "doubao-msg-2",
      sourceMessageId: "doubao-msg-2",
      title: "Doubao target prompt",
      text: "Doubao target prompt",
      role: "user",
      index: 0,
      sessionIndex: 0
    };

    const handled = await doubaoAdapter.jumpToNode?.(node, {
      nodes: [node],
      activeNodeId: "doubao-msg-2",
      readingLineOffset: 150,
      root: document
    });

    expect(handled).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("DeepSeek jump matches only user rows and ignores assistant markdown blocks", async () => {
    const scroller = createScrollableArea();
    appendDeepSeekAssistantRow(scroller, "Assistant block repeats DeepSeek target prompt");
    appendDeepSeekUserRow(scroller, "row-user-2", "DeepSeek target prompt");
    document.body.appendChild(scroller);
    const scrollIntoView = stubScrollIntoView();

    const node: ConversationNode = {
      id: "deepseek-user-row-user-2",
      sourceMessageId: "row-user-2",
      title: "DeepSeek target prompt",
      text: "DeepSeek target prompt",
      role: "user",
      index: 0,
      sessionIndex: 0
    };

    const handled = await deepseekAdapter.jumpToNode?.(node, {
      nodes: [node],
      activeNodeId: "deepseek-user-row-user-2",
      readingLineOffset: 150,
      root: document
    });

    expect(handled).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
  });

  it("Claude jump finds the matching human message block by source id and text", async () => {
    const scroller = createScrollableArea();
    appendClaudeUserBlock(scroller, "claude-msg-1", "Claude target prompt");
    document.body.appendChild(scroller);
    const scrollIntoView = stubScrollIntoView();

    const node: ConversationNode = {
      id: "claude-msg-1",
      sourceMessageId: "claude-msg-1",
      title: "Claude target prompt",
      text: "Claude target prompt",
      role: "user",
      index: 0,
      sessionIndex: 0
    };

    const handled = await claudeAdapter.jumpToNode?.(node, {
      nodes: [node],
      activeNodeId: "claude-msg-1",
      readingLineOffset: 150,
      root: document
    });

    expect(handled).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

function createScrollableArea(): HTMLElement {
  const scroller = document.createElement("main");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 500 });
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2400 });
  Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 0, writable: true });
  scroller.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 640,
    bottom: 500,
    width: 640,
    height: 500,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  scroller.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
    scroller.scrollTop = typeof options === "number" ? Number(y || 0) : Number(options?.top || 0);
  });
  scroller.scrollBy = vi.fn((options?: ScrollToOptions | number, y?: number) => {
    scroller.scrollTop += getScrollDelta(options, y);
  });
  return scroller;
}

function getScrollDelta(options?: ScrollToOptions | number, y?: number): number {
  return typeof options === "number" ? Number(y || 0) : Number(options?.top || 0);
}

function stubScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  return scrollIntoView;
}

function qwenNode(sourceMessageId: string, text: string, index: number): ConversationNode {
  return {
    id: sourceMessageId,
    sourceMessageId,
    title: text,
    text,
    role: "user",
    index,
    sessionIndex: index
  };
}

function doubaoNode(sourceMessageId: string, text: string, index: number): ConversationNode {
  return {
    id: sourceMessageId,
    sourceMessageId,
    title: text,
    text,
    role: "user",
    index,
    sessionIndex: index
  };
}

function deepseekNode(sourceMessageId: string, text: string, index: number): ConversationNode {
  return {
    id: sourceMessageId,
    sourceMessageId,
    title: text,
    text,
    role: "user",
    index,
    sessionIndex: index
  };
}

function chatgptNode(sourceMessageId: string, text: string, index: number): ConversationNode {
  return {
    id: sourceMessageId,
    sourceMessageId,
    title: text,
    text,
    role: "user",
    index,
    sessionIndex: index
  };
}

function appendChatGPTUserTurn(parent: HTMLElement, messageId: string, text: string): HTMLElement {
  const row = document.createElement("article");
  row.setAttribute("data-message-id", messageId);
  row.setAttribute("data-message-author-role", "user");
  row.textContent = text;
  parent.appendChild(row);
  return row;
}

function appendQwenUserRow(parent: HTMLElement, msgId: string, text: string): HTMLElement {
  const row = document.createElement("section");
  row.className = "questionItem";
  row.setAttribute("data-msgid", msgId);
  row.innerHTML = `<div class="contentBox"><div class="bubble">${text}</div></div>`;
  parent.appendChild(row);
  return row;
}

function appendQwenAnswerRow(parent: HTMLElement, msgId: string, text: string): HTMLElement {
  const row = document.createElement("section");
  row.className = "answerItem";
  row.setAttribute("data-msgid", msgId);
  row.innerHTML = `<div class="contentBox"><div class="bubble">${text}</div></div>`;
  parent.appendChild(row);
  return row;
}

function appendDoubaoUserRow(parent: HTMLElement, messageId: string, text: string): HTMLElement {
  const row = document.createElement("article");
  row.setAttribute("data-testid", "send_message");
  row.innerHTML = `<div data-testid="message_content" data-message-id="${messageId}">${text}</div>`;
  parent.appendChild(row);
  return row;
}

function appendDoubaoAssistantRow(parent: HTMLElement, text: string): HTMLElement {
  const row = document.createElement("article");
  row.setAttribute("data-testid", "receive_message");
  row.innerHTML = `<div data-testid="message_content">${text}</div>`;
  parent.appendChild(row);
  return row;
}

function appendDeepSeekUserRow(parent: HTMLElement, rowId: string, text: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "_81e7b5e _19d617c ds-message";
  row.setAttribute("data-virtual-list-item-key", rowId);
  row.innerHTML = `<div class="_72b6158">${text}</div>`;
  parent.appendChild(row);
  return row;
}

function appendDeepSeekAssistantRow(parent: HTMLElement, text: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "_81e7b5e ds-message";
  row.innerHTML = `<div class="ds-markdown">${text}</div>`;
  parent.appendChild(row);
  return row;
}

function appendClaudeUserBlock(parent: HTMLElement, messageId: string, text: string): HTMLElement {
  const block = document.createElement("article");
  block.setAttribute("data-message-id", messageId);
  block.innerHTML = `<h2>You said:</h2><p>${text}</p>`;
  parent.appendChild(block);
  return block;
}

function setRect(element: HTMLElement, top: number, height: number): void {
  element.getBoundingClientRect = () => ({
    top,
    left: 0,
    right: 640,
    bottom: top + height,
    width: 640,
    height,
    x: 0,
    y: top,
    toJSON: () => ({})
  });
}
