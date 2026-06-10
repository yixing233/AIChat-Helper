import { afterEach, describe, expect, it, vi } from "vitest";
import { doubaoAdapter } from "../platforms/doubao/adapter";
import { extractDoubaoSnapshotFromSingleChain } from "../platforms/doubao/mapping";
import type { CapturedNetworkEvent } from "../shared/types";

const doubaoPayload = {
  status_code: 0,
  downlink_body: {
    pull_singe_chain_downlink_body: {
      messages: [
        {
          message_id: "m-user",
          user_type: 1,
          index_in_conv: 1,
          create_time: 1780000000,
          tts_content: "Describe this file",
          content: JSON.stringify({
            entities: [
              {
                entity_content: {
                  file: {
                    file_name: "brief.pdf",
                    mime_type: "application/pdf",
                    url: "https://example.com/brief.pdf"
                  }
                }
              }
            ]
          })
        },
        {
          message_id: "m-assistant",
          user_type: 2,
          index_in_conv: 2,
          create_time: 1780000001,
          content_block: [
            { content: { text_block: { text: "The file is a project brief." } } },
            { content: { reference_block: { text: { text: "Reference note" } } } }
          ]
        }
      ]
    }
  }
};

describe("Doubao API hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("resolves current conversation ids from query parameters before path fallback", () => {
    expect(doubaoAdapter.getConversationId(new URL("https://www.doubao.com/chat?conversation_id=conv-query"))).toBe("conv-query");
    expect(doubaoAdapter.getConversationId(new URL("https://www.doubao.com/chat?chat_id=chat-query"))).toBe("chat-query");
    expect(doubaoAdapter.getConversationId(new URL("https://www.doubao.com/chat?session_id=session-query"))).toBe("session-query");
    expect(doubaoAdapter.getConversationId(new URL("https://www.doubao.com/chat/path-id"))).toBe("path-id");
  });

  it("extracts single-chain user and assistant messages", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain(doubaoPayload, "conv-1");

    expect(snapshot).toMatchObject({
      platformId: "doubao",
      conversationId: "conv-1",
      title: "Doubao Conversation"
    });
    expect(snapshot.messages).toEqual([
      {
        id: "doubao-export-m-user",
        sourceMessageId: "m-user",
        role: "user",
        text: "Describe this file\n[附件] brief.pdf",
        createdAt: "2026-05-28T20:26:40.000Z",
        attachments: [{
          id: "doubao-export-m-user-file-1",
          fileName: "brief.pdf",
          mimeType: "application/pdf",
          url: "https://example.com/brief.pdf"
        }]
      },
      {
        id: "doubao-export-m-assistant",
        sourceMessageId: "m-assistant",
        role: "assistant",
        text: "The file is a project brief.\nReference note",
        createdAt: "2026-05-28T20:26:41.000Z"
      }
    ]);
  });

  it("does not duplicate Doubao user tts text when content also contains attachments", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-user-dedupe",
              user_type: 1,
              index_in_conv: 1,
              tts_content: "Describe this file",
              content: JSON.stringify({
                text: "Describe this file",
                entities: [
                  {
                    entity_content: {
                      file: {
                        file_name: "brief.pdf",
                        mime_type: "application/pdf"
                      }
                    }
                  }
                ]
              })
            }
          ]
        }
      }
    }, "conv-dedupe");

    expect(snapshot.messages).toEqual([
      {
        id: "doubao-export-m-user-dedupe",
        sourceMessageId: "m-user-dedupe",
        role: "user",
        text: "Describe this file\n[附件] brief.pdf",
        attachments: [{
          id: "doubao-export-m-user-dedupe-file-1",
          fileName: "brief.pdf",
          mimeType: "application/pdf",
          url: undefined
        }]
      }
    ]);
  });

  it("formats multiple Doubao JSON content attachments without spaces in the serial label", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-json-files",
              user_type: 1,
              index_in_conv: 1,
              content: JSON.stringify({
                entities: [
                  { entity_content: { file: { file_name: "brief.pdf" } } },
                  { entity_content: { file: { file_name: "notes.txt" } } }
                ]
              })
            }
          ]
        }
      }
    }, "conv-json-files");

    expect(snapshot.messages[0]).toMatchObject({
      id: "doubao-export-m-json-files",
      role: "user",
      text: "[附件1] brief.pdf\n[附件2] notes.txt"
    });
  });

  it("filters Doubao raw preview image urls from exported text", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [{
            message_id: "m-noisy-url",
            user_type: 2,
            content_block: [{
              content: {
                text_block: {
                  text: [
                    "Here is the answer.",
                    "https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/example.png?lk3s=abc"
                  ].join("\n")
                }
              }
            }]
          }]
        }
      }
    }, "conv-noisy-url");

    expect(snapshot.messages).toEqual([{
      id: "doubao-export-m-noisy-url",
      sourceMessageId: "m-noisy-url",
      role: "assistant",
      text: "Here is the answer."
    }]);
  });

  it("filters Doubao raw entity JSON payload lines from exported text", () => {
    const rawEntityLine = JSON.stringify({
      entities: [
        {
          entity_content: {
            text: {
              text: "internal entity payload"
            }
          }
        }
      ]
    });

    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [{
            message_id: "m-noisy-json",
            user_type: 2,
            content_block: [{
              content: {
                text_block: {
                  text: ["Here is the answer.", rawEntityLine].join("\n")
                }
              }
            }]
          }]
        }
      }
    }, "conv-noisy-json");

    expect(snapshot.messages).toEqual([{
      id: "doubao-export-m-noisy-json",
      sourceMessageId: "m-noisy-json",
      role: "assistant",
      text: "Here is the answer."
    }]);
  });

  it("extracts Doubao image entity urls from nested image variants", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-image",
              user_type: 2,
              index_in_conv: 1,
              create_time: 1780000002,
              content: JSON.stringify({
                entities: [
                  {
                    entity_content: {
                      image: {
                        key: "tos-cn-i-image/key.png",
                        mime_type: "image/png",
                        image_ori: { url: "https://example.com/original.png" },
                        preview_img: { url: "https://example.com/preview.png" },
                        image_thumb: { url: "https://example.com/thumb.png" }
                      }
                    }
                  }
                ]
              })
            }
          ]
        }
      }
    }, "conv-image");

    expect(snapshot.messages).toEqual([
      {
        id: "doubao-export-m-image",
        sourceMessageId: "m-image",
        role: "assistant",
        text: "[图片] https://example.com/original.png",
        createdAt: "2026-05-28T20:26:42.000Z",
        attachments: [{
          id: "doubao-export-m-image-image-1",
          fileName: "tos-cn-i-image/key.png",
          mimeType: "image/png",
          url: "https://example.com/original.png"
        }]
      }
    ]);
  });

  it("summarizes Doubao requirement clarify blocks without leaking option keys", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-requirement",
              user_type: 2,
              index_in_conv: 1,
              content_block: [
                {
                  content: {
                    requirement_clarify_block: {
                      requirements: [
                        {
                          requirement_items: [
                            {
                              title: "输出风格",
                              content: "请选择更适合的输出风格",
                              selected_requirement_key: "concise",
                              requirement_items: [
                                { key: "concise", title: "简洁" },
                                { key: "detailed", title: "详细" }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }, "conv-requirement");

    expect(snapshot.messages).toEqual([
      {
        id: "doubao-export-m-requirement",
        sourceMessageId: "m-requirement",
        role: "assistant",
        text: "【输出风格】\n请选择更适合的输出风格\n\n已选风格: 简洁"
      }
    ]);
  });

  it("exports Doubao artifact blocks as separate messages after the normal answer", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-mixed-artifact",
              user_type: 2,
              index_in_conv: 1,
              create_time: 1780000003,
              content_block: [
                { content: { text_block: { text: "Here is the implementation." } } },
                {
                  content: {
                    artifact_block: {
                      resource_id: "code-1",
                      resource_version: "v2",
                      title: "Demo code"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }, "conv-mixed-artifact", {
      artifactTexts: {
        "code-1@v2": "【demo.js】\n\n```js\nconsole.log(1);\n```"
      }
    });

    expect(snapshot.messages).toEqual([
      {
        id: "doubao-export-m-mixed-artifact",
        sourceMessageId: "m-mixed-artifact",
        role: "assistant",
        text: "Here is the implementation.",
        createdAt: "2026-05-28T20:26:43.000Z"
      },
      {
        id: "doubao-export-m-mixed-artifact-artifact",
        sourceMessageId: "m-mixed-artifact",
        role: "assistant",
        text: "【Demo code】\n【demo.js】\n\n```js\nconsole.log(1);\n```",
        createdAt: "2026-05-28T20:26:43.000Z",
        isArtifact: true
      }
    ]);
  });

  it("uses the userscript Doubao artifact fallback title when the block has no title", () => {
    const snapshot = extractDoubaoSnapshotFromSingleChain({
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-default-artifact-title",
              user_type: 2,
              index_in_conv: 1,
              content_block: [
                {
                  content: {
                    artifact_block: {
                      resource_id: "code-default-title",
                      resource_version: "v1"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }, "conv-default-artifact-title", {
      artifactTexts: {
        "code-default-title@v1": "【index.html】\n\n```html\n<div>Hello</div>\n```"
      }
    });

    expect(snapshot.messages).toEqual([{
      id: "doubao-export-m-default-artifact-title-artifact",
      sourceMessageId: "m-default-artifact-title",
      role: "assistant",
      text: "【代码编辑器】\n【index.html】\n\n```html\n<div>Hello</div>\n```",
      isArtifact: true
    }]);
  });

  it("hydrates from captured chain/single events", async () => {
    const events: CapturedNetworkEvent[] = [{
      id: "fetch-1",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/single",
      method: "POST",
      status: 200,
      requestBody: JSON.stringify({
        uplink_body: {
          pull_singe_chain_uplink_body: { conversation_id: "conv-1" }
        }
      }),
      responseText: JSON.stringify(doubaoPayload),
      createdAt: 1
    }];

    await expect(doubaoAdapter.hydrateFromCapturedApi?.(events)).resolves.toMatchObject({
      conversationId: "conv-1",
      messages: [
        { role: "user", text: "Describe this file\n[附件] brief.pdf" },
        { role: "assistant", text: "The file is a project brief.\nReference note" }
      ]
    });
  });

  it("fetches recent conversation summaries from the recent_conv API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        downlink_body: {
          pull_recent_conv_chain_downlink_body: {
            conversation_list: [
              {
                conversation_id: "conv-1",
                title: "Doubao Conversation",
                updated_at: 1780000001000,
                message_count: 2
              }
            ]
          }
        }
      })
    } as Response);

    await expect(doubaoAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([
      {
        platformId: "doubao",
        conversationId: "conv-1",
        title: "Doubao Conversation",
        updatedAt: "2026-05-28T20:26:41.000Z",
        updatedAtText: new Date("2026-05-28T20:26:41.000Z").toLocaleString(),
        messageCount: 2
      }
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/im/chain/recent_conv");
    expect(String(url)).toContain("version_code=20800");
    expect(String(url)).toContain("aid=497858");
    expect(String(url)).toContain("web_tab_id=");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        accept: "application/json, text/plain, */*"
      }
    });
    const body = JSON.parse(String(init?.body));
    expect(body.sequence_id).toBeTruthy();
    expect(body).toMatchObject({
      cmd: 3200,
      uplink_body: {
        pull_recent_conv_chain_uplink_body: {
          limit: 20,
          message_count_per_conv: 10,
          api_version: 1,
          conv_version: 0,
          direction: 3,
          option: {
            not_need_message: true,
            need_complete_conversation: true,
            need_coco_conversation: true,
            need_coco_bot: true,
            need_pc_pin_chain: true,
            pc_pin_query_type: 0
          }
        }
      },
      channel: 2,
      version: "1"
    });
  });

  it("recursively finds nested Doubao recent conversations and skips entries without ids like the userscript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        downlink_body: {
          pull_recent_conv_chain_downlink_body: {
            conversation_list: [
              {
                title: "Missing id should be skipped",
                updated_at: 1780000002000
              }
            ]
          }
        },
        nested_payload: {
          any_shape: {
            conversation_id: "conv-recursive",
            title: "Recursive Doubao Conversation",
            updated_at: 1780000001000,
            badge_count: 3
          }
        }
      })
    } as Response);

    await expect(doubaoAdapter.fetchConversationList?.({ limit: 20 })).resolves.toEqual([{
      platformId: "doubao",
      conversationId: "conv-recursive",
      title: "Recursive Doubao Conversation",
      updatedAt: "2026-05-28T20:26:41.000Z",
      updatedAtText: new Date("2026-05-28T20:26:41.000Z").toLocaleString(),
      messageCount: 3
    }]);
  });

  it("reuses captured Doubao recent_conv URL, web tab id, and sanitized headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        downlink_body: {
          pull_recent_conv_chain_downlink_body: {
            conversation_list: [
              {
                conversation_id: "conv-captured",
                title: "Captured Doubao Conversation",
                updated_at: 1780000001000
              }
            ]
          }
        }
      })
    } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "recent-1",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/recent_conv?custom=1&web_tab_id=tab-captured",
      method: "POST",
      status: 200,
      requestHeaders: {
        "X-Tt-Trace-Id": "trace-123",
        "Agw-Js-Conv": "str",
        Cookie: "should-not-forward",
        Referer: "https://www.doubao.com/chat"
      },
      requestBody: JSON.stringify({
        cmd: 3200,
        uplink_body: {
          pull_recent_conv_chain_uplink_body: {
            limit: 8,
            conv_version: 999,
            direction: 3,
            option: { need_coco_bot: true }
          }
        },
        sequence_id: "old-sequence",
        channel: 2,
        version: "1"
      }),
      responseText: "{}",
      createdAt: 1
    }];

    await doubaoAdapter.fetchConversationList?.({ limit: 5, capturedEvents });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/im/chain/recent_conv");
    expect(String(url)).toContain("custom=1");
    expect(String(url)).toContain("web_tab_id=tab-captured");
    expect(String(url)).toContain("version_code=20800");
    expect(String(url)).toContain("aid=497858");
    expect(init?.headers).toMatchObject({
      "x-tt-trace-id": "trace-123",
      "agw-js-conv": "str",
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; encoding=utf-8"
    });
    expect(init?.headers).not.toHaveProperty("cookie");
    expect(init?.headers).not.toHaveProperty("referer");
    const body = JSON.parse(String(init?.body));
    expect(body.sequence_id).toBeTruthy();
    expect(body.sequence_id).not.toBe("old-sequence");
    expect(body.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      limit: 5,
      conv_version: 0,
      direction: 3,
      option: {
        need_coco_bot: true,
        need_coco_conversation: true,
        need_pc_pin_chain: true,
        pc_pin_query_type: 0
      }
    });
  });

  it("falls back to the default Doubao recent_conv body when the captured template returns a business error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status_code: 1001,
          status_desc: "stale captured template"
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status_code: 0,
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              conversation_list: [
                {
                  conversation_id: "conv-fallback",
                  title: "Fallback Doubao Conversation",
                  updated_at: 1780000001000
                }
              ]
            }
          }
        })
      } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "recent-stale-template",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/recent_conv?web_tab_id=tab-fallback",
      method: "POST",
      status: 200,
      requestHeaders: {
        "X-Tt-Trace-Id": "trace-fallback"
      },
      requestBody: JSON.stringify({
        cmd: 3200,
        uplink_body: {
          pull_recent_conv_chain_uplink_body: {
            limit: 8,
            conv_version: 999,
            direction: 3,
            stale_template_marker: true,
            option: { need_coco_bot: true }
          }
        },
        sequence_id: "old-sequence",
        channel: 2,
        version: "1"
      }),
      responseText: "{}",
      createdAt: 1
    }];

    await expect(doubaoAdapter.fetchConversationList?.({ limit: 1, capturedEvents })).resolves.toMatchObject([
      {
        conversationId: "conv-fallback",
        title: "Fallback Doubao Conversation"
      }
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstBody.uplink_body.pull_recent_conv_chain_uplink_body.stale_template_marker).toBe(true);
    expect(secondBody.uplink_body.pull_recent_conv_chain_uplink_body.stale_template_marker).toBeUndefined();
    expect(secondBody.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      limit: 1,
      conv_version: 0,
      direction: 3
    });
  });

  it("tries stored Doubao web tab id when a captured recent_conv tab id is stale", async () => {
    sessionStorage.setItem("ai-nodes-doubao-web-tab-id", "tab-good");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("web_tab_id") === "tab-stale") {
        return {
          ok: true,
          json: async () => ({
            status_code: 1001,
            status_desc: "stale web tab"
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          status_code: 0,
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              conversation_list: [
                {
                  conversation_id: "conv-good-tab",
                  title: "Good Tab Conversation",
                  updated_at: 1780000001000
                }
              ]
            }
          }
        })
      } as Response;
    });
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "recent-stale-tab",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/recent_conv?web_tab_id=tab-stale",
      method: "POST",
      status: 200,
      requestHeaders: {
        "X-Tt-Trace-Id": "trace-stale-tab"
      },
      responseText: "{}",
      createdAt: 1
    }];

    await expect(doubaoAdapter.fetchConversationList?.({ limit: 1, capturedEvents })).resolves.toMatchObject([
      {
        conversationId: "conv-good-tab",
        title: "Good Tab Conversation"
      }
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("web_tab_id")).toBe("tab-stale");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("web_tab_id")).toBe("tab-good");
  });

  it("fetches multiple Doubao recent conversation pages until the requested limit is reached", async () => {
    const firstList = Array.from({ length: 20 }, (_, index) => ({
      conversation_id: `conv-${index + 1}`,
      title: `Doubao Conversation ${index + 1}`,
      updated_at: 1780000100000 - index,
      message_count: index + 1
    }));
    const secondList = Array.from({ length: 15 }, (_, index) => ({
      conversation_id: `conv-${index + 21}`,
      title: `Doubao Conversation ${index + 21}`,
      updated_at: 1780000000000 - index,
      message_count: index + 21
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: true,
              next_conv_version: 12345,
              conversation_list: firstList
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: 0 })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: false,
              conversation_list: secondList
            }
          }
        })
      } as Response);

    const summaries = await doubaoAdapter.fetchConversationList?.({ limit: 35 });

    expect(summaries).toHaveLength(35);
    expect(summaries?.[0]).toMatchObject({
      conversationId: "conv-1",
      title: "Doubao Conversation 1"
    });
    expect(summaries?.[34]).toMatchObject({
      conversationId: "conv-35",
      title: "Doubao Conversation 35"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://mcs.doubao.com/list", {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "*/*",
        "content-type": "application/json;charset=utf-8"
      },
      body: "{}"
    });
    const secondBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(firstBody.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      limit: 20,
      conv_version: 0,
      direction: 3
    });
    expect(secondBody.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      limit: 15,
      conv_version: 12345,
      direction: 1,
      option: {
        need_coco_conversation: false,
        need_coco_bot: false,
        need_pc_pin_chain: true,
        pc_pin_query_type: 1
      }
    });
  });

  it("uses nested Doubao conversation version cursors before timestamp fallbacks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: true,
              conversation_list: [
                {
                  conversation_id: "conv-nested-cursor",
                  title: "Nested Cursor Conversation",
                  updated_at: 1780000001000,
                  conversation_info: {
                    conv_version: "nested-cursor-1"
                  }
                }
              ]
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: 0 })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: false,
              conversation_list: [
                {
                  conversation_id: "conv-after-nested-cursor",
                  title: "After Nested Cursor Conversation",
                  updated_at: 1779999999000
                }
              ]
            }
          }
        })
      } as Response);

    await doubaoAdapter.fetchConversationList?.({ limit: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondRecentBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(secondRecentBody.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      conv_version: "nested-cursor-1",
      direction: 1
    });
  });

  it("extracts userscript-style Doubao nested batch metadata and sorts by update time", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        downlink_body: {
          pull_recent_conv_chain_downlink_body: {
            conversation_list: [
              {
                conversation_id: "conv-old",
                conversation_info: {
                  title: "Older Nested Doubao Conversation",
                  badge_count: 2,
                  created_at: 1780000000000,
                  updated_at: 1780000001000
                }
              },
              {
                conversation_id: "conv-new",
                coco_conversation: {
                  name: "Newer Nested Doubao Conversation",
                  badge_count: 5,
                  create_time: 1780000100000,
                  update_time: 1780000101000
                }
              }
            ]
          }
        }
      })
    } as Response);

    await expect(doubaoAdapter.fetchConversationList?.({ limit: 10 })).resolves.toEqual([
      {
        platformId: "doubao",
        conversationId: "conv-new",
        title: "Newer Nested Doubao Conversation",
        updatedAt: "2026-05-28T20:28:21.000Z",
        updatedAtText: new Date("2026-05-28T20:28:21.000Z").toLocaleString(),
        createdAt: "2026-05-28T20:28:20.000Z",
        createdAtText: new Date("2026-05-28T20:28:20.000Z").toLocaleString(),
        messageCount: 5
      },
      {
        platformId: "doubao",
        conversationId: "conv-old",
        title: "Older Nested Doubao Conversation",
        updatedAt: "2026-05-28T20:26:41.000Z",
        updatedAtText: new Date("2026-05-28T20:26:41.000Z").toLocaleString(),
        createdAt: "2026-05-28T20:26:40.000Z",
        createdAtText: new Date("2026-05-28T20:26:40.000Z").toLocaleString(),
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preflights captured Doubao mcs list requests before recent_conv continuation pages", async () => {
    const firstList = Array.from({ length: 20 }, (_, index) => ({
      conversation_id: `conv-mcs-${index + 1}`,
      title: `Doubao MCS Conversation ${index + 1}`,
      updated_at: 1780000100000 - index
    }));
    const secondList = Array.from({ length: 5 }, (_, index) => ({
      conversation_id: `conv-mcs-${index + 21}`,
      title: `Doubao MCS Conversation ${index + 21}`,
      updated_at: 1780000000000 - index
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: true,
              next_conv_version: 12345,
              conversation_list: firstList
            }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: 0 })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downlink_body: {
            pull_recent_conv_chain_downlink_body: {
              has_more: false,
              conversation_list: secondList
            }
          }
        })
      } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [
      {
        id: "recent-mcs-1",
        kind: "fetch",
        url: "https://www.doubao.com/im/chain/recent_conv?web_tab_id=tab-mcs",
        method: "POST",
        status: 200,
        requestHeaders: { "X-Tt-Trace-Id": "trace-mcs" },
        requestBody: "{}",
        responseText: "{}",
        createdAt: 1
      },
      {
        id: "mcs-1",
        kind: "fetch",
        url: "https://mcs.doubao.com/list?aid=497858",
        method: "OPTIONS",
        status: 204,
        requestHeaders: {
          "X-Mcs-Token": "token-123",
          "Content-Type": "application/json;charset=utf-8",
          Cookie: "should-not-forward"
        },
        requestBody: "{\"scene\":\"captured\"}",
        createdAt: 2
      }
    ];

    const summaries = await doubaoAdapter.fetchConversationList?.({ limit: 25, capturedEvents });

    expect(summaries).toHaveLength(25);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://mcs.doubao.com/list?aid=497858", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-mcs-token": "token-123",
        "content-type": "application/json;charset=utf-8",
        accept: "application/json, text/plain, */*",
        "agw-js-conv": "str"
      },
      body: "{\"scene\":\"captured\"}"
    });
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty("cookie");
    const secondRecentBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(secondRecentBody.uplink_body.pull_recent_conv_chain_uplink_body).toMatchObject({
      limit: 5,
      conv_version: 12345,
      direction: 1
    });
  });

  it("fetches conversation detail from the single-chain API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => doubaoPayload
    } as Response);

    await expect(doubaoAdapter.fetchConversationDetail?.("conv-1")).resolves.toMatchObject({
      platformId: "doubao",
      conversationId: "conv-1",
      messages: [
        { role: "user", text: "Describe this file\n[附件] brief.pdf" },
        { role: "assistant", text: "The file is a project brief.\nReference note" }
      ]
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/im/chain/single");
    expect(String(url)).toContain("version_code=20800");
    expect(String(url)).toContain("aid=497858");
    expect(String(url)).toContain("web_tab_id=");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        accept: "application/json, text/plain, */*"
      }
    });
    const body = JSON.parse(String(init?.body));
    expect(body.sequence_id).toBeTruthy();
    expect(body).toMatchObject({
      cmd: 3100,
      uplink_body: {
        pull_singe_chain_uplink_body: {
          conversation_id: "conv-1",
          anchor_index: Number.MAX_SAFE_INTEGER,
          conversation_type: 3,
          direction: 1,
          limit: 50,
          ext: {},
          filter: { index_list: [] }
        }
      },
      channel: 2,
      version: "1"
    });
  });

  it("treats Doubao single-chain business errors as detail fetch failures like the userscript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: 1001,
        status_desc: "invalid web_tab_id"
      })
    } as Response);

    await expect(doubaoAdapter.fetchConversationDetail?.("conv-business-error"))
      .rejects
      .toThrow("status_code=1001");
  });

  it("reuses captured Doubao single-chain URL, body template, and sanitized headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => doubaoPayload
    } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "single-1",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/single?custom=1&web_tab_id=tab-single",
      method: "POST",
      status: 200,
      requestHeaders: {
        "X-Tt-Trace-Id": "trace-single",
        Cookie: "should-not-forward",
        "Sec-Fetch-Site": "same-origin"
      },
      requestBody: JSON.stringify({
        cmd: 3100,
        uplink_body: {
          pull_singe_chain_uplink_body: {
            conversation_id: "old-conv",
            section_id: "old-section",
            anchor_index: 12,
            conversation_type: 3,
            direction: 2,
            limit: 77,
            ext: { conversation_id: "old-nested" },
            filter: { index_list: [3] }
          }
        },
        sequence_id: "old-sequence",
        channel: 2,
        version: "1"
      }),
      responseText: JSON.stringify(doubaoPayload),
      createdAt: 1
    }];

    await doubaoAdapter.fetchConversationDetail?.("conv-new", undefined, capturedEvents);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/im/chain/single");
    expect(String(url)).toContain("custom=1");
    expect(String(url)).toContain("web_tab_id=tab-single");
    expect(String(url)).toContain("version_code=20800");
    expect(init?.headers).toMatchObject({
      "x-tt-trace-id": "trace-single",
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; encoding=utf-8",
      "agw-js-conv": "str"
    });
    expect(init?.headers).not.toHaveProperty("cookie");
    expect(init?.headers).not.toHaveProperty("sec-fetch-site");
    const body = JSON.parse(String(init?.body));
    expect(JSON.stringify(body)).not.toContain("old-conv");
    expect(JSON.stringify(body)).not.toContain("old-section");
    expect(JSON.stringify(body)).not.toContain("old-nested");
    expect(body.sequence_id).toBeTruthy();
    expect(body.sequence_id).not.toBe("old-sequence");
    expect(body.uplink_body.pull_singe_chain_uplink_body).toMatchObject({
      conversation_id: "conv-new",
      section_id: "conv-new",
      anchor_index: Number.MAX_SAFE_INTEGER,
      direction: 1,
      limit: 77,
      ext: { conversation_id: "conv-new" },
      filter: { index_list: [3] }
    });
  });

  it("fetches all Doubao detail pages using cursor and next index", async () => {
    const firstPage = {
      downlink_body: {
        pull_singe_chain_downlink_body: {
          has_more: true,
          msg_cursor: "cursor-older",
          next_index: 2,
          messages: [
            {
              message_id: "m-new",
              user_type: 2,
              index_in_conv: 3,
              content_block: [{ content: { text_block: { text: "New answer" } } }]
            }
          ]
        }
      }
    };
    const secondPage = {
      downlink_body: {
        pull_singe_chain_downlink_body: {
          has_more: false,
          messages: [
            {
              message_id: "m-old",
              user_type: 1,
              index_in_conv: 1,
              tts_content: "Old question"
            },
            {
              message_id: "m-mid",
              user_type: 2,
              index_in_conv: 2,
              content_block: [{ content: { text_block: { text: "Middle answer" } } }]
            }
          ]
        }
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstPage
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage
      } as Response);

    await expect(doubaoAdapter.fetchConversationDetail?.("conv-paged")).resolves.toMatchObject({
      platformId: "doubao",
      conversationId: "conv-paged",
      messages: [
        { role: "user", text: "Old question" },
        { role: "assistant", text: "Middle answer" },
        { role: "assistant", text: "New answer" }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondBody.uplink_body.pull_singe_chain_uplink_body).toMatchObject({
      conversation_id: "conv-paged",
      msg_cursor: "cursor-older",
      anchor_index: 2
    });
  });

  it("continues current Doubao detail export beyond the batch preview page cap", async () => {
    const pages = Array.from({ length: 31 }, (_, index) => {
      const pageNumber = index + 1;
      return {
        downlink_body: {
          pull_singe_chain_downlink_body: {
            has_more: pageNumber < 31,
            msg_cursor: `cursor-${pageNumber + 1}`,
            next_index: 31 - pageNumber,
            messages: [{
              message_id: `m-page-${pageNumber}`,
              user_type: pageNumber % 2 ? 1 : 2,
              index_in_conv: pageNumber,
              tts_content: `Question ${pageNumber}`,
              content_block: [{ content: { text_block: { text: `Answer ${pageNumber}` } } }]
            }]
          }
        }
      };
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    pages.forEach((page) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => page
      } as Response);
    });

    await expect(doubaoAdapter.fetchConversationDetail?.("conv-long-current")).resolves.toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          sourceMessageId: "m-page-31",
          text: expect.stringContaining("Question 31")
        })
      ])
    });

    expect(fetchMock).toHaveBeenCalledTimes(31);
  });

  it("fetches Doubao artifact block content and appends it to exported messages", async () => {
    sessionStorage.setItem("ai-nodes-doubao-web-tab-id", "tab-123");
    const artifactPayload = {
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-artifact",
              user_type: 2,
              index_in_conv: 1,
              content_block: [
                {
                  content: {
                    artifact_block: {
                      resource_id: "code-1",
                      resource_version: "v2",
                      title: "Demo code"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => artifactPayload
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          data: {
            files: [{
              name: "demo.js",
              language: "js",
              content: "console.log(1);"
            }]
          }
        })
      } as Response);

    await expect(doubaoAdapter.fetchConversationDetail?.("conv-artifact")).resolves.toMatchObject({
      platformId: "doubao",
      conversationId: "conv-artifact",
      messages: [{
        role: "assistant",
        text: "【Demo code】\n【demo.js】\n\n```js\nconsole.log(1);\n```"
      }]
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/samantha/code/get_artifact"), {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        accept: "application/json, text/plain, */*"
      }
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("code_id=code-1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("version=v2");
    expect(String(fetchMock.mock.calls[1][0])).toContain("web_tab_id=tab-123");
    expect(String(fetchMock.mock.calls[1][0])).toContain("version_code=20800");
    expect(String(fetchMock.mock.calls[1][0])).toContain("aid=497858");
  });

  it("fetches Doubao artifact content with sanitized captured request headers", async () => {
    const artifactPayload = {
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              message_id: "m-artifact-captured-headers",
              user_type: 2,
              index_in_conv: 1,
              content_block: [
                {
                  content: {
                    artifact_block: {
                      resource_id: "code-captured",
                      resource_version: "v3",
                      title: "Captured code"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => artifactPayload
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          data: {
            files: [{
              name: "captured.js",
              language: "js",
              content: "export const value = 1;"
            }]
          }
        })
      } as Response);
    const capturedEvents: CapturedNetworkEvent[] = [{
      id: "single-artifact-1",
      kind: "fetch",
      url: "https://www.doubao.com/im/chain/single?web_tab_id=tab-artifact",
      method: "POST",
      status: 200,
      requestHeaders: {
        "X-Tt-Trace-Id": "trace-artifact",
        Origin: "https://www.doubao.com"
      },
      requestBody: JSON.stringify({
        uplink_body: {
          pull_singe_chain_uplink_body: { conversation_id: "conv-artifact-captured" }
        }
      }),
      responseText: JSON.stringify(artifactPayload),
      createdAt: 1
    }];

    await doubaoAdapter.fetchConversationDetail?.("conv-artifact-captured", undefined, capturedEvents);

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/samantha/code/get_artifact"), {
      method: "GET",
      credentials: "include",
      headers: {
        "x-tt-trace-id": "trace-artifact",
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str"
      }
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("web_tab_id=tab-artifact");
  });
});
