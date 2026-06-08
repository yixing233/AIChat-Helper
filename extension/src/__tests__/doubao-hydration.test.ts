import { describe, expect, it } from "vitest";
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
});
