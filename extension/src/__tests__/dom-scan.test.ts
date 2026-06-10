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

  it("keeps the full message text for node hover cards", () => {
    const longText = "A".repeat(120);
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">${longText}</article>
      </main>
    `;

    const [node] = scanTextNodes(document, ["article"], "chatgpt");

    expect(node.title).toBe("A".repeat(80));
    expect(node.text).toBe(longText);
  });

  it("can mirror the userscript rail by keeping only user question nodes", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">First user prompt</article>
        <article data-message-author-role="assistant">Assistant answer</article>
        <article data-testid="conversation-turn-user">Second user prompt</article>
      </main>
    `;

    const nodes = scanTextNodes(document, ["article"], "chatgpt", { roles: ["user"] });

    expect(nodes.map((node) => node.text)).toEqual(["First user prompt", "Second user prompt"]);
    expect(nodes.every((node) => node.role === "user")).toBe(true);
    expect(nodes.map((node) => node.index)).toEqual([0, 1]);
  });
});
