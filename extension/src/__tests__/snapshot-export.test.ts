import { afterEach, describe, expect, it, vi } from "vitest";
import { exportBatchSnapshots, exportSnapshot } from "../exporters/snapshot-export";
import type { ConversationSnapshot } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "claude",
  conversationId: "conv-1",
  title: "Zip Chat",
  attachments: [],
  messages: [
    { id: "1", role: "user", text: "hello" },
    { id: "2", role: "assistant", text: "hi" }
  ]
};

const snapshotWithAttachmentContent: ConversationSnapshot = {
  ...snapshot,
  attachments: [
    {
      id: "global",
      fileName: "diagram.png",
      mimeType: "image/png",
      content: "PNGDATA"
    }
  ],
  messages: [
    {
      id: "msg-1",
      role: "user",
      text: "see attached",
      attachments: [
        {
          id: "message-file",
          fileName: "../notes.txt",
          mimeType: "text/plain",
          content: "notes"
        }
      ]
    }
  ]
};

const snapshotWithRemoteImage: ConversationSnapshot = {
  ...snapshot,
  title: "Image Chat",
  messages: [
    {
      id: "msg-image",
      role: "assistant",
      text: "Generated an image.",
      attachments: [
        {
          id: "remote-image",
          fileName: "generated.png",
          mimeType: "image/png",
          url: "https://assets.example.com/generated.png"
        }
      ]
    }
  ]
};

const chatgptSnapshotWithGeneratedImage: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "chatgpt-image",
  title: "ChatGPT Image Chat",
  attachments: [],
  messages: [
    {
      id: "msg-chatgpt-image",
      role: "assistant",
      text: "Here is the generated image.\n[图片] https://assets.example.com/chatgpt-generated.png",
      attachments: [
        {
          id: "chatgpt-image",
          fileName: "Generated cat",
          mimeType: "image/png",
          url: "https://assets.example.com/chatgpt-generated.png"
        }
      ]
    }
  ]
};

const chatgptSnapshotWithTitleOnlyImage: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "chatgpt-title-image",
  title: "ChatGPT Title Image Chat",
  attachments: [],
  messages: [
    {
      id: "msg-chatgpt-title-image",
      role: "assistant",
      text: "[图片] Generated cat"
    }
  ]
};

const qwenSnapshotWithAssistantImage: ConversationSnapshot = {
  platformId: "qwen",
  conversationId: "qwen-image",
  title: "Qwen Image Chat",
  attachments: [],
  messages: [
    {
      id: "qwen-image-message",
      role: "assistant",
      text: "[图片] chart.png",
      attachments: [
        {
          id: "qwen-image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://assets.example.com/qwen-chart.png"
        }
      ]
    }
  ]
};

const qwenSnapshot: ConversationSnapshot = {
  platformId: "qwen",
  conversationId: "qwen-1",
  title: "Qwen Label Chat",
  attachments: [],
  messages: [
    { id: "qwen-user", role: "user", text: "你好" },
    { id: "qwen-assistant", role: "assistant", text: "你好，我是千问。" }
  ]
};

const doubaoSnapshotWithAssistantImage: ConversationSnapshot = {
  platformId: "doubao",
  conversationId: "doubao-image",
  title: "Doubao Image Chat",
  attachments: [],
  messages: [
    {
      id: "doubao-image-message",
      role: "assistant",
      text: "[图片] https://assets.example.com/doubao-image.png",
      attachments: [
        {
          id: "doubao-image",
          fileName: "doubao-image.png",
          mimeType: "image/png",
          url: "https://assets.example.com/doubao-image.png"
        }
      ]
    }
  ]
};

const snapshotWithEscapedRemoteImageUrl: ConversationSnapshot = {
  ...snapshot,
  title: "Escaped Image Chat",
  messages: [
    {
      id: "msg-escaped-image",
      role: "assistant",
      text: "Rendered image: <img src=\"https://assets.example.com/generated.png?token=one&amp;sig=two\">",
      attachments: [
        {
          id: "remote-image",
          fileName: "generated.png",
          mimeType: "image/png",
          url: "https://assets.example.com/generated.png?token=one&sig=two"
        }
      ]
    }
  ]
};

