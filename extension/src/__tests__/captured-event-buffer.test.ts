import { describe, expect, it } from "vitest";
import { createCapturedEventBuffer } from "../content/captured-event-buffer";
import type { CapturedNetworkEvent } from "../shared/types";

describe("createCapturedEventBuffer", () => {
  const event: CapturedNetworkEvent = {
    id: "fetch-1",
    kind: "fetch",
    url: "https://chatgpt.com/backend-api/conversation",
    createdAt: 1
  };

  it("stores captured network events in insertion order", () => {
    const buffer = createCapturedEventBuffer();

    buffer.push(event);

    expect(buffer.snapshot()).toEqual([event]);
  });

  it("keeps the newest events when capacity is exceeded", () => {
    const buffer = createCapturedEventBuffer(1);

    buffer.push({ ...event, id: "fetch-1" });
    buffer.push({ ...event, id: "fetch-2" });

    expect(buffer.snapshot().map((item) => item.id)).toEqual(["fetch-2"]);
  });
});
