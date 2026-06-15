import { afterEach, describe, expect, it, vi } from "vitest";
import { chatgptAdapter } from "../platforms/chatgpt/adapter";
import { extractChatGPTSnapshotFromConversation } from "../platforms/chatgpt/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const conversationPayload = {
  id: "conv-1",
  title: "Mapped Conversation",
  current_node: "assistant-1",
  mapping: {
    root: { id: "root", parent: null, children: ["user-1"] },
    "user-1": {
      id: "user-1",
      parent: "root",
      children: ["assistant-1", "assistant-retry"],
      message: {
        id: "msg-user-1",
        author: { role: "user" },
        content: { parts: ["Hello"] },
        create_time: 1
      }
    },
    "assistant-1": {
      id: "assistant-1",
      parent: "user-1",
      children: [],
      message: {
        id: "msg-assistant-1",
        author: { role: "assistant" },
        content: { parts: ["Hi there"] },
        create_time: 2
      }
    },
    "assistant-retry": {
      id: "assistant-retry",
      parent: "user-1",
      children: [],
      message: {
        id: "msg-assistant-retry",
        author: { role: "assistant" },
        content: { parts: ["Retry branch"] },
        create_time: 3
      }
    }
  }
};

describe("ChatGPT mapping hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("extracts only the active current_node path", () => {
    const snapshot = extractChatGPTSnapshotFromConversation(conversationPayload);

    expect(snapshot).toMatchObject({
      platformId: "chatgpt",
      conversationId: "conv-1",
      title: "Mapped Conversation"
    });
    expect(snapshot.messages.map((message) => message.text)).toEqual(["Hello", "Hi there"]);
    expect(snapshot.messages.map((message) => message.sourceMessageId)).toEqual(["msg-user-1", "msg-assistant-1"]);
  });

  it("keeps ChatGPT current_node path order even when create_time is out of order", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-path-order",
      title: "Path Order Conversation",
      current_node: "assistant-path",
      mapping: {
        root: { id: "root", parent: null, children: ["user-path"] },
        "user-path": {
          id: "user-path",
          parent: "root",
          children: ["assistant-path"],
          message: {
            id: "msg-user-path",
            author: { role: "user" },
            content: { parts: ["Question should stay first"] },
            create_time: 10
          }
        },
        "assistant-path": {
          id: "assistant-path",
          parent: "user-path",
          children: [],
          message: {
            id: "msg-assistant-path",
            author: { role: "assistant" },
            content: { parts: ["Answer should stay second"] },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages.map((message) => message.sourceMessageId)).toEqual(["msg-user-path", "msg-assistant-path"]);
    expect(snapshot.messages.map((message) => message.text)).toEqual(["Question should stay first", "Answer should stay second"]);
  });

  it("hydrates from captured backend-api conversation events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://chatgpt.com/backend-api/conversation/conv-1",
      method: "GET",
      status: 200,
      responseText: JSON.stringify(conversationPayload),
      createdAt: 1
    }];

    await expect(chatgptAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "conv-1",
      title: "Mapped Conversation",
      messages: [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" }
      ]
    });
  });

  it("fetches conversation summaries from the backend list API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/auth/session?unstable_client=true") {
        return {
          ok: true,
          json: async () => ({ accessToken: "token-1" })
        } as Response;
      }
      if (url === "/backend-api/conversations?offset=0&limit=100&order=updated") {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "conv-1",
                title: "First conversation",
                update_time: "2026-06-08T02:00:00Z",
                create_time: "2026-06-07T01:30:00Z",
                mapping: { a: {}, b: {} }
              }
            ]
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [] })
      } as Response;
    });

    await expect(chatgptAdapter.fetchConversationList?.({ limit: 20 })).resolves.toMatchObject([
      {
        platformId: "chatgpt",
        conversationId: "conv-1",
        title: "First conversation",
        updatedAt: "2026-06-08T02:00:00Z",
        updatedAtText: new Date("2026-06-08T02:00:00Z").toLocaleString(),
        createdAt: "2026-06-07T01:30:00Z",
        createdAtText: new Date("2026-06-07T01:30:00Z").toLocaleString(),
        messageCount: 2,
        workspaceId: "",
        workspaceLabel: "个人空间",
        archived: false
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session?unstable_client=true", {
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversations?offset=0&limit=100&order=updated", {
      credentials: "include",
      headers: {
        Authorization: "Bearer token-1"
      }
    });
  });

  it("fetches conversation detail from the backend detail API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/auth/session?unstable_client=true") {
        return {
          ok: true,
          json: async () => ({ accessToken: "token-1" })
        } as Response;
      }
      return {
        ok: true,
        json: async () => conversationPayload
      } as Response;
    });

    await expect(chatgptAdapter.fetchConversationDetail?.("conv-1")).resolves.toMatchObject({
      platformId: "chatgpt",
      conversationId: "conv-1",
      title: "Mapped Conversation",
      messages: [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversation/conv-1", {
      credentials: "include",
      headers: {
        Authorization: "Bearer token-1"
      }
    });
  });

  it("uses userscript-style ChatGPT auth, device, and workspace context for batch list and detail requests", async () => {
    const workspaceId = "ws-123e4567-e89b-12d3-a456-426614174000";
    document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          user: {
            accounts: {
              team: { account: { id: workspaceId } }
            }
          }
        }
      }
    })}</script>`;
    localStorage.setItem("oai-did", "device-1");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/session?unstable_client=true") {
        return {
          ok: true,
          json: async () => ({ accessToken: "token-1" })
        } as Response;
      }
      if (url === "/backend-api/conversations?offset=0&limit=100&order=updated") {
        const headers = (init?.headers || {}) as Record<string, string>;
        if (headers["ChatGPT-Account-Id"] === workspaceId) {
          return {
            ok: true,
            json: async () => ({
              items: [{
                id: "team-conv",
                title: "Team conversation",
                update_time: "2026-06-08T03:00:00Z",
                message_count: 4
              }]
            })
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            items: [{
              id: "personal-conv",
              title: "Personal conversation",
              update_time: "2026-06-08T02:00:00Z"
            }]
          })
        } as Response;
      }
      if (url === "/backend-api/conversations?offset=0&limit=100&order=updated&is_archived=true") {
        return {
          ok: true,
          json: async () => ({ items: [] })
        } as Response;
      }
      if (url === `/backend-api/conversation/team-conv`) {
        return {
          ok: true,
          json: async () => ({ ...conversationPayload, id: "team-conv", title: "Team conversation" })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [] })
      } as Response;
    });

    const summaries = await chatgptAdapter.fetchConversationList?.({ limit: 2 });

    expect(summaries).toMatchObject([
      { conversationId: "team-conv", title: "Team conversation", workspaceId, workspaceLabel: "团队空间" },
      { conversationId: "personal-conv", title: "Personal conversation", workspaceId: "", workspaceLabel: "个人空间" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session?unstable_client=true", {
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversations?offset=0&limit=100&order=updated", {
      credentials: "include",
      headers: {
        Authorization: "Bearer token-1",
        "oai-device-id": "device-1"
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversations?offset=0&limit=100&order=updated", {
      credentials: "include",
      headers: {
        Authorization: "Bearer token-1",
        "ChatGPT-Account-Id": workspaceId,
        "oai-device-id": "device-1"
      }
    });

    await expect(chatgptAdapter.fetchConversationDetail?.("team-conv", summaries?.[0] as any)).resolves.toMatchObject({
      conversationId: "team-conv",
      title: "Team conversation"
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversation/team-conv", {
      credentials: "include",
      headers: {
        Authorization: "Bearer token-1",
        "ChatGPT-Account-Id": workspaceId,
        "oai-device-id": "device-1"
      }
    });
  });

  it("reuses captured ChatGPT auth, account, and device headers for batch list and detail requests", async () => {
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "fetch-captured-chatgpt",
      kind: "fetch",
      url: "https://chatgpt.com/backend-api/conversations?offset=0&limit=100&order=updated",
      method: "GET",
      status: 200,
      requestHeaders: {
        authorization: "Bearer captured-token",
        "chatgpt-account-id": "acct-team-1",
        "oai-device-id": "captured-device"
      },
      responseText: "{}",
      createdAt: 1
    }];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/session?unstable_client=true") {
        throw new Error("session token should not be requested when a captured bearer token exists");
      }
      if (url === "/backend-api/conversations?offset=0&limit=100&order=updated") {
        const headers = (init?.headers || {}) as Record<string, string>;
        if (headers["ChatGPT-Account-Id"] === "acct-team-1") {
          return {
            ok: true,
            json: async () => ({
              items: [{
                id: "team-conv",
                title: "Captured team conversation",
                update_time: "2026-06-08T03:00:00Z",
                message_count: 2
              }]
            })
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ items: [] })
        } as Response;
      }
      if (url === "/backend-api/conversations?offset=0&limit=100&order=updated&is_archived=true") {
        return {
          ok: true,
          json: async () => ({ items: [] })
        } as Response;
      }
      if (url === "/backend-api/conversation/team-conv") {
        return {
          ok: true,
          json: async () => ({
            ...conversationPayload,
            id: "team-conv",
            title: "Captured team conversation"
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [] })
      } as Response;
    });

    const summaries = await chatgptAdapter.fetchConversationList?.({ limit: 1, capturedEvents });

    expect(summaries).toMatchObject([
      {
        conversationId: "team-conv",
        title: "Captured team conversation",
        workspaceId: "acct-team-1",
        workspaceLabel: "团队空间"
      }
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/session?unstable_client=true", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversations?offset=0&limit=100&order=updated", {
      credentials: "include",
      headers: {
        Authorization: "Bearer captured-token",
        "ChatGPT-Account-Id": "acct-team-1",
        "oai-device-id": "captured-device"
      }
    });

    await expect(chatgptAdapter.fetchConversationDetail?.("team-conv", summaries?.[0] as any, capturedEvents)).resolves.toMatchObject({
      conversationId: "team-conv",
      title: "Captured team conversation"
    });
    expect(fetchMock).toHaveBeenCalledWith("/backend-api/conversation/team-conv", {
      credentials: "include",
      headers: {
        Authorization: "Bearer captured-token",
        "ChatGPT-Account-Id": "acct-team-1",
        "oai-device-id": "captured-device"
      }
    });
  });

  it("keeps ChatGPT image asset pointer parts as attachments without polluting exported text", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-image",
      title: "Image Conversation",
      current_node: "assistant-image",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-image"] },
        "assistant-image": {
          id: "assistant-image",
          parent: "root",
          children: [],
          message: {
            id: "msg-image",
            author: { role: "assistant" },
            content: {
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "https://example.com/generated.png",
                metadata: {
                  image_gen_title: "Generated cat",
                  mime_type: "image/png"
                }
              }]
            },
            create_time: 3
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "msg-image",
        sourceMessageId: "msg-image",
        role: "assistant",
        text: "",
        createdAt: "3",
        attachments: [{
          id: "msg-image-image-1",
          fileName: "Generated cat",
          mimeType: "image/png",
          url: "https://example.com/generated.png"
        }]
      }
    ]);
  });

  it("resolves relative ChatGPT image asset pointers against the page origin", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-relative-image",
      title: "Relative Image Conversation",
      current_node: "assistant-relative-image",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-relative-image"] },
        "assistant-relative-image": {
          id: "assistant-relative-image",
          parent: "root",
          children: [],
          message: {
            id: "msg-relative-image",
            author: { role: "assistant" },
            content: {
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "/backend-api/files/file-123/download",
                metadata: {
                  image_gen_title: "Generated chart",
                  mime_type: "image/png"
                }
              }]
            },
            create_time: 3
          }
        }
      }
    });

    const resolvedUrl = `${window.location.origin}/backend-api/files/file-123/download`;
    expect(snapshot.messages).toEqual([{
      id: "msg-relative-image",
      sourceMessageId: "msg-relative-image",
      role: "assistant",
      text: "",
      createdAt: "3",
      attachments: [{
        id: "msg-relative-image-image-1",
        fileName: "Generated chart",
        mimeType: "image/png",
        url: resolvedUrl
      }]
    }]);
  });

  it("does not export ChatGPT sediment image asset pointers as usable urls", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-sediment-image",
      title: "Sediment Image Conversation",
      current_node: "assistant-sediment-image",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-sediment-image"] },
        "assistant-sediment-image": {
          id: "assistant-sediment-image",
          parent: "root",
          children: [],
          message: {
            id: "msg-sediment-image",
            author: { role: "assistant" },
            content: {
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "sediment://generated-image",
                metadata: {
                  image_gen_title: "Generated cat",
                  mime_type: "image/png"
                }
              }]
            },
            create_time: 3
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([{
      id: "msg-sediment-image",
      sourceMessageId: "msg-sediment-image",
      role: "assistant",
      text: "",
      createdAt: "3",
      attachments: [{
        id: "msg-sediment-image-image-1",
        fileName: "Generated cat",
        mimeType: "image/png",
        url: undefined
      }]
    }]);
  });

  it("hydrates ChatGPT sediment image asset pointers from matching DOM images", () => {
    document.body.innerHTML = `
      <div id="image-msg-sediment-dom">
        <img alt="已生成图片 1" src="https://chatgpt.com/backend-api/files/generated-cat/download">
      </div>
    `;

    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-sediment-dom",
      title: "Sediment DOM Image Conversation",
      current_node: "assistant-sediment-dom",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-sediment-dom"] },
        "assistant-sediment-dom": {
          id: "assistant-sediment-dom",
          parent: "root",
          children: [],
          message: {
            id: "msg-sediment-dom",
            author: { role: "assistant" },
            content: {
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "sediment://generated-image",
                metadata: {
                  image_gen_title: "Generated cat",
                  mime_type: "image/png"
                }
              }]
            },
            create_time: 3
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-sediment-dom",
      role: "assistant",
      attachments: [{
        id: "msg-sediment-dom-image-1",
        fileName: "Generated cat",
        mimeType: "image/png",
        url: "https://chatgpt.com/backend-api/files/generated-cat/download"
      }]
    });
  });

  it("keeps ChatGPT image generation title-only messages exportable", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-image-title-only",
      title: "Image Title Only Conversation",
      current_node: "assistant-image-title-only",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-image-title-only"] },
        "assistant-image-title-only": {
          id: "assistant-image-title-only",
          parent: "root",
          children: [],
          message: {
            id: "msg-image-title-only",
            author: { role: "assistant" },
            content: { parts: [] },
            metadata: {
              image_gen_title: "Generated cat"
            },
            create_time: 4
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([{
      id: "msg-image-title-only",
      sourceMessageId: "msg-image-title-only",
      role: "assistant",
      text: "[图片] Generated cat",
      createdAt: "4"
    }]);
  });

  it("keeps ChatGPT uploaded files as exportable message attachments", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-file",
      title: "File Conversation",
      current_node: "user-file",
      mapping: {
        root: { id: "root", parent: null, children: ["user-file"] },
        "user-file": {
          id: "user-file",
          parent: "root",
          children: [],
          message: {
            id: "msg-file",
            author: { role: "user" },
            content: { parts: ["Please read this"] },
            metadata: {
              attachments: [{
                id: "file-1",
                name: "brief.pdf",
                mime_type: "application/pdf",
                url: "https://example.com/brief.pdf"
              }]
            },
            create_time: 4
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-file",
      role: "user",
      text: "Please read this\n\n[附件1: brief.pdf]",
      attachments: [{
        id: "file-1",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        url: "https://example.com/brief.pdf"
      }]
    });
  });

  it("does not append assistant metadata attachments to ChatGPT export text", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-assistant-file",
      title: "Assistant File Conversation",
      current_node: "assistant-file",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-file"] },
        "assistant-file": {
          id: "assistant-file",
          parent: "root",
          children: [],
          message: {
            id: "msg-assistant-file",
            author: { role: "assistant" },
            content: { parts: ["Assistant answer"] },
            metadata: {
              attachments: [{
                id: "assistant-file-1",
                name: "trace.json",
                mime_type: "application/json",
                url: "https://example.com/trace.json"
              }]
            },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([{
      id: "msg-assistant-file",
      sourceMessageId: "msg-assistant-file",
      role: "assistant",
      text: "Assistant answer",
      createdAt: "5"
    }]);
  });

  it("exports ChatGPT code parts as fenced code and skips internal tool parts", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-code",
      title: "Code Conversation",
      current_node: "assistant-code",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-code"] },
        "assistant-code": {
          id: "assistant-code",
          parent: "root",
          children: [],
          message: {
            id: "msg-code",
            author: { role: "assistant" },
            content: {
              parts: [
                { type: "text", text: "Here is the code:" },
                { type: "code", language: "ts", text: "const answer = 42;" },
                { type: "search_result", text: "internal search result" },
                { type: "citation", text: "internal citation" }
              ]
            },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-code",
      role: "assistant",
      text: "Here is the code:\n```ts\nconst answer = 42;\n```"
    });
  });

  it("keeps ChatGPT primitive content parts and code indentation like the userscript", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-primitive-parts",
      title: "Primitive Parts Conversation",
      current_node: "assistant-primitive-parts",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-primitive-parts"] },
        "assistant-primitive-parts": {
          id: "assistant-primitive-parts",
          parent: "root",
          children: [],
          message: {
            id: "msg-primitive-parts",
            author: { role: "assistant" },
            content: {
              parts: [
                "Values:",
                42,
                false,
                { type: "code", language: "ts", text: "  const answer = 42;\n  return answer;" }
              ]
            },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-primitive-parts",
      role: "assistant",
      text: "Values:\n42\nfalse\n```ts\n  const answer = 42;\n  return answer;\n```"
    });
  });

  it("exports nested ChatGPT content parts recursively", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-nested",
      title: "Nested Content Conversation",
      current_node: "assistant-nested",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-nested"] },
        "assistant-nested": {
          id: "assistant-nested",
          parent: "root",
          children: [],
          message: {
            id: "msg-nested",
            author: { role: "assistant" },
            content: {
              parts: [{
                type: "text",
                content: [
                  { type: "text", text: "Nested explanation" },
                  { type: "code", language: "js", text: "console.log(42);" }
                ]
              }]
            },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-nested",
      role: "assistant",
      text: "Nested explanation\n```js\nconsole.log(42);\n```"
    });
  });

  it("exports ChatGPT top-level result content", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-result",
      title: "Result Content Conversation",
      current_node: "assistant-result",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-result"] },
        "assistant-result": {
          id: "assistant-result",
          parent: "root",
          children: [],
          message: {
            id: "msg-result",
            author: { role: "assistant" },
            content: {
              result: [
                { type: "text", text: "Result explanation" },
                { type: "code", language: "python", text: "print(42)" }
              ]
            },
            create_time: 5
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-result",
      role: "assistant",
      text: "Result explanation\n```python\nprint(42)\n```"
    });
  });

  it("filters ChatGPT internal image policy text and tool call json lines without exporting image part text", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-policy",
      title: "Policy Text Conversation",
      current_node: "assistant-policy",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-policy"] },
        "assistant-policy": {
          id: "assistant-policy",
          parent: "root",
          children: [],
          message: {
            id: "msg-policy",
            author: { role: "assistant" },
            content: {
              parts: [
                "Here is the generated image.",
                "{\"image_query\":[{\"q\":\"cat\"}]}",
                "GPT-4o returned 1 image.\nDo not summarize the image.\nDo not give the user a link to download the image.",
                {
                  content_type: "image_asset_pointer",
                  asset_pointer: "https://example.com/cat.png",
                  metadata: {
                    image_gen_title: "Generated cat",
                    mime_type: "image/png"
                  }
                }
              ]
            },
            create_time: 6
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-policy",
      role: "assistant",
      text: "Here is the generated image.",
      attachments: [{
        id: "msg-policy-image-1",
        fileName: "Generated cat",
        mimeType: "image/png",
        url: "https://example.com/cat.png"
      }]
    });
  });

  it("skips ChatGPT hidden context system and unfinished draft assistant messages", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-hidden",
      title: "Hidden Messages Conversation",
      current_node: "assistant-final",
      mapping: {
        root: { id: "root", parent: null, children: ["system-hidden"] },
        "system-hidden": {
          id: "system-hidden",
          parent: "root",
          children: ["user-visible"],
          message: {
            id: "msg-system-hidden",
            author: { role: "system" },
            content: { parts: ["Do not export this system context"] },
            metadata: { is_contextual_answers_system_message: true },
            create_time: 1
          }
        },
        "user-visible": {
          id: "user-visible",
          parent: "system-hidden",
          children: ["assistant-draft"],
          message: {
            id: "msg-user-visible",
            author: { role: "user" },
            content: { parts: ["Visible user question"] },
            create_time: 2
          }
        },
        "assistant-draft": {
          id: "assistant-draft",
          parent: "user-visible",
          children: ["assistant-final"],
          message: {
            id: "msg-assistant-draft",
            author: { role: "assistant" },
            channel: "final",
            end_turn: false,
            content: { parts: ["Unfinished draft"] },
            create_time: 3
          }
        },
        "assistant-final": {
          id: "assistant-final",
          parent: "assistant-draft",
          children: [],
          message: {
            id: "msg-assistant-final",
            author: { role: "assistant" },
            channel: "final",
            end_turn: true,
            content: { parts: ["Visible final answer"] },
            create_time: 4
          }
        }
      }
    });

    expect(snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text
    }))).toEqual([
      { id: "msg-user-visible", role: "user", text: "Visible user question" },
      { id: "msg-assistant-final", role: "assistant", text: "Visible final answer" }
    ]);
  });

  it("filters ChatGPT reasoning, file-search context, and tool prompts while preserving final answers", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-internals",
      title: "Internal Messages Conversation",
      current_node: "assistant-final",
      mapping: {
        root: { id: "root", parent: null, children: ["user-question"] },
        "user-question": {
          id: "user-question",
          parent: "root",
          children: ["assistant-context"],
          message: {
            id: "msg-user-question",
            author: { role: "user" },
            content: { parts: ["Question with file"] },
            create_time: 1
          }
        },
        "assistant-context": {
          id: "assistant-context",
          parent: "user-question",
          children: ["file-search-context"],
          message: {
            id: "msg-assistant-context",
            author: { role: "assistant" },
            content: { content_type: "model_editable_context", model_set_context: "" },
            metadata: { can_save: false },
            create_time: 2
          }
        },
        "file-search-context": {
          id: "file-search-context",
          parent: "assistant-context",
          children: ["assistant-thoughts"],
          message: {
            id: "msg-file-search-context",
            author: { role: "tool", name: "file_search" },
            content: {
              content_type: "multimodal_text",
              parts: [
                "Remember you have access to rendered images of pages from the files.",
                "All the files uploaded by the user have been fully loaded."
              ]
            },
            metadata: { command: "context_stuff", can_save: false },
            create_time: 3
          }
        },
        "assistant-thoughts": {
          id: "assistant-thoughts",
          parent: "file-search-context",
          children: ["assistant-recap"],
          message: {
            id: "msg-assistant-thoughts",
            author: { role: "assistant" },
            content: { content_type: "thoughts", thoughts: [{ summary: "internal reasoning" }] },
            metadata: { can_save: false },
            end_turn: false,
            create_time: 4
          }
        },
        "assistant-recap": {
          id: "assistant-recap",
          parent: "assistant-thoughts",
          children: ["assistant-tool-prompt"],
          message: {
            id: "msg-assistant-recap",
            author: { role: "assistant" },
            content: { content_type: "reasoning_recap", content: "internal recap" },
            metadata: { can_save: false },
            end_turn: false,
            create_time: 5
          }
        },
        "assistant-tool-prompt": {
          id: "assistant-tool-prompt",
          parent: "assistant-recap",
          children: ["assistant-final"],
          message: {
            id: "msg-assistant-tool-prompt",
            author: { role: "assistant" },
            channel: "commentary",
            recipient: "image_tool",
            content: { content_type: "code", language: "json", text: "{\"prompt\":\"draw internal image\"}" },
            metadata: { can_save: false, is_complete: true },
            end_turn: false,
            create_time: 6
          }
        },
        "assistant-final": {
          id: "assistant-final",
          parent: "assistant-tool-prompt",
          children: [],
          message: {
            id: "msg-assistant-final",
            author: { role: "assistant" },
            channel: "final",
            content: { content_type: "text", parts: ["Visible answer"] },
            metadata: { can_save: true, is_complete: true },
            end_turn: true,
            create_time: 7
          }
        }
      }
    });

    expect(snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text
    }))).toEqual([
      { id: "msg-user-question", role: "user", text: "Question with file" },
      { id: "msg-assistant-final", role: "assistant", text: "Visible answer" }
    ]);
  });

  it("keeps ChatGPT final image tool messages while filtering file-search tool text", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-tool-image",
      title: "Tool Image Conversation",
      current_node: "image-tool-final",
      mapping: {
        root: { id: "root", parent: null, children: ["user-image"] },
        "user-image": {
          id: "user-image",
          parent: "root",
          children: ["file-search-text"],
          message: {
            id: "msg-user-image",
            author: { role: "user" },
            content: { parts: ["Draw an image"] }
          }
        },
        "file-search-text": {
          id: "file-search-text",
          parent: "user-image",
          children: ["image-tool-final"],
          message: {
            id: "msg-file-search-text",
            author: { role: "tool", name: "file_search" },
            content: {
              content_type: "text",
              parts: ["All the files uploaded by the user have been fully loaded."]
            },
            metadata: { can_save: false }
          }
        },
        "image-tool-final": {
          id: "image-tool-final",
          parent: "file-search-text",
          children: [],
          message: {
            id: "msg-image-tool-final",
            author: { role: "tool", name: "image_tool" },
            content: {
              content_type: "multimodal_text",
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "https://example.com/generated.png",
                metadata: { image_gen_title: "Generated diagram", mime_type: "image/png" }
              }]
            },
            metadata: { image_gen_title: "Generated diagram", can_save: false }
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "msg-user-image",
        sourceMessageId: "msg-user-image",
        role: "user",
        text: "Draw an image",
        createdAt: undefined
      },
      {
        id: "msg-image-tool-final",
        sourceMessageId: "msg-image-tool-final",
        role: "assistant",
        text: "",
        createdAt: undefined,
        attachments: [{
          id: "msg-image-tool-final-image-1",
          fileName: "Generated diagram",
          mimeType: "image/png",
          url: "https://example.com/generated.png"
        }]
      }
    ]);
  });

  it("keeps ChatGPT image generation tool turns visible across follow-up prompts", () => {
    document.body.innerHTML = `
      <div id="image-ae130c25-b10a-4b59-b785-3720f0bfa72a">
        <img alt="已生成图片：草地上的可爱小熊" src="https://chatgpt.com/backend-api/estuary/content?id=file_00000000dd2c7209a733ee4d36fe1882&ts=494770&p=fs&cid=1&sig=first&v=0">
      </div>
      <div id="image-3ae56431-5e0b-477f-9e65-c7e57e339963">
        <img alt="已生成图片：阳光下的萌熊草地" src="https://chatgpt.com/backend-api/estuary/content?id=file_0000000079a072099ff1fe633cef1428&ts=494770&p=fs&cid=1&sig=second&v=0">
      </div>
    `;

    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "69febc3a-48f8-83e8-985b-3821dd8f4cb3",
      title: "画面风格调整",
      current_node: "61fe2f74-3aa1-43e8-bcae-286f5f72bb54",
      mapping: {
        root: { id: "root", parent: null, children: ["bbb2111b-b2c1-4f50-b949-287f57194a64"] },
        "bbb2111b-b2c1-4f50-b949-287f57194a64": {
          id: "bbb2111b-b2c1-4f50-b949-287f57194a64",
          parent: "root",
          children: ["294f676a-6b87-49d7-b85e-7602d57bd2e3"],
          message: {
            id: "bbb2111b-b2c1-4f50-b949-287f57194a64",
            author: { role: "user" },
            content: {
              content_type: "multimodal_text",
              parts: [
                {
                  content_type: "image_asset_pointer",
                  asset_pointer: "sediment://file_0000000042807209aa225073e266cd45",
                  metadata: {}
                },
                "把背景弄的明亮一些，整个画面风格看起来活泼开朗"
              ]
            },
            metadata: {
              attachments: [{
                name: "file_0000000042807209aa225073e266cd45",
                id: "file_0000000042807209aa225073e266cd45",
                size: 120807,
                mime_type: "image/jpeg"
              }]
            },
            create_time: 1778302045.644691
          }
        },
        "294f676a-6b87-49d7-b85e-7602d57bd2e3": {
          id: "294f676a-6b87-49d7-b85e-7602d57bd2e3",
          parent: "bbb2111b-b2c1-4f50-b949-287f57194a64",
          children: ["980c52b8-9c0c-4d7f-a0db-ca817095a425"],
          message: {
            id: "294f676a-6b87-49d7-b85e-7602d57bd2e3",
            author: { role: "assistant" },
            content: { content_type: "model_editable_context", model_set_context: "" },
            metadata: { can_save: false },
            end_turn: false,
            create_time: 1778302045.869828
          }
        },
        "980c52b8-9c0c-4d7f-a0db-ca817095a425": {
          id: "980c52b8-9c0c-4d7f-a0db-ca817095a425",
          parent: "294f676a-6b87-49d7-b85e-7602d57bd2e3",
          children: ["26807c0a-5129-42fa-88db-2e27e91417a2"],
          message: {
            id: "980c52b8-9c0c-4d7f-a0db-ca817095a425",
            author: { role: "assistant" },
            recipient: "t2uay3k.sj1i4kz",
            content: { content_type: "code", language: "python3", text: "{\"skipped_mainline\":true}" },
            metadata: { can_save: false },
            end_turn: false,
            create_time: 1778302046.113826
          }
        },
        "26807c0a-5129-42fa-88db-2e27e91417a2": {
          id: "26807c0a-5129-42fa-88db-2e27e91417a2",
          parent: "980c52b8-9c0c-4d7f-a0db-ca817095a425",
          children: ["ae130c25-b10a-4b59-b785-3720f0bfa72a"],
          message: {
            id: "26807c0a-5129-42fa-88db-2e27e91417a2",
            author: { role: "tool", name: "t2uay3k.sj1i4kz" },
            content: {
              content_type: "text",
              parts: ["正在处理图片\n\n目前有很多人在创建图片，因此可能需要一点时间。图片准备好后我们会通知你。"]
            },
            metadata: {
              ui_card: true,
              image_gen_async: true,
              is_visually_hidden_from_conversation: true,
              can_save: false
            },
            end_turn: true,
            create_time: 1778302046.117131
          }
        },
        "ae130c25-b10a-4b59-b785-3720f0bfa72a": {
          id: "ae130c25-b10a-4b59-b785-3720f0bfa72a",
          parent: "26807c0a-5129-42fa-88db-2e27e91417a2",
          children: ["bbb2127e-1ea6-4a60-bb53-8e7538cbf14a"],
          message: {
            id: "ae130c25-b10a-4b59-b785-3720f0bfa72a",
            author: { role: "tool", name: "t2uay3k.sj1i4kz" },
            content: {
              content_type: "multimodal_text",
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "sediment://file_00000000dd2c7209a733ee4d36fe1882",
                metadata: {}
              }]
            },
            metadata: {
              image_gen_title: "草地上的可爱小熊",
              can_save: false
            },
            create_time: 1778302079.834974
          }
        },
        "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a": {
          id: "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a",
          parent: "ae130c25-b10a-4b59-b785-3720f0bfa72a",
          children: ["8bfd7cae-4c01-4cc3-ad81-53d9b5ec5542"],
          message: {
            id: "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a",
            author: { role: "user" },
            content: {
              content_type: "text",
              parts: ["主题角色也要做好光影配合"]
            },
            create_time: 1778302141.361288
          }
        },
        "8bfd7cae-4c01-4cc3-ad81-53d9b5ec5542": {
          id: "8bfd7cae-4c01-4cc3-ad81-53d9b5ec5542",
          parent: "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a",
          children: ["370574a9-badf-4a9f-bbf2-3aed0f496b96"],
          message: {
            id: "8bfd7cae-4c01-4cc3-ad81-53d9b5ec5542",
            author: { role: "assistant" },
            recipient: "t2uay3k.sj1i4kz",
            content: { content_type: "code", language: "python3", text: "{\"skipped_mainline\":true}" },
            metadata: { can_save: false },
            end_turn: false,
            create_time: 1778302141.760677
          }
        },
        "370574a9-badf-4a9f-bbf2-3aed0f496b96": {
          id: "370574a9-badf-4a9f-bbf2-3aed0f496b96",
          parent: "8bfd7cae-4c01-4cc3-ad81-53d9b5ec5542",
          children: ["3ae56431-5e0b-477f-9e65-c7e57e339963"],
          message: {
            id: "370574a9-badf-4a9f-bbf2-3aed0f496b96",
            author: { role: "tool", name: "t2uay3k.sj1i4kz" },
            content: {
              content_type: "text",
              parts: ["正在处理图片\n\n目前有很多人在创建图片，因此可能需要一点时间。图片准备好后我们会通知你。"]
            },
            metadata: {
              ui_card: true,
              image_gen_async: true,
              is_visually_hidden_from_conversation: true,
              can_save: false
            },
            end_turn: true,
            create_time: 1778302141.764043
          }
        },
        "3ae56431-5e0b-477f-9e65-c7e57e339963": {
          id: "3ae56431-5e0b-477f-9e65-c7e57e339963",
          parent: "370574a9-badf-4a9f-bbf2-3aed0f496b96",
          children: ["61fe2f74-3aa1-43e8-bcae-286f5f72bb54"],
          message: {
            id: "3ae56431-5e0b-477f-9e65-c7e57e339963",
            author: { role: "tool", name: "t2uay3k.sj1i4kz" },
            content: {
              content_type: "multimodal_text",
              parts: [{
                content_type: "image_asset_pointer",
                asset_pointer: "sediment://file_0000000079a072099ff1fe633cef1428",
                metadata: {}
              }]
            },
            metadata: {
              image_gen_title: "阳光下的萌熊草地",
              can_save: false
            },
            create_time: 1778302167.677527
          }
        },
        "61fe2f74-3aa1-43e8-bcae-286f5f72bb54": {
          id: "61fe2f74-3aa1-43e8-bcae-286f5f72bb54",
          parent: "3ae56431-5e0b-477f-9e65-c7e57e339963",
          children: [],
          message: {
            id: "61fe2f74-3aa1-43e8-bcae-286f5f72bb54",
            author: { role: "tool", name: "assistant" },
            content: {
              content_type: "text",
              parts: ["GPT-4o returned 1 images. From now on, do not say or show ANYTHING."]
            },
            metadata: { can_save: false },
            create_time: 1778302167.677607
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "bbb2111b-b2c1-4f50-b949-287f57194a64",
        sourceMessageId: "bbb2111b-b2c1-4f50-b949-287f57194a64",
        role: "user",
        text: "把背景弄的明亮一些，整个画面风格看起来活泼开朗\n\n[附件1: file_0000000042807209aa225073e266cd45]",
        createdAt: "1778302045.644691",
        attachments: [{
          id: "file_0000000042807209aa225073e266cd45",
          fileName: "file_0000000042807209aa225073e266cd45",
          mimeType: "image/jpeg",
          url: undefined
        }]
      },
      {
        id: "ae130c25-b10a-4b59-b785-3720f0bfa72a",
        sourceMessageId: "ae130c25-b10a-4b59-b785-3720f0bfa72a",
        role: "assistant",
        text: "",
        createdAt: "1778302079.834974",
        attachments: [{
          id: "ae130c25-b10a-4b59-b785-3720f0bfa72a-image-1",
          fileName: "草地上的可爱小熊",
          mimeType: "image/*",
          url: "https://chatgpt.com/backend-api/estuary/content?id=file_00000000dd2c7209a733ee4d36fe1882&ts=494770&p=fs&cid=1&sig=first&v=0"
        }]
      },
      {
        id: "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a",
        sourceMessageId: "bbb2127e-1ea6-4a60-bb53-8e7538cbf14a",
        role: "user",
        text: "主题角色也要做好光影配合",
        createdAt: "1778302141.361288"
      },
      {
        id: "3ae56431-5e0b-477f-9e65-c7e57e339963",
        sourceMessageId: "3ae56431-5e0b-477f-9e65-c7e57e339963",
        role: "assistant",
        text: "",
        createdAt: "1778302167.677527",
        attachments: [{
          id: "3ae56431-5e0b-477f-9e65-c7e57e339963-image-1",
          fileName: "阳光下的萌熊草地",
          mimeType: "image/*",
          url: "https://chatgpt.com/backend-api/estuary/content?id=file_0000000079a072099ff1fe633cef1428&ts=494770&p=fs&cid=1&sig=second&v=0"
        }]
      }
    ]);
  });

  it("replaces ChatGPT content reference spans with readable labels", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-reference",
      title: "Reference Conversation",
      current_node: "assistant-reference",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-reference"] },
        "assistant-reference": {
          id: "assistant-reference",
          parent: "root",
          children: [],
          message: {
            id: "msg-reference",
            author: { role: "assistant" },
            content: {
              parts: ["The claim comes from Example source."]
            },
            metadata: {
              content_references: [{
                matched_text: "Example source",
                type: "webpage",
                title: "Example Page"
              }]
            },
            create_time: 7
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-reference",
      role: "assistant",
      text: "The claim comes from [引用: Example Page]."
    });
  });

  it("replaces ChatGPT latex content references with markdown math blocks", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-math",
      title: "Math Conversation",
      current_node: "assistant-math",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-math"] },
        "assistant-math": {
          id: "assistant-math",
          parent: "root",
          children: [],
          message: {
            id: "msg-math",
            author: { role: "assistant" },
            content: {
              parts: ["Formula:\n\nMATH_REF"]
            },
            metadata: {
              content_references: [{
                matched_text: "MATH_REF",
                render_as: "latex",
                alt: "E = mc^2"
              }]
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-math",
      role: "assistant",
      text: "Formula:\n\n$$\nE = mc^2\n$$"
    });
  });

  it("replaces ChatGPT genui math widget references with markdown math blocks", () => {
    const widget = "genui{\"math_block_widget_always_prefetch_v2\":{\"content\":\"F=BIL\\\\sin\\\\theta\"}}";
    const text = [
      "因此：",
      "",
      widget,
      "",
      "其中：",
      "",
      "- \\(F\\)：电磁力（N）",
      "- \\(B\\)：磁感应强度（T）"
    ].join("\n");
    const start = text.indexOf(widget);
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-genui-math",
      title: "Genui Math Conversation",
      current_node: "assistant-genui-math",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-genui-math"] },
        "assistant-genui-math": {
          id: "assistant-genui-math",
          parent: "root",
          children: [],
          message: {
            id: "msg-genui-math",
            author: { role: "assistant" },
            content: {
              parts: [text]
            },
            metadata: {
              content_references: [{
                matched_text: widget,
                start_idx: start,
                end_idx: start + widget.length,
                alt: "F=BIL\\sin\\theta",
                type: "alt_text",
                render_as: "latex"
              }]
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]?.text).toBe([
      "因此：",
      "",
      "$$",
      "F=BIL\\sin\\theta",
      "$$",
      "",
      "其中：",
      "",
      "- \\(F\\)：电磁力（N）",
      "- \\(B\\)：磁感应强度（T）"
    ].join("\n"));
    expect(snapshot.messages[0]?.text).not.toContain("genui");
  });

  it("replaces ChatGPT serialization latex references using matched formula text", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-serialization-math",
      title: "Serialization Math Conversation",
      current_node: "assistant-serialization-math",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-serialization-math"] },
        "assistant-serialization-math": {
          id: "assistant-serialization-math",
          parent: "root",
          children: [],
          message: {
            id: "msg-serialization-math",
            author: { role: "assistant" },
            content: {
              parts: ["The identity is LATEX_REF."]
            },
            metadata: {
              serialization_metadata: {
                content_references: [{
                  matched_text: "LATEX_REF",
                  render_as: "latex",
                  text: "a+b"
                }]
              }
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-serialization-math",
      role: "assistant",
      text: "The identity is \\(a+b\\)."
    });
  });

  it("keeps ChatGPT latex references inline inside variable lists", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-inline-list-math",
      title: "Inline List Math Conversation",
      current_node: "assistant-inline-list-math",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-inline-list-math"] },
        "assistant-inline-list-math": {
          id: "assistant-inline-list-math",
          parent: "root",
          children: [],
          message: {
            id: "msg-inline-list-math",
            author: { role: "assistant" },
            content: {
              parts: ["其中：\n- LATEX_F：电磁力（N）\n- LATEX_B：磁感应强度（T）"]
            },
            metadata: {
              serialization_metadata: {
                content_references: [
                  {
                    matched_text: "LATEX_F",
                    render_as: "latex",
                    text: "F"
                  },
                  {
                    matched_text: "LATEX_B",
                    render_as: "latex",
                    text: "B"
                  }
                ]
              }
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-inline-list-math",
      role: "assistant",
      text: "其中：\n- \\(F\\)：电磁力（N）\n- \\(B\\)：磁感应强度（T）"
    });
    expect(snapshot.messages[0]?.text).not.toContain("$$");
  });

  it("uses ChatGPT latex reference indexes so numeric labels are not replaced globally", () => {
    const text = "4 种常见公式如下。\n\n其中：\n- 4：电磁力（N）\n- 5：磁感应强度（T）";
    const forceIndex = text.indexOf("- 4") + 2;
    const fieldIndex = text.indexOf("- 5") + 2;
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-indexed-list-math",
      title: "Indexed List Math Conversation",
      current_node: "assistant-indexed-list-math",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-indexed-list-math"] },
        "assistant-indexed-list-math": {
          id: "assistant-indexed-list-math",
          parent: "root",
          children: [],
          message: {
            id: "msg-indexed-list-math",
            author: { role: "assistant" },
            content: {
              parts: [text]
            },
            metadata: {
              serialization_metadata: {
                content_references: [
                  {
                    matched_text: "4",
                    start_idx: forceIndex,
                    end_idx: forceIndex + 1,
                    render_as: "latex",
                    text: "F"
                  },
                  {
                    matched_text: "5",
                    start_idx: fieldIndex,
                    end_idx: fieldIndex + 1,
                    render_as: "latex",
                    text: "B"
                  }
                ]
              }
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-indexed-list-math",
      role: "assistant",
      text: "4 种常见公式如下。\n\n其中：\n- \\(F\\)：电磁力（N）\n- \\(B\\)：磁感应强度（T）"
    });
    expect(snapshot.messages[0]?.text).not.toContain("$$");
  });

  it("keeps indexed variable-list latex separate from conflicting standalone formula references", () => {
    const text = [
      "吸力公式：",
      "9",
      "",
      "其中：",
      "- 4：电磁力（N）",
      "- 5：磁感应强度（T）",
      "- 6：电流（A）",
      "- 7：导体有效长度（m）",
      "- 8：电流方向与磁场方向夹角"
    ].join("\n");
    const refFor = (matchedText: string, latex: string) => {
      const index = text.indexOf(matchedText);
      return {
        matched_text: matchedText,
        start_idx: index,
        end_idx: index + matchedText.length,
        render_as: "latex",
        text: latex
      };
    };
    const listRefFor = (matchedText: string, latex: string) => {
      const index = text.indexOf(`- ${matchedText}`) + 2;
      return {
        matched_text: matchedText,
        start_idx: index,
        end_idx: index + matchedText.length,
        render_as: "latex",
        text: latex
      };
    };
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-indexed-list-with-formula",
      title: "Indexed List With Formula",
      current_node: "assistant-indexed-list-with-formula",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-indexed-list-with-formula"] },
        "assistant-indexed-list-with-formula": {
          id: "assistant-indexed-list-with-formula",
          parent: "root",
          children: [],
          message: {
            id: "msg-indexed-list-with-formula",
            author: { role: "assistant" },
            content: {
              parts: [text]
            },
            metadata: {
              content_references: [
                refFor("9", "F = BIL\\sin\\theta"),
                listRefFor("4", "F = BIL\\sin\\theta"),
                listRefFor("5", "F = BIL\\sin\\theta"),
                listRefFor("6", "F = BIL\\sin\\theta"),
                listRefFor("7", "F = BIL\\sin\\theta"),
                listRefFor("8", "F = BIL\\sin\\theta")
              ],
              serialization_metadata: {
                content_references: [
                  refFor("9", "F = BIL\\sin\\theta"),
                  listRefFor("4", "F"),
                  listRefFor("5", "B"),
                  listRefFor("6", "I"),
                  listRefFor("7", "L"),
                  listRefFor("8", "\\theta")
                ]
              }
            },
            create_time: 8
          }
        }
      }
    });

    expect(snapshot.messages[0]?.text).toBe([
      "吸力公式：",
      "$$",
      "F = BIL\\sin\\theta",
      "$$",
      "",
      "其中：",
      "- \\(F\\)：电磁力（N）",
      "- \\(B\\)：磁感应强度（T）",
      "- \\(I\\)：电流（A）",
      "- \\(L\\)：导体有效长度（m）",
      "- \\(\\theta\\)：电流方向与磁场方向夹角"
    ].join("\n"));
  });

  it("restores ChatGPT implicit short-line lists after Chinese intro markers", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-implicit-list",
      title: "Implicit List Conversation",
      current_node: "assistant-implicit-list",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-implicit-list"] },
        "assistant-implicit-list": {
          id: "assistant-implicit-list",
          parent: "root",
          children: [],
          message: {
            id: "msg-implicit-list",
            author: { role: "assistant" },
            content: {
              parts: [
                [
                  "主要包括：",
                  "参数配置",
                  "流程控制",
                  "输出格式",
                  "",
                  "这些内容用于导出。"
                ].join("\n")
              ]
            },
            create_time: 9
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-implicit-list",
      role: "assistant",
      text: "主要包括：\n- 参数配置\n- 流程控制\n- 输出格式\n\n这些内容用于导出。"
    });
  });

  it("repairs ChatGPT split markdown heading and divider markers", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-split-markdown",
      title: "Split Markdown Conversation",
      current_node: "assistant-split-markdown",
      mapping: {
        root: { id: "root", parent: null, children: ["assistant-split-markdown"] },
        "assistant-split-markdown": {
          id: "assistant-split-markdown",
          parent: "root",
          children: [],
          message: {
            id: "msg-split-markdown",
            author: { role: "assistant" },
            content: {
              parts: [
                [
                  "# # 总结",
                  "内容如下",
                  "- - -"
                ].join("\n")
              ]
            },
            create_time: 10
          }
        }
      }
    });

    expect(snapshot.messages[0]).toMatchObject({
      id: "msg-split-markdown",
      role: "assistant",
      text: "## 总结\n内容如下\n---"
    });
  });

  it("hydrates ChatGPT pasted text attachments from contextual tether_quote messages", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-pasted-text",
      title: "Pasted Text Conversation",
      current_node: "assistant-final",
      mapping: {
        root: { id: "root", parent: null, children: ["user-paste"] },
        "user-paste": {
          id: "user-paste",
          parent: "root",
          children: ["context-paste"],
          message: {
            id: "msg-user-paste",
            author: { role: "user" },
            content: {
              content_type: "text",
              parts: ["请基于这段粘贴文本继续处理"]
            },
            metadata: {
              attachments: [{
                id: "file-text-1",
                name: "粘贴的文本 (1).txt",
                mime_type: "text/plain"
              }]
            },
            create_time: 11
          }
        },
        "context-paste": {
          id: "context-paste",
          parent: "user-paste",
          children: ["assistant-final"],
          message: {
            id: "msg-context-paste",
            author: { role: "assistant" },
            content: {
              content_type: "tether_quote",
              title: "粘贴的文本 (1).txt",
              text: "<html><body><pre>第一行\n第二行\n第三行</pre></body></html>"
            },
            metadata: {
              is_visually_hidden_from_conversation: true,
              can_save: false
            },
            create_time: 12
          }
        },
        "assistant-final": {
          id: "assistant-final",
          parent: "context-paste",
          children: [],
          message: {
            id: "msg-assistant-final",
            author: { role: "assistant" },
            content: {
              content_type: "text",
              parts: ["已收到，我会基于文本处理。"]
            },
            create_time: 13
          }
        }
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "msg-user-paste",
        sourceMessageId: "msg-user-paste",
        role: "user",
        text: "请基于这段粘贴文本继续处理\n\n[附件1: 粘贴的文本 (1).txt]",
        createdAt: "11",
        attachments: [{
          id: "file-text-1",
          fileName: "粘贴的文本 (1).txt",
          mimeType: "text/plain",
          content: "第一行\n第二行\n第三行",
          url: undefined
        }]
      },
      {
        id: "msg-assistant-final",
        sourceMessageId: "msg-assistant-final",
        role: "assistant",
        text: "已收到，我会基于文本处理。",
        createdAt: "13"
      }
    ]);
  });

  it("strips script and style noise from ChatGPT pasted text attachment html payloads", () => {
    const snapshot = extractChatGPTSnapshotFromConversation({
      id: "conv-pasted-text-noise",
      title: "Pasted Text Noise Conversation",
      current_node: "assistant-final",
      mapping: {
        root: { id: "root", parent: null, children: ["user-paste"] },
        "user-paste": {
          id: "user-paste",
          parent: "root",
          children: ["context-paste"],
          message: {
            id: "msg-user-paste",
            author: { role: "user" },
            content: {
              content_type: "text",
              parts: ["这里有一段粘贴文本"]
            },
            metadata: {
              attachments: [{
                id: "file-text-1",
                name: "粘贴的文本 (1).txt",
                mime_type: "text/plain"
              }]
            },
            create_time: 11
          }
        },
        "context-paste": {
          id: "context-paste",
          parent: "user-paste",
          children: ["assistant-final"],
          message: {
            id: "msg-context-paste",
            author: { role: "assistant" },
            content: {
              content_type: "tether_quote",
              title: "粘贴的文本 (1).txt",
              text: "<html><head><style>body{color:red}</style><script>console.log('x')</script></head><body><pre>API returned 403\nJust a moment...\nCloudflare</pre></body></html>"
            },
            metadata: {
              can_save: false
            },
            create_time: 12
          }
        },
        "assistant-final": {
          id: "assistant-final",
          parent: "context-paste",
          children: [],
          message: {
            id: "msg-assistant-final",
            author: { role: "assistant" },
            content: {
              content_type: "text",
              parts: ["好的"]
            },
            create_time: 13
          }
        }
      }
    });

    expect(snapshot.messages[0]?.attachments?.[0]?.content).toBe("API returned 403\nJust a moment...\nCloudflare");
  });
});
