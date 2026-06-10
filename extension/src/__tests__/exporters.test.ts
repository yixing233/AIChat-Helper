import { describe, expect, it } from "vitest";
import { htmlExporter } from "../exporters/html";
import { markdownExporter } from "../exporters/markdown";
import { txtExporter } from "../exporters/txt";
import { createZip } from "../exporters/zip";
import type { ConversationSnapshot, ExportFile } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "abc",
  title: "Sample Chat",
  attachments: [],
  messages: [
    { id: "1", role: "user", text: "Hello" },
    { id: "2", role: "assistant", text: "Hi there" }
  ]
};

const attachmentSnapshot: ConversationSnapshot = {
  ...snapshot,
  title: "Attachment Chat",
  attachments: [
    {
      id: "global-image",
      fileName: "diagram.png",
      mimeType: "image/png",
      url: "https://example.com/diagram.png"
    }
  ],
  messages: [
    {
      id: "1",
      role: "user",
      text: "Please inspect this",
      attachments: [
        {
          id: "message-file",
          fileName: "notes.pdf",
          mimeType: "application/pdf",
          url: "https://example.com/notes.pdf"
        }
      ]
    }
  ]
};

const deepseekSnapshot = {
  ...snapshot,
  platformId: "deepseek",
  conversationId: "session-1",
  title: "DeepSeek Conversation",
  metadata: {
    deepseek: {
      sessionId: "session-1",
      title: "DeepSeek Conversation",
      pinned: true,
      createdAt: "2026-06-08T02:00:00Z",
      updatedAt: "2026-06-08T02:00:05Z",
      thinkingEnabled: true,
      searchEnabled: true
    }
  }
} as ConversationSnapshot;

