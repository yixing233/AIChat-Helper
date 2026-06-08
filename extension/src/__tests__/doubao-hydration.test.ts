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
              { entity_content: { file: { file_name: "brief.pdf" } } }
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
        role: "user",
        text: "Describe this file\n[Attachment] brief.pdf",
        createdAt: "2026-05-28T20:26:40.000Z"
      },
      {
        id: "doubao-export-m-assistant",
        role: "assistant",
        text: "The file is a project brief.\nReference note",
        createdAt: "2026-05-28T20:26:41.000Z"
      }
    ]);
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
        { role: "user", text: "Describe this file\n[Attachment] brief.pdf" },
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
        messageCount: 2
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/im/chain/recent_conv", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify({
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
      })
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
        { role: "user", text: "Describe this file\n[Attachment] brief.pdf" },
        { role: "assistant", text: "The file is a project brief.\nReference note" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith("/im/chain/single", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; encoding=utf-8",
        "agw-js-conv": "str",
        accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify({
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
      })
    });
  });
});