const snapshotWithTextOnlyImageDownloadUrl: ConversationSnapshot = {
  ...snapshot,
  title: "Text Image Download Chat",
  messages: [
    {
      id: "msg-text-image-download",
      role: "assistant",
      text: "![chart](https://assets.example.com/download?id=img-1)"
    }
  ]
};

const snapshotWithInlineHtmlAttachment: ConversationSnapshot = {
  ...snapshot,
  title: "Inline HTML Chat",
  messages: [
    {
      id: "msg-inline-html",
      role: "assistant",
      text: "I attached an interactive preview.",
      attachments: [
        {
          id: "preview-file",
          fileName: "preview.html",
          mimeType: "text/html",
          content: "<section><h2>Revenue Widget</h2><p>Growth is 42%.</p></section>"
        }
      ]
    }
  ]
};

const snapshotWithRepresentedInlineHtmlAttachment: ConversationSnapshot = {
  ...snapshotWithInlineHtmlAttachment,
  messages: [
    {
      ...snapshotWithInlineHtmlAttachment.messages[0],
      text: "I attached an interactive preview.\n\n[附件1] preview.html"
    }
  ]
};

const snapshotWithRepresentedFileAttachment: ConversationSnapshot = {
  ...snapshot,
  title: "File Attachment Chat",
  messages: [
    {
      id: "msg-file",
      role: "assistant",
      text: "Please inspect this file.\n\n[附件1] brief.pdf\n链接: https://example.com/brief.pdf",
      attachments: [
        {
          id: "brief-file",
          fileName: "brief.pdf",
          mimeType: "application/pdf",
          url: "https://example.com/brief.pdf"
        }
      ]
    }
  ]
};

const snapshotWithRepresentedClaudeImageAttachment: ConversationSnapshot = {
  ...snapshot,
  title: "Claude Image Attachment Chat",
  messages: [
    {
      id: "msg-claude-image",
      role: "assistant",
      text: "Here is the chart.\n\n[图片1] chart.png",
      attachments: [
        {
          id: "chart-image",
          fileName: "chart.png",
          mimeType: "image/png",
          url: "https://assets.example.com/chart.png"
        }
      ]
    }
  ]
};

const claudeSvgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg>')}`;

const snapshotWithRepresentedClaudeSvgAttachment: ConversationSnapshot = {
  ...snapshot,
  title: "Claude SVG Attachment Chat",
  messages: [
    {
      id: "msg-claude-svg",
      role: "assistant",
      text: "Here is the diagram.\n\n[图像1] flow.svg",
      attachments: [
        {
          id: "flow-svg",
          fileName: "flow.svg",
          mimeType: "image/svg+xml",
          url: claudeSvgDataUrl
        }
      ]
    }
  ]
};

function mockImageFetch(contentType = "image/png"): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    headers: {
      get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null
    },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
  } as Response);
}

