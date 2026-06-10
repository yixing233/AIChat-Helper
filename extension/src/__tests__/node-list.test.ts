import { describe, expect, it, vi } from "vitest";
import { getReadingLineScrollTop, renderNodeList, scrollNodeIntoView } from "../ui/controls/node-list";
import type { ConversationNode } from "../shared/types";

const nodes: ConversationNode[] = [
  { id: "1", index: 0, title: "Plan Alpha", text: "Plan Alpha full prompt body", role: "user" },
  { id: "2", index: 1, title: "Review Beta", text: "Review Beta full answer body", role: "assistant" },
  { id: "3", index: 2, title: "alpha summary", text: "alpha summary body", role: "assistant" }
];

describe("node-list controls", () => {
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

  it("scrolls the nearest chat scroller to align a node with the reading line", () => {
    const scroller = document.createElement("div");
    const target = document.createElement("article");
    scroller.style.overflowY = "auto";
    scroller.appendChild(target);
    document.body.appendChild(scroller);

    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 50, writable: true });
    scroller.getBoundingClientRect = () => ({
      top: 100,
      left: 0,
      right: 400,
      bottom: 500,
      width: 400,
      height: 400,
      x: 0,
      y: 100,
      toJSON: () => ({})
    });
    target.getBoundingClientRect = () => ({
      top: 420,
      left: 0,
      right: 400,
      bottom: 500,
      width: 400,
      height: 80,
      x: 0,
      y: 420,
      toJSON: () => ({})
    });
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    target.setAttribute("data-node", "target");

    const didScroll = scrollNodeIntoView({
      id: "target",
      index: 0,
      title: "Target prompt",
      role: "user",
      elementSelector: "[data-node='target']"
    }, 150);

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 220, behavior: "smooth" });
  });

  it("marks the active node and role classes", () => {
    const container = document.createElement("div");

    renderNodeList(container, nodes, {
      activeNodeId: "2"
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(container.querySelector(".ai-chat-helper-orbital__track")).toBeTruthy();
    expect(container.querySelector(".ai-chat-helper-node-indicator")).toBeTruthy();
    expect(buttons[0].classList.contains("ai-chat-helper-node-dot")).toBe(true);
    expect(buttons[1].classList.contains("ai-chat-helper-node--active")).toBe(true);
    expect(buttons[0].classList.contains("ai-chat-helper-node--user")).toBe(true);
    expect(buttons[1].classList.contains("ai-chat-helper-node--assistant")).toBe(true);
    expect(buttons[1].getAttribute("aria-current")).toBe("true");
    expect(buttons[0].textContent?.trim()).toBe("");
    expect(buttons[1].textContent?.trim()).toBe("");
    expect(buttons[0].getAttribute("aria-label")).toBe("Plan Alpha");
    expect(container.querySelector<HTMLElement>(".ai-chat-helper-node-indicator")?.style.getPropertyValue("--ai-chat-helper-node-indicator-y")).toBe("54px");
  });

  it("delegates node clicks to the provided navigation handler", () => {
    const container = document.createElement("div");
    const onNodeClick = vi.fn();

    renderNodeList(container, nodes, { onNodeClick });

    container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot")?.click();

    expect(onNodeClick).toHaveBeenCalledWith(nodes[0]);
  });

  it("applies the configured node gap to the orbital rail", () => {
    const container = document.createElement("div");

    renderNodeList(container, nodes, { dotGap: 42 });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const indicator = container.querySelector<HTMLElement>(".ai-chat-helper-node-indicator");
    expect(container.style.getPropertyValue("--ai-chat-helper-dot-gap")).toBe("42px");
    expect(container.style.height).toBe("142px");
    expect(buttons[0].style.top).toBe("29px");
    expect(buttons[1].style.top).toBe("71px");
    expect(buttons[2].style.top).toBe("113px");
    expect(indicator?.hidden).toBe(true);
  });

  it("caps the rail viewport height by the configured visible limit while keeping all node positions", () => {
    const container = document.createElement("div");
    const moreNodes: ConversationNode[] = [
      ...nodes,
      { id: "4", index: 3, title: "fourth", text: "fourth body", role: "user" },
      { id: "5", index: 4, title: "fifth", text: "fifth body", role: "assistant" }
    ];

    renderNodeList(container, moreNodes, {
      dotGap: 42,
      visibleLimit: 3
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    expect(container.style.height).toBe("142px");
    expect(buttons).toHaveLength(5);
    expect(buttons[3].style.top).toBe("155px");
    expect(buttons[4].style.top).toBe("197px");
  });

  it("uses a separate rail scroll position to reveal the active node when it exceeds the visible limit", () => {
    const container = document.createElement("div");
    const moreNodes: ConversationNode[] = [
      ...nodes,
      { id: "4", index: 3, title: "fourth", text: "fourth body", role: "user" },
      { id: "5", index: 4, title: "fifth", text: "fifth body", role: "assistant" }
    ];

    renderNodeList(container, moreNodes, {
      dotGap: 42,
      visibleLimit: 3,
      activeNodeId: "5"
    });

    expect(container.style.height).toBe("142px");
    expect(container.scrollTop).toBeGreaterThan(0);
    expect(container.querySelector<HTMLElement>(".ai-chat-helper-node-indicator")?.style.getPropertyValue("--ai-chat-helper-node-indicator-y")).toBe("186px");
  });

  it("centers a single node in the orbital rail", () => {
    const container = document.createElement("div");

    renderNodeList(container, [nodes[0]], { dotGap: 42 });

    const button = container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot");
    expect(container.style.height).toBe("96px");
    expect(button?.style.top).toBe("48px");
  });

  it("hides the rail entirely when there are no nodes", () => {
    const container = document.createElement("div");

    renderNodeList(container, []);

    expect(container.querySelector(".ai-chat-helper-empty")).toBeFalsy();
    expect(container.querySelector(".ai-chat-helper-orbital__track")).toBeFalsy();
    expect(container.textContent).not.toContain("No nodes found");
    expect(container.hidden).toBe(true);
  });

  it("shows a userscript-style information card when hovering a node dot", () => {
    const container = document.createElement("div");
    const longText = `${"A".repeat(151)} tail text`;

    renderNodeList(container, [
      { id: "1", index: 0, title: "Plan Alpha", text: longText, role: "user" }
    ]);

    const button = container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot")!;
    button.getBoundingClientRect = () => ({
      top: 120,
      left: 1180,
      right: 1191,
      bottom: 131,
      width: 11,
      height: 11,
      x: 1180,
      y: 120,
      toJSON: () => ({})
    });

    button.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent).toBe(`${"A".repeat(150)}...`);
    expect(tooltip?.dataset.side).toBe("right");
    expect(tooltip?.classList.contains("is-visible")).toBe(true);
    expect(tooltip?.getAttribute("aria-hidden")).toBe("false");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip?.id);
  });

  it("renders image attachments inside the node information card", () => {
    const container = document.createElement("div");

    renderNodeList(container, [{
      id: "image-node",
      index: 0,
      title: "请参考这张图",
      text: "请参考这张图\n\n[附件1: photo.png]",
      role: "user",
      attachments: [{
        id: "photo",
        fileName: "photo.png",
        mimeType: "image/png",
        url: "https://assets.example.com/photo.png"
      }]
    } as ConversationNode]);

    const button = container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot")!;
    button.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip?.innerHTML).toContain('<img src="https://assets.example.com/photo.png"');
    expect(tooltip?.textContent).toContain("请参考这张图");
    expect(tooltip?.textContent).not.toContain("[附件1: photo.png]");
  });

  it("hides the node information card when the dot is no longer hovered", () => {
    const container = document.createElement("div");

    renderNodeList(container, [
      { id: "1", index: 0, title: "Plan Alpha", text: "Plan Alpha full prompt body", role: "user" }
    ]);

    const button = container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot")!;
    button.getBoundingClientRect = () => ({
      top: 120,
      left: 80,
      right: 91,
      bottom: 131,
      width: 11,
      height: 11,
      x: 80,
      y: 120,
      toJSON: () => ({})
    });

    button.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip?.classList.contains("is-visible")).toBe(false);
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("hides a visible node information card when the rail re-renders", () => {
    const container = document.createElement("div");

    renderNodeList(container, [
      { id: "1", index: 0, title: "Plan Alpha", text: "Plan Alpha full prompt body", role: "user" }
    ]);

    const button = container.querySelector<HTMLButtonElement>(".ai-chat-helper-node-dot")!;
    button.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const tooltip = document.querySelector<HTMLElement>(".ai-chat-helper-node-tooltip");
    expect(tooltip?.classList.contains("is-visible")).toBe(true);

    renderNodeList(container, []);

    expect(tooltip?.classList.contains("is-visible")).toBe(false);
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  });
});
