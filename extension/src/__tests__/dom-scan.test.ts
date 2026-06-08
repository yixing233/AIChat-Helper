import { describe, expect, it } from "vitest";
import { scanTextNodes } from "../platforms/shared/dom-scan";

describe("scanTextNodes", () => {
  it("adds a stable selector for message elements without ids", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">Hello from a generated node</article>
      </main>
    `;

    const [node] = scanTextNodes(document, ["article"], "chatgpt");

    expect(node.elementSelector).toBe("[data-ai-chat-helper-node-id=\"chatgpt-node-1\"]");
    expect(document.querySelector(node.elementSelector || "")?.textContent).toContain("Hello");
  });
});
