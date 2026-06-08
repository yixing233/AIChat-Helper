import { describe, expect, it } from "vitest";
import { filterConversationNodes, getNextSearchIndex, getReadingLineScrollTop } from "../ui/controls/node-list";
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

  it("computes scroll position that aligns an element to the reading line", () => {
    const element = document.createElement("article");
    element.getBoundingClientRect = () => ({
      top: 320,
      left: 0,
      right: 0,
      bottom: 520,
      width: 0,
      height: 200,
      x: 0,
      y: 320,
      toJSON: () => ({})
    });

    expect(getReadingLineScrollTop(element, 150, 40)).toBe(210);
  });

  it("cycles search result indexes forward and backward", () => {
    expect(getNextSearchIndex(0, 3, 1)).toBe(1);
    expect(getNextSearchIndex(2, 3, 1)).toBe(0);
    expect(getNextSearchIndex(0, 3, -1)).toBe(2);
    expect(getNextSearchIndex(0, 0, 1)).toBe(-1);
  });
});
