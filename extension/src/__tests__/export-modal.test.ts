import { afterEach, describe, expect, it, vi } from "vitest";
import { createBatchExportModal, createExportModal } from "../ui/modals/export-modal";
import type { ConversationSnapshot, ConversationSummary } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "conv-current",
  title: "Current conversation",
  attachments: [],
  messages: [
    { id: "user-1", role: "user", text: "Question" },
    { id: "assistant-1", role: "assistant", text: "Answer" },
    { id: "assistant-2", role: "assistant", text: "Second answer" }
  ]
};

async function flushPreviewLoad(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10 && !predicate(); attempt += 1) {
    await Promise.resolve();
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createExportModal", () => {
  it("renders a userscript-style current conversation selector", () => {
    const modal = createExportModal(snapshot);

    expect(modal.textContent).toContain("导出当前对话");
    expect(modal.textContent).toContain("已选 3 条");
    expect(modal.querySelectorAll("[data-ai-chat-helper-message-item]")).toHaveLength(3);
    expect(modal.querySelector("[data-ai-chat-helper-export-menu-trigger]")).toBeTruthy();
    expect(modal.querySelector("[data-format='html']")).toBeTruthy();
    expect(modal.querySelector("[data-format='markdown']")).toBeTruthy();
    expect(modal.querySelector("[data-format='txt']")).toBeTruthy();
    expect(modal.querySelector("[data-format='zip']")).toBeFalsy();
  });

    it("places full-preview buttons inside the message bubbles in current export preview", () => {
    const modal = createExportModal(snapshot);
    const rows = modal.querySelectorAll<HTMLElement>(".ai-chat-helper-export-modal__message-item");

    const userButton = rows[0].querySelector("[data-ai-chat-helper-message-view]");
    const assistantButton = rows[1].querySelector("[data-ai-chat-helper-message-view]");

    expect(userButton).toBeTruthy();
    expect(assistantButton).toBeTruthy();

    expect(rows[0].querySelector(".ai-chat-helper-export-modal__message-bubble")?.contains(userButton)).toBe(true);
    expect(rows[1].querySelector(".ai-chat-helper-export-modal__message-bubble")?.contains(assistantButton)).toBe(true);
  });

  it("exports only selected current conversation messages", () => {
    const onExport = vi.fn();
    const modal = createExportModal(snapshot, onExport);
    const checkboxes = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-message-item]");

    checkboxes[0].checked = false;
    checkboxes[0].dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();

    expect(onExport).toHaveBeenCalledWith("markdown", {
      ...snapshot,
      messages: [snapshot.messages[1], snapshot.messages[2]]
    });
  });

  it("shows a loading state while exporting the current conversation file", async () => {
    const pending = deferred();
    const onExport = vi.fn(() => pending.promise);
    const modal = createExportModal(snapshot, onExport);
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='html']")?.click();
    await Promise.resolve();

    expect(onExport).toHaveBeenCalledWith("html", snapshot);
    expect(modal.querySelector("[data-ai-chat-helper-export-loading]")?.textContent).toContain("正在导出文件");
    expect(modal.querySelector<HTMLButtonElement>("[data-format='html']")?.disabled).toBe(true);
    expect(document.getElementById("ai-chat-helper-export-modal")).toBe(modal);

    pending.resolve();
    await flushUntil(() => !document.getElementById("ai-chat-helper-export-modal"));

    expect(document.getElementById("ai-chat-helper-export-modal")).toBeFalsy();
  });

  it("selects only assistant messages in the current export dialog", () => {
    const onExport = vi.fn();
    const modal = createExportModal(snapshot, onExport);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-only-assistant]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='html']")?.click();

    expect(onExport).toHaveBeenCalledWith("html", {
      ...snapshot,
      messages: [snapshot.messages[1], snapshot.messages[2]]
    });
  });

  it("excludes DeepSeek thinking messages in the current export dialog", () => {
    const deepseekSnapshot: ConversationSnapshot = {
      platformId: "deepseek",
      conversationId: "deepseek-1",
      title: "DeepSeek conversation",
      attachments: [],
      messages: [
        { id: "user-1", role: "user", text: "Question" },
        { id: "think-1", role: "assistant", text: "Thinking", isThought: true },
        { id: "answer-1", role: "assistant", text: "Answer", fragmentType: "RESPONSE" }
      ]
    };
    const onExport = vi.fn();
    const modal = createExportModal(deepseekSnapshot, onExport);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-exclude-thought]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='txt']")?.click();

    expect(onExport).toHaveBeenCalledWith("txt", {
      ...deepseekSnapshot,
      messages: [deepseekSnapshot.messages[0], deepseekSnapshot.messages[2]]
    });
  });

  it("uses DeepSeek textWithoutThought when excluding thinking from current exports", () => {
    const deepseekSnapshot: ConversationSnapshot = {
      platformId: "deepseek",
      conversationId: "deepseek-merged-thought",
      title: "DeepSeek merged thought conversation",
      attachments: [],
      messages: [
        {
          id: "answer-1",
          role: "assistant",
          text: "思考过程\n\n最终回答",
          hasThought: true,
          textWithoutThought: "最终回答",
          fragmentType: "RESPONSE"
        }
      ]
    };
    const onExport = vi.fn();
    const modal = createExportModal(deepseekSnapshot, onExport);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-exclude-thought]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();

    expect(onExport).toHaveBeenCalledWith("markdown", {
      ...deepseekSnapshot,
      messages: [
        {
          ...deepseekSnapshot.messages[0],
          text: "最终回答"
        }
      ]
    });
  });

  it("keeps markdown rendering after excluding merged DeepSeek thinking in previews", () => {
    const deepseekSnapshot: ConversationSnapshot = {
      platformId: "deepseek",
      conversationId: "deepseek-preview-markdown",
      title: "DeepSeek preview markdown",
      attachments: [],
      messages: [
        {
          id: "answer-1",
          role: "assistant",
          text: "思考过程\n\n### 最终回答\n\n- **重点**",
          hasThought: true,
          textWithoutThought: "### 最终回答\n\n- **重点**",
          fragmentType: "RESPONSE"
        }
      ]
    };
    const modal = createExportModal(deepseekSnapshot);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-exclude-thought]")?.click();
    const messageText = modal.querySelector<HTMLElement>("[data-ai-chat-helper-message-text]")!;

    expect(messageText.innerHTML).toContain("<h3>最终回答</h3>");
    expect(messageText.innerHTML).toContain("<strong>重点</strong>");
    expect(messageText.textContent).not.toContain("思考过程");
  });

  it("labels DeepSeek thought and response messages like the userscript export dialog", () => {
    const deepseekSnapshot: ConversationSnapshot = {
      platformId: "deepseek",
      conversationId: "deepseek-labels",
      title: "DeepSeek labels",
      attachments: [],
      messages: [
        { id: "think-1", role: "assistant", text: "Thinking", isThought: true },
        { id: "answer-1", role: "assistant", text: "Answer", fragmentType: "RESPONSE" },
        { id: "search-1", role: "assistant", text: "Search", isSearch: true }
      ]
    };
    const modal = createExportModal(deepseekSnapshot);

    expect(modal.textContent).toContain("DeepSeek 思考过程");
    expect(modal.textContent).toContain("DeepSeek AI回答");
    expect(modal.textContent).toContain("DeepSeek 智能搜索");
  });

  it("labels Doubao artifact messages like the userscript export dialog", () => {
    const doubaoSnapshot: ConversationSnapshot = {
      platformId: "doubao",
      conversationId: "doubao-artifact",
      title: "Doubao artifact conversation",
      attachments: [],
      messages: [
        { id: "answer-1", role: "assistant", text: "Answer" },
        { id: "artifact-1", role: "assistant", text: "Code", isArtifact: true }
      ]
    };
    const modal = createExportModal(doubaoSnapshot);

    expect(modal.textContent).toContain("豆包 代码编辑器内容");
  });

  it("renders ChatGPT image messages as image previews in the current export dialog", () => {
    const modal = createExportModal({
      ...snapshot,
      messages: [{
        id: "image-1",
        role: "user",
        text: "请参考这张图\n\n[附件1: photo.png]",
        attachments: [{
          id: "photo",
          fileName: "photo.png",
          mimeType: "image/png",
          url: "https://assets.example.com/photo.png"
        }]
      }]
    });

    const messageText = modal.querySelector<HTMLElement>("[data-ai-chat-helper-message-text]");
    const media = modal.querySelector<HTMLElement>(".ai-chat-helper-export-modal__message-media");
    expect(messageText?.innerHTML).toContain("<img src=\"https://assets.example.com/photo.png\"");
    expect(messageText?.textContent).toContain("请参考这张图");
    expect(messageText?.textContent).not.toContain("[附件1: photo.png]");
    expect(media?.dataset.imageLoading).toBe("true");
    expect(media?.querySelector(".ai-chat-helper-export-modal__message-media-skeleton")).toBeTruthy();
  });

  it("renders markdown formatting in current export previews and full message previews", () => {
    const modal = createExportModal({
      ...snapshot,
      messages: [{
        id: "markdown-1",
        role: "assistant",
        text: "### 小结\n\n- **重点**\n\n`code`"
      }]
    });
    document.body.appendChild(modal);

    const messageText = modal.querySelector<HTMLElement>("[data-ai-chat-helper-message-text]")!;
    expect(messageText.innerHTML).toContain("<h3>小结</h3>");
    expect(messageText.innerHTML).toContain("<ul>");
    expect(messageText.innerHTML).toContain("<strong>重点</strong>");
    expect(messageText.innerHTML).toContain("<code>code</code>");

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-message-view]")?.click();
    const fullPreview = document.querySelector<HTMLElement>("[data-ai-chat-helper-full-preview]")!;
    expect(fullPreview.innerHTML).toContain("<h3>小结</h3>");
    expect(fullPreview.innerHTML).toContain("<code>code</code>");
  });

  it("opens a full message preview from the current export dialog without toggling selection", () => {
    const modal = createExportModal({
      ...snapshot,
      messages: [{
        id: "long-1",
        role: "assistant",
        text: "第一行\n第二行\n第三行\n第四行"
      }]
    });
    document.body.appendChild(modal);

    const checkbox = modal.querySelector<HTMLInputElement>("[data-ai-chat-helper-message-item]")!;
    const viewButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-message-view]")!;
    viewButton.click();

    const fullPreview = document.querySelector<HTMLElement>("[data-ai-chat-helper-full-preview]");
    expect(checkbox.checked).toBe(true);
    expect(fullPreview?.textContent).toContain("AI回答全文");
    expect(fullPreview?.textContent).toContain("第四行");
  });

  it("opens a pasted text attachment preview dialog from the export modal", () => {
    const modal = createExportModal({
      ...snapshot,
      messages: [{
        id: "paste-1",
        role: "user",
        text: "请看这个文本附件\n\n[附件1: 粘贴的文本 (1).txt]",
        attachments: [{
          id: "file-text-1",
          fileName: "粘贴的文本 (1).txt",
          mimeType: "text/plain",
          content: "第一行\n第二行\n第三行"
        }]
      }]
    });
    document.body.appendChild(modal);

    const attachmentButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-attachment-preview]");
    expect(attachmentButton).toBeTruthy();

    attachmentButton?.click();

    const preview = document.querySelector<HTMLElement>("[data-ai-chat-helper-attachment-full-preview]");
    expect(preview?.textContent).toContain("附件内容预览");
    expect(preview?.textContent).toContain("粘贴的文本 (1).txt");
    expect(preview?.textContent).toContain("text/plain");
    expect(preview?.textContent).toContain("第一行");
    expect(preview?.textContent).toContain("第三行");
  });

  it("uses the shared custom tooltip for export modal icon buttons instead of native title", () => {
    const modal = createExportModal(snapshot);
    document.body.appendChild(modal);

    const closeButton = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-close-export]");
    expect(closeButton).toBeTruthy();
    expect(closeButton?.getAttribute("title")).toBeNull();

    closeButton!.getBoundingClientRect = () => ({
      top: 80,
      left: 1180,
      right: 1196,
      bottom: 96,
      width: 16,
      height: 16,
      x: 1180,
      y: 80,
      toJSON: () => ({})
    });

    closeButton!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip?.classList.contains("is-visible")).toBe(true);
    expect(tooltip?.textContent).toBe("关闭");
    expect(closeButton?.getAttribute("aria-describedby")).toBe(tooltip?.id);
  });

  it("closes only the topmost export preview layer with Escape", () => {
    const modal = createExportModal(snapshot);
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-message-view]")?.click();
    expect(document.querySelector("[data-ai-chat-helper-full-preview]")).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector("[data-ai-chat-helper-full-preview]")).toBeFalsy();
    expect(document.getElementById("ai-chat-helper-export-modal")).toBe(modal);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.getElementById("ai-chat-helper-export-modal")).toBeFalsy();
  });

  it("closes export dialog layers when clicking their backdrop", () => {
    const modal = createExportModal(snapshot);
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-message-view]")?.click();
    const fullPreview = document.querySelector<HTMLElement>("[data-ai-chat-helper-full-preview]")!;
    fullPreview.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector("[data-ai-chat-helper-full-preview]")).toBeFalsy();

    modal.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.getElementById("ai-chat-helper-export-modal")).toBeFalsy();
  });

  it("exports only selected batch conversations", () => {
    const summaries: ConversationSummary[] = [
      {
        platformId: "chatgpt",
        conversationId: "conv-1",
        title: "First conversation",
        updatedAt: "2026-06-08T01:00:00Z",
        updatedAtText: "更新时间文本",
        createdAt: "2026-06-07T01:00:00Z",
        createdAtText: "创建时间文本",
        messageCount: 3
      },
      {
        platformId: "chatgpt",
        conversationId: "conv-2",
        title: "Second conversation",
        messageCount: 5
      }
    ];
    const onExport = vi.fn();
    const modal = createBatchExportModal(summaries, onExport);
    const checkboxes = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-item]");

    expect(modal.textContent).toContain("First conversation");
    expect(modal.textContent).toContain("会话ID: conv-1");
    expect(modal.textContent).toContain("更新时间: 更新时间文本");
    expect(modal.textContent).toContain("创建时间: 创建时间文本");
    expect(modal.textContent).toContain("3 轮");
    expect(checkboxes).toHaveLength(2);
    expect(Array.from(checkboxes).every((item) => item.checked)).toBe(true);

    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='html']")?.click();

    expect(onExport).toHaveBeenCalledWith("html", [
      { summary: summaries[0], selectedMessageIndices: undefined }
    ], expect.any(Function));
  });

  it("shows a loading state while exporting batch conversation files", async () => {
    const pending = deferred();
    const summaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" }
    ];
    const onExport = vi.fn(() => pending.promise);
    const modal = createBatchExportModal(summaries, onExport);
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();
    await Promise.resolve();

    expect(onExport).toHaveBeenCalledWith("markdown", [
      { summary: summaries[0], selectedMessageIndices: undefined }
    ], expect.any(Function));
    expect(modal.querySelector("[data-ai-chat-helper-export-loading]")?.textContent).toContain("正在导出文件");
    expect(modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.disabled).toBe(true);
    expect(document.getElementById("ai-chat-helper-export-modal")).toBe(modal);

    pending.resolve();
    await flushUntil(() => !document.getElementById("ai-chat-helper-export-modal"));

    expect(document.getElementById("ai-chat-helper-export-modal")).toBeFalsy();
  });

  it("disables batch export when no conversations are selected", () => {
    const modal = createBatchExportModal([
      { platformId: "claude", conversationId: "conv-1", title: "Only conversation" }
    ], vi.fn());
    const checkbox = modal.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-item]");
    const htmlButton = modal.querySelector<HTMLButtonElement>("[data-format='html']");

    expect(modal.querySelector("[data-format='zip']")).toBeFalsy();
    expect(htmlButton?.disabled).toBe(false);

    if (checkbox) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(htmlButton?.disabled).toBe(true);
  });

  it("toggles all batch conversations and updates the selected count", () => {
    const modal = createBatchExportModal([
      { platformId: "deepseek", conversationId: "conv-1", title: "First" },
      { platformId: "deepseek", conversationId: "conv-2", title: "Second" }
    ], vi.fn());
    const toggle = modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-toggle]");
    const status = modal.querySelector("[data-ai-chat-helper-batch-selection-status]");
    const htmlButton = modal.querySelector<HTMLButtonElement>("[data-format='html']");
    const checkboxes = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-item]");

    expect(status?.textContent).toBe("已选 2 条");
    expect(toggle?.textContent).toBe("全不选");

    toggle?.click();

    expect(Array.from(checkboxes).every((item) => !item.checked)).toBe(true);
    expect(status?.textContent).toBe("已选 0 条");
    expect(toggle?.textContent).toBe("全选");
    expect(htmlButton?.disabled).toBe(true);

    toggle?.click();

    expect(Array.from(checkboxes).every((item) => item.checked)).toBe(true);
    expect(status?.textContent).toBe("已选 2 条");
    expect(toggle?.textContent).toBe("全不选");
    expect(htmlButton?.disabled).toBe(false);
  });

  it("previews a batch conversation and exports its stored message selection", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" },
      { platformId: "chatgpt", conversationId: "conv-2", title: "Second conversation" }
    ];
    const loadSnapshot = vi.fn(async () => snapshot);
    const onExport = vi.fn();
    const modal = createBatchExportModal(summaries, { onExport, loadSnapshot });

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();

    expect(loadSnapshot).toHaveBeenCalledWith(summaries[0]);
    expect(modal.textContent).toContain("查看对话消息");
    const messageInputs = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-message-item]");
    expect(messageInputs).toHaveLength(3);

    messageInputs[0].checked = false;
    messageInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-close]")?.click();

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();

    expect(onExport).toHaveBeenCalledWith("markdown", [
      { summary: summaries[0], selectedMessageIndices: [1, 2] },
      { summary: summaries[1], selectedMessageIndices: undefined }
    ], expect.any(Function));
  });

  it("carries DeepSeek textWithoutThought choices from batch preview into export selections", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "deepseek", conversationId: "deepseek-1", title: "DeepSeek conversation" }
    ];
    const deepseekSnapshot: ConversationSnapshot = {
      platformId: "deepseek",
      conversationId: "deepseek-1",
      title: "DeepSeek conversation",
      attachments: [],
      messages: [
        { id: "user-1", role: "user", text: "Question" },
        {
          id: "answer-1",
          role: "assistant",
          text: "思考过程\n\n最终回答",
          hasThought: true,
          textWithoutThought: "最终回答",
          fragmentType: "RESPONSE"
        }
      ]
    };
    const onExport = vi.fn();
    const modal = createBatchExportModal(summaries, {
      onExport,
      loadSnapshot: vi.fn(async () => deepseekSnapshot)
    });

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-exclude-thought]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-export-menu-trigger]")?.click();
    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();

    expect(onExport).toHaveBeenCalledWith("markdown", [
      {
        summary: summaries[0],
        selectedMessageIndices: [0, 1],
        textWithoutThoughtMessageIds: ["answer-1"]
      }
    ], expect.any(Function));
  });

  it("keeps a batch preview message selection when the preview is reopened", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "claude", conversationId: "conv-1", title: "First conversation" }
    ];
    const modal = createBatchExportModal(summaries, { loadSnapshot: vi.fn(async () => snapshot) });

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();

    let messageInputs = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-message-item]");
    messageInputs[2].checked = false;
    messageInputs[2].dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview-close]")?.click();

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();

    messageInputs = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-message-item]");
    expect(Array.from(messageInputs).map((input) => input.checked)).toEqual([true, true, false]);
  });

  it("opens a batch preview as a right-side drawer and keeps image skeletons", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" }
    ];
    const batchPreviewSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "batch-image",
        role: "assistant",
        text: "![生成图](https://assets.example.com/generated.png)",
        attachments: []
      }]
    };
    const modal = createBatchExportModal(summaries, { loadSnapshot: vi.fn(async () => batchPreviewSnapshot) });
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();

    const batchBody = modal.querySelector<HTMLElement>(".ai-chat-helper-export-modal__batch-body");
    const batchBox = modal.querySelector<HTMLElement>(".ai-chat-helper-export-modal__box--batch");
    const preview = modal.querySelector<HTMLElement>("[data-ai-chat-helper-batch-preview-panel]");
    const media = preview?.querySelector<HTMLElement>(".ai-chat-helper-export-modal__message-media");

    expect(batchBody?.classList.contains("has-preview")).toBe(true);
    expect(batchBox?.classList.contains("has-preview")).toBe(true);
    expect(preview).toBeTruthy();
    expect(preview?.parentElement).toBe(modal);
    expect(batchBody?.contains(preview || null)).toBe(false);
    expect(media?.dataset.imageLoading).toBe("true");
    expect(media?.querySelector(".ai-chat-helper-export-modal__message-media-skeleton")).toBeTruthy();
    expect(preview?.innerHTML).toContain("https://assets.example.com/generated.png");
  });

  it("opens a full message preview from the batch conversation preview", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" }
    ];
    const batchPreviewSnapshot: ConversationSnapshot = {
      ...snapshot,
      messages: [{
        id: "batch-long",
        role: "user",
        text: "用户第一行\n用户第二行\n用户第三行\n用户第四行"
      }]
    };
    const modal = createBatchExportModal(summaries, { loadSnapshot: vi.fn(async () => batchPreviewSnapshot) });
    document.body.appendChild(modal);

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-preview]")?.click();
    await flushPreviewLoad();
    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-batch-message-view]")?.click();

    const fullPreview = document.querySelector<HTMLElement>("[data-ai-chat-helper-full-preview]");
    expect(fullPreview?.textContent).toContain("用户问题全文");
    expect(fullPreview?.textContent).toContain("用户第四行");
  });

  it("allows setting a new batch display limit and refreshes the summary list and count", async () => {
    const summaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" }
    ];
    const newSummaries: ConversationSummary[] = [
      { platformId: "chatgpt", conversationId: "conv-1", title: "First conversation" },
      { platformId: "chatgpt", conversationId: "conv-2", title: "Second conversation" }
    ];
    const onLimitChange = vi.fn(async (newLimit: number) => {
      expect(newLimit).toBe(10);
      return newSummaries;
    });

    const modal = createBatchExportModal(summaries, {
      batchLimit: 5,
      onLimitChange
    });
    document.body.appendChild(modal);

    const limitInput = modal.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-limit-input]");
    expect(limitInput).toBeTruthy();
    expect(limitInput?.value).toBe("5");

    limitInput!.value = "10";
    limitInput!.dispatchEvent(new Event("change", { bubbles: true }));

    await flushPreviewLoad();

    expect(onLimitChange).toHaveBeenCalledWith(10);
    expect(modal.querySelector(".ai-chat-helper-export-modal__header div span")?.textContent).toContain("2 个对话");
    expect(modal.querySelectorAll("[data-ai-chat-helper-batch-item]")).toHaveLength(2);
    expect(modal.textContent).toContain("Second conversation");
  });
});



