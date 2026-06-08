import { describe, expect, it } from "vitest";
import { filterConversationNodes } from "../ui/controls/node-list";
import type { ConversationNode } from "../shared/types";

const nodes: ConversationNode[] = [
  { id: "1", index: 0, title: "Plan Alpha", role: "user" },
  { id: "2", index: 1, title: "Review Beta", role: "assistant" },
  { id: "3", index: 2, title: "alpha summary", role: "assistant" }
];

describe("filterConversationNodes", () => {
  it("filters nodes by case-insensitive title text", () => {
    expect(filterConversationNodes(nodes, "ALPHA").map((node) => node.id)).toEqual(["1", "3"]);
  });

  it("returns all nodes for blank queries", () => {
    expect(filterConversationNodes(nodes, "   ")).toEqual(nodes);
  });
});
