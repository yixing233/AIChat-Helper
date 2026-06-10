import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeAdapter } from "../platforms/claude/adapter";
import { extractClaudeSnapshotFromConversation } from "../platforms/claude/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const claudePayload = {
  uuid: "claude-conv-1",
  name: "Claude Conversation",
  chat_messages: [
    {
      uuid: "msg-1",
      sender: "human",
      created_at: "2026-06-08T01:00:00Z",
      content: [{ type: "text", text: "Hello Claude" }],
      files: [{ file_name: "brief.pdf", file_type: "application/pdf" }]
    },
    {
      uuid: "msg-2",
      sender: "assistant",
      created_at: "2026-06-08T01:00:03Z",
      content: [{ type: "text", text: "Hello human" }]
    }
  ]
};

describe("Claude API hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "lastActiveOrg=; Max-Age=0";
  });

  it("extracts normalized messages and attachments from chat_messages", () => {
    const snapshot = extractClaudeSnapshotFromConversation(claudePayload);

    expect(snapshot).toMatchObject({
      platformId: "claude",
      conversationId: "claude-conv-1",
      title: "Claude Conversation"
    });
    expect(snapshot.messages).toEqual([
      {
        id: "msg-1",
        sourceMessageId: "msg-1",
        role: "user",
        text: "Hello Claude\n\n[附件1] brief.pdf",
        createdAt: "2026-06-08T01:00:00Z",
        attachments: [{
          id: "msg-1-file-1",
          fileName: "brief.pdf",
          mimeType: "application/pdf"
        }]
      },
      {
        id: "msg-2",
        sourceMessageId: "msg-2",
        role: "assistant",
        text: "Hello human",
        createdAt: "2026-06-08T01:00:03Z"
      }
    ]);
  });

  it("hydrates from captured Claude conversation events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://claude.ai/api/organizations/org/chat_conversations/claude-conv-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(claudePayload),
      createdAt: 1
    }];

    await expect(claudeAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "claude-conv-1",
      messages: [
        { role: "user", text: "Hello Claude\n\n[附件1] brief.pdf" },
        { role: "assistant", text: "Hello human" }
      ]
    });
  });

  it("hydrates Claude captured HTML attachment content from downloaded blob events", async () => {
    const conversation = {
      uuid: "claude-cached-html-conv",
      name: "Claude Cached HTML Conversation",
      chat_messages: [{
        uuid: "msg-cached-html",
        sender: "assistant",
        created_at: "2026-06-08T01:00:04Z",
        content: [{ type: "text", text: "Cached preview attached." }],
        files: [{
          file_name: "preview.html",
          mime_type: "text/html",
          preview_url: "blob:https://claude.ai/cached-preview"
        }]
      }]
    };
    const events: CapturedNetworkEvent[] = [
      {
        id: "fetch-1",
        kind: "fetch",
        url: "https://claude.ai/api/organizations/org/chat_conversations/claude-cached-html-conv",
        method: "GET",
        status: 200,
        responseText: JSON.stringify(conversation),
        createdAt: 1
      },
      {
        id: "blob-url-1",
        kind: "blob-url",
        url: "blob:https://claude.ai/cached-preview",
        fileName: "preview.html",
        mimeType: "text/html",
        responseText: "<section><h2>Cached Widget</h2><p>Loaded from cached download.</p></section>",
        createdAt: 2
      }
    ];

    await expect(claudeAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "claude-cached-html-conv",
      messages: [{
        role: "assistant",
        text: "Cached preview attached.\n\n[附件1] preview.html\n链接: blob:https://claude.ai/cached-preview",
        attachments: [{
          fileName: "preview.html",
          mimeType: "text/html",
          url: "blob:https://claude.ai/cached-preview",
          content: "<section><h2>Cached Widget</h2><p>Loaded from cached download.</p></section>"
        }]
      }]
    });
  });

  it("keeps Claude image content parts as exportable message attachments", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-image-conv",
      name: "Claude Image Conversation",
      chat_messages: [{
        uuid: "msg-image",
        sender: "assistant",
        created_at: "2026-06-08T01:00:05Z",
        content: [{
          type: "image",
          file_name: "chart.png",
          mime_type: "image/png",
          url: "https://example.com/chart.png"
        }]
      }]
    });

    expect(snapshot.messages).toEqual([{
      id: "msg-image",
      sourceMessageId: "msg-image",
      role: "assistant",
      text: "[图片1] chart.png",
      createdAt: "2026-06-08T01:00:05Z",
      attachments: [{
        id: "msg-image-image-1",
        fileName: "chart.png",
        mimeType: "image/png",
        url: "https://example.com/chart.png"
      }]
    }]);
  });

  it("keeps Claude svg content parts as exportable image attachments", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-svg-conv",
      name: "Claude SVG Conversation",
      chat_messages: [{
        uuid: "msg-svg",
        sender: "assistant",
        content: [
          { type: "text", text: "Here is the diagram." },
          {
            type: "svg",
            fileName: "flow.svg",
            svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"8\" cy=\"8\" r=\"8\"/></svg>"
          }
        ]
      }]
    });

    expect(snapshot.messages).toEqual([
      expect.objectContaining({
        id: "msg-svg",
        sourceMessageId: "msg-svg",
        role: "assistant",
        text: "Here is the diagram.\n\n[图像1] flow.svg",
        attachments: [
          expect.objectContaining({
            id: "msg-svg-image-1",
            fileName: "flow.svg",
            mimeType: "image/svg+xml",
            url: expect.stringContaining("data:image/svg+xml;utf8,")
          })
        ]
      })
    ]);
  });

  it("extracts Claude file attachment urls from preview and download fields", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-file-url-conv",
      name: "Claude File URL Conversation",
      chat_messages: [{
        uuid: "msg-file-url",
        sender: "human",
        created_at: "2026-06-08T01:00:05Z",
        content: [{ type: "text", text: "Please inspect these files" }],
        files: [
          {
            file_name: "preview.html",
            mime_type: "text/html",
            preview_url: "https://example.com/preview.html"
          },
          {
            file_name: "download.csv",
            mime_type: "text/csv",
            download_url: "https://example.com/download.csv"
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-file-url",
      role: "user",
      text: "Please inspect these files\n\n[附件1] preview.html\n链接: https://example.com/preview.html\n\n[附件2] download.csv\n链接: https://example.com/download.csv",
      attachments: [
        {
          id: "msg-file-url-file-1",
          fileName: "preview.html",
          mimeType: "text/html",
          url: "https://example.com/preview.html"
        },
        {
          id: "msg-file-url-file-2",
          fileName: "download.csv",
          mimeType: "text/csv",
          url: "https://example.com/download.csv"
        }
      ]
    });
  });

  it("exports Claude image files as image parts and resolves relative asset urls like the userscript", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-image-file-conv",
      name: "Claude Image File Conversation",
      chat_messages: [{
        uuid: "msg-image-file",
        sender: "human",
        created_at: "2026-06-08T01:00:06Z",
        content: [{ type: "text", text: "Please inspect this chart" }],
        files: [{
          file_name: "chart.png",
          file_kind: "image",
          mime_type: "image/png",
          preview_url: "/api/organizations/org/files/chart-preview"
        }]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-image-file",
      sourceMessageId: "msg-image-file",
      role: "user",
      text: "Please inspect this chart\n\n[图片1] chart.png",
      createdAt: "2026-06-08T01:00:06Z",
      attachments: [{
        id: "msg-image-file-file-1",
        fileName: "chart.png",
        mimeType: "image/png",
        url: "https://claude.ai/api/organizations/org/files/chart-preview"
      }]
    });
  });

  it("continues Claude image numbering across content parts and file attachments like the userscript", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-mixed-images-conv",
      name: "Claude Mixed Images Conversation",
      chat_messages: [{
        uuid: "msg-mixed-images",
        sender: "assistant",
        created_at: "2026-06-08T01:00:06Z",
        content: [
          { type: "text", text: "Two images follow." },
          {
            type: "image",
            file_name: "content-chart.png",
            mime_type: "image/png",
            url: "https://example.com/content-chart.png"
          }
        ],
        files: [{
          file_name: "file-chart.png",
          file_kind: "image",
          mime_type: "image/png",
          preview_url: "https://example.com/file-chart.png"
        }]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-mixed-images",
      role: "assistant",
      text: "Two images follow.\n\n[图片1] content-chart.png\n\n[图片2] file-chart.png",
      attachments: [
        {
          id: "msg-mixed-images-image-1",
          fileName: "content-chart.png",
          mimeType: "image/png",
          url: "https://example.com/content-chart.png"
        },
        {
          id: "msg-mixed-images-file-1",
          fileName: "file-chart.png",
          mimeType: "image/png",
          url: "https://example.com/file-chart.png"
        }
      ]
    });
  });

  it("preserves Claude inline HTML file content for export snapshots", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-inline-html-conv",
      name: "Claude Inline HTML Conversation",
      chat_messages: [{
        uuid: "msg-inline-html",
        sender: "assistant",
        created_at: "2026-06-08T01:00:06Z",
        content: [{ type: "text", text: "I attached an interactive preview." }],
        files: [{
          file_name: "preview.html",
          mime_type: "text/html",
          content: "<section><h2>Revenue Widget</h2><p>Growth is 42%.</p><script>ignore()</script></section>"
        }]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-inline-html",
      role: "assistant",
      text: "I attached an interactive preview.\n\n[附件1] preview.html",
      attachments: [{
        id: "msg-inline-html-file-1",
        fileName: "preview.html",
        mimeType: "text/html",
        content: expect.stringContaining("<html lang=\"zh-CN\">")
      }]
    });
    const content = String(snapshot.messages[0]?.attachments?.[0]?.content || "");
    expect(content).toContain("<h2>Revenue Widget</h2>");
    expect(content).toContain(":root{--color-border-primary:#94a3b8;");
  });

  it("exports Claude artifact code parts as fenced code blocks", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-artifact-conv",
      name: "Claude Artifact Conversation",
      chat_messages: [{
        uuid: "msg-artifact",
        sender: "assistant",
        created_at: "2026-06-08T01:00:06Z",
        content: [
          { type: "text", text: "I made an artifact." },
          {
            type: "tool_use",
            name: "artifacts",
            input: {
              title: "Demo component",
              language: "tsx",
              code: "export function Demo() {\n  return <div>Hello</div>;\n}"
            }
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-artifact",
      role: "assistant",
      text: "I made an artifact.\n\n[Artifact: Demo component]\n```tsx\nexport function Demo() {\n  return <div>Hello</div>;\n}\n```"
    });
  });

  it("exports Claude tool result text arrays with a readable tool prefix", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-tool-result-conv",
      name: "Claude Tool Result Conversation",
      chat_messages: [{
        uuid: "msg-tool-result",
        sender: "assistant",
        created_at: "2026-06-08T01:00:07Z",
        content: [
          { type: "text", text: "I found this." },
          {
            type: "tool_result",
            name: "web_search",
            content: [
              { type: "text", text: "Result one\r\nwith detail" },
              { text: "Result two" }
            ]
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-tool-result",
      role: "assistant",
      text: "I found this.\n\n【工具结果: web_search】\nResult one\nwith detail\n\nResult two"
    });
  });

  it("exports Claude non-artifact tool uses as input summaries", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-tool-use-conv",
      name: "Claude Tool Use Conversation",
      chat_messages: [{
        uuid: "msg-tool-use",
        sender: "assistant",
        created_at: "2026-06-08T01:00:08Z",
        content: [
          { type: "text", text: "I will inspect the data." },
          {
            type: "tool_use",
            name: "analysis_tool",
            input: {
              title: "Dataset scan",
              modules: ["summary", "outliers"],
              message: "Look for anomalies"
            }
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-tool-use",
      role: "assistant",
      text: "I will inspect the data.\n\n【工具调用: analysis_tool】\n标题: Dataset scan\n\n模块: summary, outliers\n\n消息: Look for anomalies"
    });
  });

  it("exports Claude widget tool calls as visible text and archived HTML attachments", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-widget-conv",
      name: "Claude Widget Conversation",
      chat_messages: [{
        uuid: "msg-widget",
        sender: "assistant",
        created_at: "2026-06-08T01:00:09Z",
        content: [
          { type: "text", text: "Here is the widget." },
          {
            type: "tool_use",
            name: "visualize:show_widget",
            input: {
              widget_code: [
                "<section>",
                "<style>.metric{color:red}</style>",
                "<h2>Revenue Summary</h2>",
                "<p>Growth is 42%.</p>",
                "<button>Ignore action</button>",
                "<script>console.log('ignore')</script>",
                "</section>"
              ].join("")
            }
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-widget",
      role: "assistant",
      text: "Here is the widget.\n\n[附件1] Revenue Summary.html\n\n## Revenue Summary\n\nGrowth is 42%.",
      attachments: [{
        id: "msg-widget-widget-1",
        fileName: "Revenue Summary.html",
        mimeType: "text/html",
        content: expect.stringContaining("<h2>Revenue Summary</h2>")
      }]
    });
    const content = String(snapshot.messages[0]?.attachments?.[0]?.content || "");
    expect(content).toContain("<html lang=\"zh-CN\">");
    expect(content).toContain(":root{--color-border-primary:#94a3b8;");
  });

  it("omits exportable SVG internals from Claude widget visible text like the userscript", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-widget-svg-conv",
      name: "Claude Widget SVG Conversation",
      chat_messages: [{
        uuid: "msg-widget-svg",
        sender: "assistant",
        created_at: "2026-06-08T01:00:09Z",
        content: [
          { type: "text", text: "Here is the widget." },
          {
            type: "tool_use",
            name: "visualize:show_widget",
            input: {
              widget_code: [
                "<section>",
                "<h2>Chart Widget</h2>",
                "<div id=\"vis-container\">",
                "<svg role=\"img\" width=\"240\" height=\"120\" viewBox=\"0 0 240 120\">",
                "<rect x=\"10\" y=\"10\" width=\"80\" height=\"40\"></rect>",
                "<text x=\"20\" y=\"35\">Axis Label</text>",
                "<text x=\"120\" y=\"35\">Value Label</text>",
                "</svg>",
                "</div>",
                "<p>Summary stays.</p>",
                "</section>"
              ].join("")
            }
          }
        ]
      }]
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-widget-svg",
      role: "assistant",
      text: "Here is the widget.\n\n[附件1] Chart Widget.html\n\n## Chart Widget\n\nSummary stays."
    });
    expect(snapshot.messages[0]?.text).not.toContain("Axis Label");
    expect(snapshot.messages[0]?.text).not.toContain("Value Label");
  });

  it("prunes Claude prompt suggestion controls from archived widget HTML", () => {
    const snapshot = extractClaudeSnapshotFromConversation({
      uuid: "claude-widget-prompt-conv",
      name: "Claude Widget Prompt Conversation",
      chat_messages: [{
        uuid: "msg-widget-prompt",
        sender: "assistant",
        content: [{
          type: "tool_use",
          name: "visualize:show_widget",
          input: {
            widget_code: [
              "<section>",
              "<h2>Revenue Summary</h2>",
              "<p>Growth is 42%.</p>",
              "<div class=\"prompt-row\"><button onclick=\"sendPrompt('show details')\">Try asking for details</button></div>",
              "<script>function sendPrompt(value){ return value; }</script>",
              "</section>"
            ].join("")
          }
        }]
      }]
    });

    const content = String(snapshot.messages[0]?.attachments?.[0]?.content || "");
    expect(content).toContain("<h2>Revenue Summary</h2>");
    expect(content).not.toContain("Try asking for details");
    expect(content).not.toContain("sendPrompt");
  });

  it("fetches recent conversation summaries from the Claude list API", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              uuid: "claude-conv-1",
              name: "Claude Conversation",
              created_at: "2026-06-08T01:00:00Z",
              updated_at: "2026-06-08T01:00:03Z",
              chat_messages_count: 2
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response);

    await expect(claudeAdapter.fetchConversationList?.({ limit: 20 })).resolves.toMatchObject([
      {
        platformId: "claude",
        conversationId: "claude-conv-1",
        title: "Claude Conversation",
        createdAt: "2026-06-08T01:00:00Z",
        createdAtText: new Date("2026-06-08T01:00:00Z").toLocaleString(),
        updatedAt: "2026-06-08T01:00:03Z",
        updatedAtText: new Date("2026-06-08T01:00:03Z").toLocaleString(),
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1,
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=20&starred=false&consistency=eventual",
      { method: "GET", credentials: "include", headers: {} }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=20&starred=true&consistency=eventual",
      { method: "GET", credentials: "include", headers: {} }
    );
  });

  it("skips Claude recent conversation entries without real ids", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              name: "Missing id should be skipped",
              updated_at: "2026-06-08T01:00:04Z",
              chat_messages_count: 99
            },
            {
              uuid: "claude-conv-valid",
              name: "Valid Claude Conversation",
              created_at: "2026-06-08T01:00:00Z",
              updated_at: "2026-06-08T01:00:03Z",
              chat_messages_count: 2
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response);

    await expect(claudeAdapter.fetchConversationList?.({ limit: 20 })).resolves.toMatchObject([{
      platformId: "claude",
      conversationId: "claude-conv-valid",
      title: "Valid Claude Conversation",
      createdAt: "2026-06-08T01:00:00Z",
      createdAtText: new Date("2026-06-08T01:00:00Z").toLocaleString(),
      updatedAt: "2026-06-08T01:00:03Z",
      updatedAtText: new Date("2026-06-08T01:00:03Z").toLocaleString(),
      messageCount: 2
    }]);
  });

  it("merges Claude starred conversations and reuses captured request headers", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "fetch-list",
      kind: "fetch",
      url: "https://claude.ai/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=30&starred=false&consistency=eventual",
      method: "GET",
      status: 200,
      requestHeaders: {
        authorization: "Bearer claude-token",
        "anthropic-client-platform": "web_claude_ai",
        cookie: "blocked",
        referer: "https://claude.ai/"
      },
      responseText: "{}",
      createdAt: 1
    }];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              uuid: "normal-new",
              name: "Normal New",
              updated_at: "2026-06-08T03:00:00Z"
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              uuid: "starred-old",
              name: "Starred Old",
              updated_at: "2026-06-08T01:00:00Z",
              is_starred: true
            },
            {
              uuid: "normal-new",
              name: "Duplicate Normal",
              updated_at: "2026-06-08T02:00:00Z",
              is_starred: true
            }
          ]
        })
      } as Response);

    const summaries = await claudeAdapter.fetchConversationList?.({ limit: 30, capturedEvents });

    expect(summaries?.map((item) => item.conversationId)).toEqual(["normal-new", "starred-old"]);
    expect(fetchMock).toHaveBeenNthCalledWith(1,
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=30&starred=false&consistency=eventual",
      {
        method: "GET",
        credentials: "include",
        headers: {
          authorization: "Bearer claude-token",
          "anthropic-client-platform": "web_claude_ai"
        }
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations_v2?limit=30&starred=true&consistency=eventual",
      {
        method: "GET",
        credentials: "include",
        headers: {
          authorization: "Bearer claude-token",
          "anthropic-client-platform": "web_claude_ai"
        }
      }
    );
  });

  it("fetches conversation detail from the Claude detail API", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => claudePayload
    } as Response);

    await expect(claudeAdapter.fetchConversationDetail?.("claude-conv-1")).resolves.toMatchObject({
      platformId: "claude",
      conversationId: "claude-conv-1",
      title: "Claude Conversation",
      messages: [
        { role: "user", text: "Hello Claude\n\n[附件1] brief.pdf" },
        { role: "assistant", text: "Hello human" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations/claude-conv-1?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong",
      { method: "GET", credentials: "include", headers: {} }
    );
  });

  it("reuses captured Claude request headers for detail requests", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "fetch-detail",
      kind: "fetch",
      url: "https://claude.ai/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations/claude-conv-1",
      method: "GET",
      status: 200,
      requestHeaders: {
        authorization: "Bearer claude-detail-token",
        "anthropic-client-platform": "web_claude_ai",
        cookie: "blocked"
      },
      responseText: "{}",
      createdAt: 1
    }];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => claudePayload
    } as Response);

    await expect(claudeAdapter.fetchConversationDetail?.("claude-conv-1", undefined, capturedEvents)).resolves.toMatchObject({
      conversationId: "claude-conv-1"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/organizations/00000000-0000-4000-8000-000000000001/chat_conversations/claude-conv-1?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong",
      {
        method: "GET",
        credentials: "include",
        headers: {
          authorization: "Bearer claude-detail-token",
          "anthropic-client-platform": "web_claude_ai"
        }
      }
    );
  });

  it("uses the Claude organization id from captured API URLs when the cookie is unavailable", async () => {
    const capturedEvents: CapturedNetworkEvent[] = [
      {
        id: "fetch-list-org",
        kind: "fetch",
        url: "https://claude.ai/api/organizations/00000000-0000-4000-8000-000000000002/chat_conversations_v2?limit=30&starred=false",
        method: "GET",
        status: 200,
        requestHeaders: {
          authorization: "Bearer captured-claude-token"
        },
        responseText: "{}",
        createdAt: 1
      },
      {
        id: "fetch-detail-org",
        kind: "fetch",
        url: "https://claude.ai/api/organizations/00000000-0000-4000-8000-000000000002/chat_conversations/claude-conv-2",
        method: "GET",
        status: 200,
        requestHeaders: {
          authorization: "Bearer captured-claude-token"
        },
        responseText: "{}",
        createdAt: 2
      }
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            uuid: "claude-conv-2",
            name: "Captured Org Conversation",
            updated_at: "2026-06-08T01:00:00Z"
          }]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...claudePayload,
          uuid: "claude-conv-2",
          name: "Captured Org Conversation"
        })
      } as Response);

    await expect(claudeAdapter.fetchConversationList?.({ limit: 10, capturedEvents })).resolves.toMatchObject([
      {
        conversationId: "claude-conv-2",
        title: "Captured Org Conversation"
      }
    ]);
    await expect(claudeAdapter.fetchConversationDetail?.("claude-conv-2", undefined, capturedEvents)).resolves.toMatchObject({
      conversationId: "claude-conv-2",
      title: "Captured Org Conversation"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1,
      "/api/organizations/00000000-0000-4000-8000-000000000002/chat_conversations_v2?limit=10&starred=false&consistency=eventual",
      {
        method: "GET",
        credentials: "include",
        headers: { authorization: "Bearer captured-claude-token" }
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3,
      "/api/organizations/00000000-0000-4000-8000-000000000002/chat_conversations/claude-conv-2?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong",
      {
        method: "GET",
        credentials: "include",
        headers: { authorization: "Bearer captured-claude-token" }
      }
    );
  });

  it("hydrates remote Claude HTML attachment content when fetching conversation detail", async () => {
    document.cookie = "lastActiveOrg=00000000-0000-4000-8000-000000000001";
    const remoteHtmlPayload = {
      uuid: "claude-remote-html-conv",
      name: "Claude Remote HTML Conversation",
      chat_messages: [{
        uuid: "msg-remote-html",
        sender: "assistant",
        created_at: "2026-06-08T01:00:10Z",
        content: [{ type: "text", text: "Remote preview attached." }],
        files: [{
          file_name: "remote-preview.html",
          mime_type: "text/html",
          preview_url: "https://example.com/remote-preview.html"
        }]
      }]
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => remoteHtmlPayload
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => "<section><h2>Remote Widget</h2><p>Loaded from URL.</p></section>"
      } as Response);

    await expect(claudeAdapter.fetchConversationDetail?.("claude-remote-html-conv")).resolves.toMatchObject({
      conversationId: "claude-remote-html-conv",
      messages: [{
        role: "assistant",
        text: "Remote preview attached.\n\n[附件1] remote-preview.html\n链接: https://example.com/remote-preview.html",
        attachments: [{
          fileName: "remote-preview.html",
          mimeType: "text/html",
          url: "https://example.com/remote-preview.html",
          content: "<section><h2>Remote Widget</h2><p>Loaded from URL.</p></section>"
        }]
      }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://example.com/remote-preview.html", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
  });
});