describe("exportSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("exports a single requested format", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T02:03:04Z"));

    const files = await exportSnapshot(snapshot, "html");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("Claude_Export_2026-06-08_02_03_04.html");
  });

  it("packages inline attachment content into current conversation exports", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T02:03:04Z"));

    const files = await exportSnapshot(snapshotWithAttachmentContent, "markdown");
    const text = new TextDecoder().decode(files[0].content as Uint8Array);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("Claude_Export_2026-06-08_02_03_04.zip");
    expect(files[0].mimeType).toBe("application/zip");
    expect(text).toContain("Claude_Export_2026-06-08_02_03_04.md");
    expect(text).toContain("attachments/global/diagram.png");
    expect(text).toContain("attachments/msg-1/notes.txt");
    expect(text).toContain("PNGDATA");
    expect(text).toContain("notes");
  });

  it("exports all current-conversation formats as a zip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T02:03:04Z"));

    const [file] = await exportSnapshot(snapshot, "zip");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(file.path).toBe("Claude_Export_2026-06-08_02_03_04.zip");
    expect(file.mimeType).toBe("application/zip");
    expect(text).toContain("Claude_Export_2026-06-08_02_03_04.html");
    expect(text).toContain("Claude_Export_2026-06-08_02_03_04.md");
    expect(text).toContain("Claude_Export_2026-06-08_02_03_04.txt");
  });

  it("packages inline attachment content into current-conversation zip exports", async () => {
    const [file] = await exportSnapshot(snapshotWithAttachmentContent, "zip");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("attachments/global/diagram.png");
    expect(text).toContain("attachments/msg-1/notes.txt");
    expect(text).toContain("PNGDATA");
    expect(text).toContain("notes");
  });

  it("packages fetched image attachment urls into current conversation exports", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T02:03:04Z"));
    mockImageFetch("image/png");

    const [file] = await exportSnapshot(snapshotWithRemoteImage, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(file.path).toBe("Claude_Export_2026-06-08_02_03_04.zip");
    expect(file.mimeType).toBe("application/zip");
    expect(fetch).toHaveBeenCalledWith("https://assets.example.com/generated.png", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    expect(text).toContain("Claude_Export_2026-06-08_02_03_04.md");
    expect(text).toContain("images/image-001.png");
    expect(text).toContain("![generated.png](images/image-001.png)");
  });

  it("rewrites HTML-escaped image urls in exported text when archiving images", async () => {
    mockImageFetch("image/png");

    const [file] = await exportSnapshot(snapshotWithEscapedRemoteImageUrl, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(fetch).toHaveBeenCalledWith("https://assets.example.com/generated.png?token=one&sig=two", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    expect(text).toContain("<img src=\"images/image-001.png\">");
    expect(text).not.toContain("https://assets.example.com/generated.png?token=one&amp;sig=two");
  });

  it("archives image URLs from markdown text even when the URL has no image extension", async () => {
    mockImageFetch("image/png");

    const [file] = await exportSnapshot(snapshotWithTextOnlyImageDownloadUrl, "markdown");
    expect(file.mimeType).toBe("application/zip");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(fetch).toHaveBeenCalledWith("https://assets.example.com/download?id=img-1", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    expect(text).toContain("images/image-001.png");
    expect(text).toContain("![chart](images/image-001.png)");
    expect(text).not.toContain("https://assets.example.com/download?id=img-1");
  });

  it("archives inline HTML attachments under files and links exported current markdown to them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T02:03:04Z"));

    const [file] = await exportSnapshot(snapshotWithInlineHtmlAttachment, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(file.path).toBe("Claude_Export_2026-06-08_02_03_04.zip");
    expect(text).toContain("files/preview.html");
    expect(text).toContain("<section><h2>Revenue Widget</h2><p>Growth is 42%.</p></section>");
    expect(text).toContain("[preview.html](files/preview.html)");
    expect(text).not.toContain("attachments/msg-inline-html/preview.html");
  });

  it("folds represented inline HTML attachments into current markdown like the userscript", async () => {
    const [file] = await exportSnapshot(snapshotWithRepresentedInlineHtmlAttachment, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("I attached an interactive preview.");
    expect(text).toContain("附件快照：preview.html");
    expect(text).toContain("[附件1 preview.html](files/preview.html)");
    expect(text).not.toContain("[附件1] preview.html\n\n#### 附件");
    expect(text).not.toContain("[preview.html](files/preview.html)");
  });

  it("adds archived inline HTML links to represented current text attachments without duplicate attachment lines", async () => {
    const [file] = await exportSnapshot(snapshotWithRepresentedInlineHtmlAttachment, "txt");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("[附件1] preview.html\n链接: files/preview.html");
    expect(text).not.toContain("附件: preview.html <files/preview.html>");
  });

  it("formats represented Claude file attachments as userscript-style current markdown links", async () => {
    const [file] = await exportSnapshot(snapshotWithRepresentedFileAttachment, "markdown");
    const text = String(file.content);

    expect(text).toContain("[附件1 brief.pdf](https://example.com/brief.pdf)");
    expect(text).not.toContain("[附件1] brief.pdf\n链接: https://example.com/brief.pdf");
    expect(text).not.toContain("#### 附件");
  });

  it("renders represented Claude file attachments as userscript-style current html links", async () => {
    const [file] = await exportSnapshot(snapshotWithRepresentedFileAttachment, "html");
    const text = String(file.content);

    expect(text).toContain('Please inspect this file.');
    expect(text).toContain('[附件] <a href="https://example.com/brief.pdf" target="_blank" rel="noreferrer">brief.pdf</a>');
    expect(text).not.toContain("[附件1] brief.pdf");
    expect(text).not.toContain("链接: https://example.com/brief.pdf");
    expect(text).not.toContain("<ul>");
  });

  it("renders represented inline HTML attachments inside current html message bodies", async () => {
    const [file] = await exportSnapshot(snapshotWithRepresentedInlineHtmlAttachment, "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("I attached an interactive preview.");
    expect(text).toContain('<figure class="claude-html-widget-block">');
    expect(text).toContain("交互内容 · preview.html");
    expect(text).not.toContain("[附件1] preview.html");
    expect(text).not.toContain("<ul><li><figure class=\"claude-html-widget-block\">");
  });

  it("formats represented Claude image attachments as userscript-style current exports", async () => {
    mockImageFetch("image/png");

    const [markdownFile] = await exportSnapshot(snapshotWithRepresentedClaudeImageAttachment, "markdown");
    const markdownText = new TextDecoder().decode(markdownFile.content as Uint8Array);
    const [txtFile] = await exportSnapshot(snapshotWithRepresentedClaudeImageAttachment, "txt");
    const txtText = new TextDecoder().decode(txtFile.content as Uint8Array);
    const [htmlFile] = await exportSnapshot(snapshotWithRepresentedClaudeImageAttachment, "html");
    const htmlText = new TextDecoder().decode(htmlFile.content as Uint8Array);

    expect(markdownText).toContain("![图片1 chart.png](images/image-001.png)");
    expect(markdownText).not.toContain("![图片](images/image-001.png)");
    expect(markdownText).not.toContain("#### 附件");
    expect(txtText).toContain("[图片1] chart.png");
    expect(txtText).not.toContain("[图片] images/image-001.png");
    expect(htmlText).toContain('<figure class="claude-image-block">');
    expect(htmlText).toContain('src="images/image-001.png"');
    expect(htmlText).toContain("<figcaption>图片1 · chart.png</figcaption>");
    expect(htmlText).not.toContain('alt="图片"');
  });

  it("formats represented Claude SVG attachments as userscript-style current exports", async () => {
    const [markdownFile] = await exportSnapshot(snapshotWithRepresentedClaudeSvgAttachment, "markdown");
    const markdownText = String(markdownFile.content);
    const [htmlFile] = await exportSnapshot(snapshotWithRepresentedClaudeSvgAttachment, "html");
    const htmlText = String(htmlFile.content);

    expect(markdownText).toContain(`![图像1 flow.svg](${claudeSvgDataUrl})`);
    expect(markdownText).not.toContain("#### 附件");
    expect(htmlText).toContain('<figure class="claude-image-block claude-svg-block">');
    expect(htmlText).toContain('<div class="claude-inline-svg"><svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg></div>');
    expect(htmlText).toContain("<figcaption>图像1 · flow.svg</figcaption>");
    expect(htmlText).not.toContain(`src="${claudeSvgDataUrl}"`);
  });

  it("uses userscript-style ChatGPT generated image markdown without duplicate attachment blocks", async () => {
    mockImageFetch("image/png");

    const [file] = await exportSnapshot(chatgptSnapshotWithGeneratedImage, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("![图片](images/image-001.png)");
    expect(text).not.toContain("Here is the generated image.");
    expect(text).not.toContain("[图片] images/image-001.png");
    expect(text).not.toContain("#### 附件");
    expect(text).not.toContain("![Generated cat](images/image-001.png)");
  });

  it("uses userscript-style ChatGPT title-only image markdown", async () => {
    const [file] = await exportSnapshot(chatgptSnapshotWithTitleOnlyImage, "markdown");
    const text = String(file.content);

    expect(text).toContain("[图片地址缺失]\n\nGenerated cat");
    expect(text).not.toContain("[图片] Generated cat");
  });

  it("exports Qwen assistant image placeholders as a single markdown image", async () => {
    mockImageFetch("image/png");

    const [file] = await exportSnapshot(qwenSnapshotWithAssistantImage, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("![图片](images/image-001.png)");
    expect(text).not.toContain("[图片] chart.png");
    expect(text).not.toContain("#### 附件");
    expect(text).not.toContain("![chart.png](images/image-001.png)");
  });

  it("retries image downloads using userscript-style credential fallbacks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("include failed"))
      .mockRejectedValueOnce(new Error("same-origin failed"))
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-type" ? "image/png" : null
        },
        arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
      } as Response);

    const [file] = await exportSnapshot(snapshotWithRemoteImage, "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://assets.example.com/generated.png", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://assets.example.com/generated.png", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://assets.example.com/generated.png", {
      method: "GET",
      cache: "no-store"
    });
    expect(text).toContain("images/image-001.png");
    expect(text).not.toContain("README.txt");
  });

  it("packages batch exports into a single archive", async () => {
    const files = await exportBatchSnapshots([
      { ...snapshot, updatedAt: "2026-06-08T02:00:05Z", updatedAtText: "2026/6/8 10:00:05" },
      { ...snapshot, conversationId: "conv-2", title: "Second" }
    ], "markdown");
    const text = new TextDecoder().decode(files[0].content as Uint8Array);

    expect(files).toHaveLength(1);
    expect(files[0].path).toMatch(/^Claude_批量导出_md_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}_\d{2}\.zip$/);
    expect(files[0].mimeType).toBe("application/zip");
    expect(files[0].content).toBeInstanceOf(Uint8Array);
    expect(text).toContain("- 会话ID: conv-1");
    expect(text).toContain("- 更新时间: 2026/6/8 10:00:05");
    expect(text).toContain("- 消息数: 2");
  });

  it("uses provided messageCount in userscript-style batch markdown, txt, and html metadata", async () => {
    const batchSnapshot = { ...snapshot, messageCount: 12 };
    const [markdownFile] = await exportBatchSnapshots([batchSnapshot], "markdown");
    const markdownText = new TextDecoder().decode(markdownFile.content as Uint8Array);
    const [txtFile] = await exportBatchSnapshots([batchSnapshot], "txt");
    const txtText = new TextDecoder().decode(txtFile.content as Uint8Array);
    const [htmlFile] = await exportBatchSnapshots([batchSnapshot], "html");
    const htmlText = new TextDecoder().decode(htmlFile.content as Uint8Array);

    expect(markdownText).toContain("- 消息数: 12");
    expect(markdownText).not.toContain("- 消息数: 2");
    expect(txtText).toContain("消息数: 12");
    expect(txtText).not.toContain("消息数: 2");
    expect(htmlText).toContain("消息数: 12");
    expect(htmlText).not.toContain("消息数: 2");
  });

  it("uses userscript-style batch markdown message headings", async () => {
    const [file] = await exportBatchSnapshots([snapshot], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("# Zip Chat");
    expect(text).toContain("## 1. 用户\n\nhello");
    expect(text).toContain("## 2. Claude\n\nhi");
    expect(text).not.toContain("### 🧑 用户问题");
  });

  it("uses userscript-style batch txt message headings", async () => {
    const [file] = await exportBatchSnapshots([snapshot], "txt");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("Zip Chat\n会话ID: conv-1");
    expect(text).toContain("[1] 用户\nhello");
    expect(text).toContain("[2] Claude\nhi");
    expect(text).not.toContain("【用户问题】");
  });

  it("uses userscript-style batch printable html", async () => {
    const [file] = await exportBatchSnapshots([snapshot], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain('<div class="platform">Claude 批量导出</div>');
    expect(text).toContain('<div class="title">Zip Chat</div>');
    expect(text).toContain('<div class="role">1. 用户</div>');
    expect(text).toContain('<div class="role">2. Claude</div>');
    expect(text).not.toContain("第 1 轮对话");
  });

  it("repairs split markdown heading markers in non-ChatGPT batch html exports", async () => {
    const [file] = await exportBatchSnapshots([{
      ...snapshot,
      messages: [
        { id: "1", role: "assistant", text: "# # Section\n\nBody" }
      ]
    }], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("<h2>Section</h2>");
    expect(text).not.toContain("<h1># Section</h1>");
  });

  it("uses the userscript Qwen batch label in markdown and html exports", async () => {
    const [markdownFile] = await exportBatchSnapshots([qwenSnapshot], "markdown");
    const markdownText = new TextDecoder().decode(markdownFile.content as Uint8Array);
    const [htmlFile] = await exportBatchSnapshots([qwenSnapshot], "html");
    const htmlText = new TextDecoder().decode(htmlFile.content as Uint8Array);

    expect(markdownText).toContain("## 2. 千问\n\n你好，我是千问。");
    expect(markdownText).not.toContain("## 2. 通义千问");
    expect(htmlText).toContain('<div class="platform">千问 批量导出</div>');
    expect(htmlText).toContain('<div class="role">2. 千问</div>');
    expect(htmlText).not.toContain("通义千问 批量导出");
  });

  it("keeps duplicate batch conversation titles as userscript-style root files", async () => {
    const [file] = await exportBatchSnapshots([snapshot, { ...snapshot, conversationId: "conv-2" }], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("Zip Chat.md");
    expect(text).toContain("Zip Chat (2).md");
    expect(text).not.toContain("Zip Chat - conv-1/Zip Chat.md");
  });

  it("sanitizes batch conversation filenames with userscript-style spaces", async () => {
    const [file] = await exportBatchSnapshots([{
      ...snapshot,
      title: "Bad/Title: Demo?."
    }], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("Bad Title Demo.md");
    expect(text).not.toContain("Bad_Title_ Demo_.md");
    expect(text).not.toContain("Bad Title Demo..md");
  });

  it("packages fetched image attachment urls into batch exports", async () => {
    mockImageFetch("image/webp");

    const [file] = await exportBatchSnapshots([snapshotWithRemoteImage], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(file.path).toMatch(/^Claude_批量导出_html_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}_\d{2}\.zip$/);
    expect(fetch).toHaveBeenCalledWith("https://assets.example.com/generated.png", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    expect(text).toContain("images/image-001.webp");
    expect(text).toContain("src=\"images/image-001.webp\"");
  });

  it("avoids README filename collisions in batch image failure archives", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const [file] = await exportBatchSnapshots([{
      ...snapshotWithRemoteImage,
      conversationId: "readme-chat",
      title: "README"
    }], "txt");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("README.txt");
    expect(text).toContain("README (2).txt");
    expect(text).toContain("以下图片下载失败，导出文件中会保留原始图片 URL：");
    expect(text).toContain("https://assets.example.com/generated.png -> network down");
  });

  it("archives inline HTML attachments under files and links batch text to them", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithInlineHtmlAttachment], "txt");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("files/preview.html");
    expect(text).toContain("<section><h2>Revenue Widget</h2><p>Growth is 42%.</p></section>");
    expect(text).toContain("附件: preview.html <files/preview.html>");
    expect(text).not.toContain("attachments/msg-inline-html/preview.html");
  });

  it("folds represented inline HTML attachments into batch markdown like the userscript", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithRepresentedInlineHtmlAttachment], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("## 1. Claude\n\nI attached an interactive preview.");
    expect(text).toContain("附件快照：preview.html");
    expect(text).toContain("[附件1 preview.html](files/preview.html)");
    expect(text).not.toContain("[附件1] preview.html\n\n### 附件");
    expect(text).not.toContain("[preview.html](files/preview.html)");
  });

  it("adds archived inline HTML links to represented batch text attachments without duplicate attachment lines", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithRepresentedInlineHtmlAttachment], "txt");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("[1] Claude\nI attached an interactive preview.\n\n[附件1] preview.html\n链接: files/preview.html");
    expect(text).not.toContain("附件: preview.html <files/preview.html>");
  });

  it("formats represented Claude file attachments as userscript-style batch markdown links", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithRepresentedFileAttachment], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("[附件1 brief.pdf](https://example.com/brief.pdf)");
    expect(text).not.toContain("[附件1] brief.pdf\n链接: https://example.com/brief.pdf");
    expect(text).not.toContain("### 附件");
  });

  it("renders represented Claude file attachments as userscript-style batch html links", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithRepresentedFileAttachment], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain('<div class="platform">Claude 批量导出</div>');
    expect(text).toContain('Please inspect this file.');
    expect(text).toContain('[附件] <a href="https://example.com/brief.pdf" target="_blank" rel="noreferrer">brief.pdf</a>');
    expect(text).not.toContain("[附件1] brief.pdf");
    expect(text).not.toContain("链接: https://example.com/brief.pdf");
    expect(text).not.toContain("<ul>");
  });

  it("renders represented inline HTML attachments inside batch html message bodies", async () => {
    const [file] = await exportBatchSnapshots([snapshotWithRepresentedInlineHtmlAttachment], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain('<div class="platform">Claude 批量导出</div>');
    expect(text).toContain("I attached an interactive preview.");
    expect(text).toContain('<figure class="claude-html-widget-block">');
    expect(text).toContain("交互内容 · preview.html");
    expect(text).not.toContain("[附件1] preview.html");
    expect(text).not.toContain("<ul><li><figure class=\"claude-html-widget-block\">");
  });

  it("formats represented Claude image attachments as userscript-style batch exports", async () => {
    mockImageFetch("image/png");

    const [markdownFile] = await exportBatchSnapshots([snapshotWithRepresentedClaudeImageAttachment], "markdown");
    const markdownText = new TextDecoder().decode(markdownFile.content as Uint8Array);
    const [txtFile] = await exportBatchSnapshots([snapshotWithRepresentedClaudeImageAttachment], "txt");
    const txtText = new TextDecoder().decode(txtFile.content as Uint8Array);
    const [htmlFile] = await exportBatchSnapshots([snapshotWithRepresentedClaudeImageAttachment], "html");
    const htmlText = new TextDecoder().decode(htmlFile.content as Uint8Array);

    expect(markdownText).toContain("## 1. Claude\n\nHere is the chart.\n\n![图片1 chart.png](images/image-001.png)");
    expect(markdownText).not.toContain("![图片](images/image-001.png)");
    expect(markdownText).not.toContain("### 附件");
    expect(txtText).toContain("[1] Claude\nHere is the chart.\n\n[图片1] chart.png");
    expect(txtText).not.toContain("[图片] images/image-001.png");
    expect(htmlText).toContain('<div class="platform">Claude 批量导出</div>');
    expect(htmlText).toContain('<figure class="claude-image-block">');
    expect(htmlText).toContain('src="images/image-001.png"');
    expect(htmlText).toContain("<figcaption>图片1 · chart.png</figcaption>");
    expect(htmlText).not.toContain('alt="图片"');
  });

  it("formats represented Claude SVG attachments as userscript-style batch exports", async () => {
    const [markdownFile] = await exportBatchSnapshots([snapshotWithRepresentedClaudeSvgAttachment], "markdown");
    const markdownText = new TextDecoder().decode(markdownFile.content as Uint8Array);
    const [htmlFile] = await exportBatchSnapshots([snapshotWithRepresentedClaudeSvgAttachment], "html");
    const htmlText = new TextDecoder().decode(htmlFile.content as Uint8Array);

    expect(markdownText).toContain(`![图像1 flow.svg](${claudeSvgDataUrl})`);
    expect(markdownText).not.toContain("### 附件");
    expect(htmlText).toContain('<div class="platform">Claude 批量导出</div>');
    expect(htmlText).toContain('<figure class="claude-image-block claude-svg-block">');
    expect(htmlText).toContain('<div class="claude-inline-svg"><svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg></div>');
    expect(htmlText).toContain("<figcaption>图像1 · flow.svg</figcaption>");
    expect(htmlText).not.toContain(`src="${claudeSvgDataUrl}"`);
  });

  it("uses userscript-style ChatGPT generated image markdown in batch exports", async () => {
    mockImageFetch("image/png");

    const [file] = await exportBatchSnapshots([chatgptSnapshotWithGeneratedImage], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("## 1. ChatGPT\n\n![图片](images/image-001.png)");
    expect(text).not.toContain("Here is the generated image.");
    expect(text).not.toContain("[图片] images/image-001.png");
    expect(text).not.toContain("### 附件");
    expect(text).not.toContain("![Generated cat](images/image-001.png)");
  });

  it("exports Doubao assistant image placeholders once in batch markdown", async () => {
    mockImageFetch("image/png");

    const [file] = await exportBatchSnapshots([doubaoSnapshotWithAssistantImage], "markdown");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("## 1. 豆包\n\n![图片](images/image-001.png)");
    expect(text).not.toContain("[图片] images/image-001.png");
    expect(text).not.toContain("### 附件");
    expect(text).not.toContain("![doubao-image.png](images/image-001.png)");
  });

  it("adds userscript-style conversation metadata to batch html exports", async () => {
    const [file] = await exportBatchSnapshots([{
      ...snapshot,
      updatedAt: "2026-06-08T02:00:05Z",
      updatedAtText: "2026/6/8 10:00:05"
    }], "html");
    const text = new TextDecoder().decode(file.content as Uint8Array);

    expect(text).toContain("会话ID: conv-1");
    expect(text).toContain("更新时间: 2026/6/8 10:00:05");
    expect(text).toContain("消息数: 2");
  });
});