describe("exporters", () => {
  it("exports html", async () => {
    const [file] = await htmlExporter.export(snapshot);
    const content = String(file.content);

    expect(file.path).toBe("Sample Chat.html");
    expect(content).toContain("<title>对话记录导出 - ChatGPT</title>");
    expect(content).toContain('class="page"');
    expect(content).toContain("第 1 轮对话");
    expect(content).toContain("ChatGPT");
    expect(content).toContain("USER QUESTION");
    expect(content).toContain("CHATGPT RESPONSE");
  });

  it("exports markdown", async () => {
    const [file] = await markdownExporter.export(snapshot);
    const content = String(file.content);

    expect(file.path).toBe("Sample Chat.md");
    expect(content).not.toContain("# Sample Chat");
    expect(content).toContain("### 🧑 用户问题");
    expect(content).toContain("### 🤖 ChatGPT回答");
    expect(content).toContain("\n\n---\n\n");
  });

  it("exports txt", async () => {
    const [file] = await txtExporter.export(snapshot);
    const content = String(file.content);

    expect(file.path).toBe("Sample Chat.txt");
    expect(content).toContain("----------------------------\n【用户问题】\n----------------------------\nHello");
    expect(content).toContain("----------------------------\n【ChatGPT】\n----------------------------\nHi there");
  });

  it("renders soft line breaks in html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      platformId: "claude",
      messages: [
        { id: "1", role: "assistant", text: "Line one\nLine two\n\n- item" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain(".text {");
    expect(content).toMatch(/Line one<br>\s*Line two/);
    expect(content).toContain("<li>item</li>");
  });

  it("groups user messages with following assistant replies in html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        { id: "1", role: "user", text: "First question" },
        { id: "2", role: "assistant", text: "First answer" },
        { id: "3", role: "assistant", text: "Follow-up answer" },
        { id: "4", role: "user", text: "Second question" }
      ]
    });
    const content = String(file.content);

    expect(content.match(/class="page"/g)).toHaveLength(2);
    expect(content.indexOf("First question")).toBeLessThan(content.indexOf("Follow-up answer"));
    expect(content.indexOf("Follow-up answer")).toBeLessThan(content.indexOf("第 2 轮对话"));
    expect(content.indexOf("Second question")).toBeGreaterThan(content.indexOf("第 2 轮对话"));
  });

  it("renders ChatGPT markdown code blocks with userscript fallback classes in html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        { id: "1", role: "assistant", text: "```ts\nconst answer = 42;\n```" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('<pre><code class="lang-ts">const answer = 42;');
    expect(content).not.toContain('class="language-ts"');
  });

  it("keeps markdown-it code block classes for non-ChatGPT html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      platformId: "claude",
      messages: [
        { id: "1", role: "assistant", text: "```ts\nconst answer = 42;\n```" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('<pre><code class="language-ts">const answer = 42;');
  });

  it("adds userscript-style markdown html attributes to links tables and images", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      platformId: "claude",
      messages: [
        {
          id: "1",
          role: "assistant",
          text: [
            "[Open](https://example.com)",
            "",
            "![Chart](https://example.com/chart.png)",
            "",
            "| Name |",
            "| --- |",
            "| Ada |"
          ].join("\n")
        }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">Open</a>');
    expect(content).toContain('<img src="https://example.com/chart.png" alt="Chart" loading="lazy">');
    expect(content).toContain('<table class="m-md-table">');
  });

  it("repairs split markdown heading markers for non-ChatGPT html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      platformId: "claude",
      messages: [
        { id: "1", role: "assistant", text: "# # Section\n\nBody" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain("<h2>Section</h2>");
    expect(content).not.toContain("<h1># Section</h1>");
  });

  it("renders markdown math blocks in html exports with MathJax support", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        { id: "1", role: "assistant", text: "Formula:\n\n$$\nE = mc^2\n$$" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('<div class="math-display">\\[E = mc^2\\]</div>');
    expect(content).toContain("tex-mml-chtml.js");
  });

  it("normalizes ChatGPT triple-escaped math delimiters in html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        { id: "1", role: "assistant", text: "\\\\\\(x + y\\\\\\)" }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('<span class="math-inline">\\(x + y\\)</span>');
    expect(content).not.toContain('\\\\\\(x + y\\\\\\)');
  });

  it("tokenizes ChatGPT dollar inline formulas in html exports", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        { id: "1", role: "assistant", text: "Formula: $a+b$ stays inline." }
      ]
    });
    const content = String(file.content);

    expect(content).toContain('Formula: <span class="math-inline">\\(a+b\\)</span> stays inline.');
    expect(content).not.toContain("$a+b$");
  });

  it("tokenizes ChatGPT table cell formulas before markdown table rendering", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [
        {
          id: "1",
          role: "assistant",
          text: [
            "| Symbol | Formula |",
            "| --- | --- |",
            "| sum | $a+b$ |"
          ].join("\n")
        }
      ]
    });
    const content = String(file.content);

    expect(content).toContain("<table");
    expect(content).toContain('<span class="math-inline">\\(a+b\\)</span>');
    expect(content).not.toContain("$a+b$");
  });

  it("exports attachment metadata in html", async () => {
    const [file] = await htmlExporter.export(attachmentSnapshot);
    const content = String(file.content);

    expect(content).toContain('<div class="title">附件</div>');
    expect(content).toContain("notes.pdf");
    expect(content).toContain("https://example.com/notes.pdf");
    expect(content).toContain("diagram.png");
  });

  it("renders image attachments as images in html", async () => {
    const [file] = await htmlExporter.export(attachmentSnapshot);
    const content = String(file.content);

    expect(content).toContain('<img src="https://example.com/diagram.png" alt="diagram.png"');
    expect(content).toContain('<a href="https://example.com/notes.pdf" target="_blank" rel="noreferrer">notes.pdf</a>');
  });

  it("renders ChatGPT generated image messages as userscript-style html previews", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [{
        id: "assistant-image",
        role: "assistant",
        text: "Here is the generated image.\n[图片] https://assets.example.com/generated.png",
        attachments: [{
          id: "generated-image",
          fileName: "Generated cat",
          mimeType: "image/png",
          url: "https://assets.example.com/generated.png"
        }]
      }]
    });
    const content = String(file.content);

    expect(content).toContain('<div class="m-preview-media">');
    expect(content).toContain('<img src="https://assets.example.com/generated.png" alt="Generated cat"');
    expect(content).not.toContain("Here is the generated image.");
    expect(content).not.toContain("<ul><li><figure>");
    expect(content).not.toContain('alt="图片"');
  });

  it("renders ChatGPT user image messages with cleaned text in html previews", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      messages: [{
        id: "user-image",
        role: "user",
        text: "请看这张图\n\n[附件1: photo.png]",
        attachments: [{
          id: "uploaded-image",
          fileName: "photo.png",
          mimeType: "image/png",
          url: "https://assets.example.com/photo.png"
        }]
      }]
    });
    const content = String(file.content);

    expect(content).toContain('<div class="m-preview-media">');
    expect(content).toContain('<img src="https://assets.example.com/photo.png" alt="请看这张图"');
    expect(content).toContain("请看这张图");
    expect(content).not.toContain("[附件1: photo.png]");
    expect(content).not.toContain("<ul><li><figure>");
  });

  it("renders inline HTML attachments as sanitized snapshots in html", async () => {
    const [file] = await htmlExporter.export({
      ...snapshot,
      title: "Inline HTML Attachment Chat",
      messages: [{
        id: "1",
        role: "assistant",
        text: "Interactive preview attached.",
        attachments: [{
          id: "html-file",
          fileName: "preview.html",
          mimeType: "text/html",
          content: "<style>body{margin:0}.widget, p{color:red}</style><section class=\"widget\"><h2>Revenue Widget</h2><p onclick=\"ignore()\">Growth is 42%.</p><script>ignore()</script></section>"
        }]
      }]
    });
    const content = String(file.content);

    expect(content).toContain("claude-html-widget-block");
    expect(content).toContain("交互内容 · preview.html");
    expect(content).toContain(".claude-html-widget{margin:0}");
    expect(content).toContain(".claude-html-widget .widget, .claude-html-widget p{color:red}");
    expect(content).toContain('<div class="claude-html-widget">');
    expect(content).toContain("<h2>Revenue Widget</h2>");
    expect(content).toContain("Growth is 42%.");
    expect(content).not.toContain("attachment-html-snapshot");
    expect(content).not.toContain("<script>ignore()");
    expect(content).not.toContain("onclick=");
  });

  it("exports attachment metadata in markdown", async () => {
    const [file] = await markdownExporter.export(attachmentSnapshot);
    const content = String(file.content);

    expect(content).toContain("### 附件");
    expect(content).toContain("## 附件");
    expect(content).toContain("[notes.pdf](https://example.com/notes.pdf)");
    expect(content).toContain("![diagram.png](https://example.com/diagram.png)");
  });

  it("renders inline HTML attachments as sanitized snapshots in markdown", async () => {
    const [file] = await markdownExporter.export({
      ...snapshot,
      title: "Inline HTML Attachment Chat",
      messages: [{
        id: "1",
        role: "assistant",
        text: "Interactive preview attached.",
        attachments: [{
          id: "html-file",
          fileName: "preview.html",
          mimeType: "text/html",
          content: "<style>body{margin:0}.widget, p{color:red}</style><section class=\"widget\"><h2>Revenue Widget</h2><p onclick=\"ignore()\">Growth is 42%.</p><script>ignore()</script></section>"
        }]
      }]
    });
    const content = String(file.content);

    expect(content).toContain('class="claude-md-widget-');
    expect(content).toContain("附件快照：preview.html");
    expect(content).toContain(".claude-md-widget-");
    expect(content).toContain("{margin:0}");
    expect(content).toContain(".widget, .claude-md-widget-");
    expect(content).toContain("<h2>Revenue Widget</h2>");
    expect(content).toContain("Growth is 42%.");
    expect(content).not.toContain("<script>ignore()");
    expect(content).not.toContain("onclick=");
  });

  it("exports attachment metadata in txt", async () => {
    const [file] = await txtExporter.export(attachmentSnapshot);
    const content = String(file.content);

    expect(content).toContain("附件: notes.pdf <https://example.com/notes.pdf>");
    expect(content).toContain("附件: diagram.png <https://example.com/diagram.png>");
  });

  it("exports DeepSeek conversation metadata in html, markdown, and txt", async () => {
    const [htmlFile] = await htmlExporter.export(deepseekSnapshot);
    const [markdownFile] = await markdownExporter.export(deepseekSnapshot);
    const [txtFile] = await txtExporter.export(deepseekSnapshot);

    expect(String(markdownFile.content)).toContain("## DeepSeek 对话信息");
    expect(String(markdownFile.content)).toContain("- 已置顶: 是");
    expect(String(markdownFile.content)).toContain("- 深度思考: 开启");
    expect(String(markdownFile.content)).toContain("- 智能搜索: 开启");

    expect(String(txtFile.content)).toContain("【DeepSeek 对话信息】");
    expect(String(txtFile.content)).toContain("会话ID: session-1");
    expect(String(txtFile.content)).toContain("创建时间: 2026-06-08T02:00:00Z");

    expect(String(htmlFile.content)).toContain("DeepSeek 对话信息");
    expect(String(htmlFile.content)).toContain("已置顶: 是 | 深度思考: 开启 | 智能搜索: 开启");
    expect(String(htmlFile.content)).toContain("创建时间: 2026-06-08T02:00:00Z | 更新时间: 2026-06-08T02:00:05Z");
  });

  it("creates a stored zip archive containing file names", () => {
    const files: ExportFile[] = [
      { path: "one.txt", mimeType: "text/plain", content: "one" },
      { path: "two.txt", mimeType: "text/plain", content: "two" }
    ];
    const zip = createZip(files);
    const text = new TextDecoder().decode(zip);

    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain("one.txt");
    expect(text).toContain("two.txt");
  });
});
