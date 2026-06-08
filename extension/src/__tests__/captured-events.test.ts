import { describe, expect, it } from "vitest";
import { createCapturedNetworkEventFactory } from "../injected/captured-events";

describe("createCapturedNetworkEventFactory", () => {
  it("creates stable fetch event ids and timestamps", () => {
    const createEvent = createCapturedNetworkEventFactory(() => 1710000000000);

    expect(
      createEvent("fetch", {
        url: "https://chatgpt.com/backend-api/conversation",
        method: "GET",
        status: 200,
        responseText: "{}"
      })
    ).toEqual({
      id: "fetch-1",
      kind: "fetch",
      url: "https://chatgpt.com/backend-api/conversation",
      method: "GET",
      status: 200,
      responseText: "{}",
      createdAt: 1710000000000
    });
  });

  it("increments ids per event", () => {
    const createEvent = createCapturedNetworkEventFactory(() => 1);

    expect(createEvent("xhr", { url: "/api" }).id).toBe("xhr-1");
    expect(createEvent("xhr", { url: "/api" }).id).toBe("xhr-2");
  });
});
