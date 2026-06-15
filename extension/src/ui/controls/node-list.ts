import type { ConversationNode } from "../../shared/types";
import { hideNodeTooltip, showNodeTooltip } from "./node-tooltip";
const TRACK_CAP_RADIUS = 15;
const TRACK_VERTICAL_PADDING = 16;
const ACTIVE_RING_SIZE = 22;

export interface NodeListOptions {
  readingLineOffset?: number;
  dotGap?: number;
  visibleLimit?: number;
  activeNodeId?: string;
  onNodeClick?: (node: ConversationNode) => void | Promise<void>;
}

export function getReadingLineScrollTop(
  element: Element,
  readingLineOffset: number,
  currentScrollY = window.scrollY || document.documentElement.scrollTop || 0,
  containerTop = 0
): number {
  return currentScrollY + element.getBoundingClientRect().top - containerTop - readingLineOffset;
}

export function scrollNodeIntoView(node: ConversationNode, readingLineOffset: number): boolean {
  if (!node.elementSelector) return false;
  const target = document.querySelector(node.elementSelector);
  if (!target) return false;
  const scrollContainer = findNearestScrollableAncestor(target);
  const isWindowScroller = !scrollContainer;
  const containerTop = isWindowScroller ? 0 : scrollContainer.getBoundingClientRect().top;
  const currentScrollTop = isWindowScroller
    ? window.scrollY || document.documentElement.scrollTop || 0
    : scrollContainer.scrollTop || 0;
  const top = getReadingLineScrollTop(target, readingLineOffset, currentScrollTop, containerTop);

  if (isWindowScroller) {
    window.scrollTo({ top, behavior: "smooth" });
  } else if (typeof scrollContainer.scrollTo === "function") {
    scrollContainer.scrollTo({ top, behavior: "smooth" });
  } else {
    scrollContainer.scrollTop = top;
  }
  return true;
}

export function renderNodeList(container: HTMLElement, nodes: ConversationNode[], options: NodeListOptions = {}): void {
  const dotGap = normalizeDotGap(options.dotGap);
  hideNodeTooltip();
  container.classList.add("ai-chat-helper-orbital__nodes");
  container.style.setProperty("--ai-chat-helper-dot-gap", `${dotGap}px`);

  if (nodes.length === 0) {
    container.replaceChildren();
    container.hidden = true;
    container.style.height = "0px";
    return;
  }

  container.hidden = false;
  const track = document.createElement("div");
  track.className = "ai-chat-helper-orbital__track";
  track.setAttribute("aria-hidden", "true");

  const visibleLimit = normalizeVisibleLimit(options.visibleLimit, nodes.length);
  const fullHeight = Math.max(96, getRailHeight(nodes.length, dotGap));
  const viewportHeight = Math.max(96, getRailHeight(visibleLimit, dotGap));
  const indicator = createNodeIndicator(nodes, dotGap, options.activeNodeId, fullHeight);
  container.style.height = `${viewportHeight}px`;
  container.replaceChildren(track, indicator, ...nodes.map((node, index) => createNodeButton(node, index, dotGap, options, fullHeight, nodes.length)));
  scrollActiveNodeIntoRailViewport(container, nodes, dotGap, options.activeNodeId, viewportHeight);
}

function createNodeIndicator(
  nodes: ConversationNode[],
  dotGap: number,
  activeNodeId: string | undefined,
  containerHeight: number
): HTMLSpanElement {
  const indicator = document.createElement("span");
  indicator.className = "ai-chat-helper-node-indicator";
  indicator.setAttribute("aria-hidden", "true");
  const activeIndex = activeNodeId ? nodes.findIndex((node) => node.id === activeNodeId) : -1;
  if (activeIndex < 0) {
    indicator.hidden = true;
    return indicator;
  }
  const activeTop = getNodeCenterTop(nodes.length, activeIndex, dotGap, containerHeight);
  indicator.style.setProperty("--ai-chat-helper-node-indicator-y", `${activeTop - ACTIVE_RING_SIZE / 2}px`);
  indicator.dataset.activeNodeId = activeNodeId || "";
  return indicator;
}

function createNodeButton(
  node: ConversationNode,
  index: number,
  dotGap: number,
  options: NodeListOptions,
  containerHeight: number,
  nodeCount: number
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ai-chat-helper-node ai-chat-helper-node-dot";
  const roleClass = normalizeNodeRoleClass(node.role);
  if (roleClass) button.classList.add(roleClass);
  if (options.activeNodeId === node.id) {
    button.classList.add("ai-chat-helper-node--active");
    button.setAttribute("aria-current", "true");
  }
  button.style.top = `${getNodeCenterTop(nodeCount, index, dotGap, containerHeight)}px`;
  button.setAttribute("aria-label", node.title);
  button.dataset.nodeTitle = node.title;
  button.textContent = "";
  button.addEventListener("mouseenter", () => showNodeTooltip(button, node));
  button.addEventListener("mouseleave", () => hideNodeTooltip(button));
  button.addEventListener("focus", () => showNodeTooltip(button, node));
  button.addEventListener("blur", () => hideNodeTooltip(button));
  button.addEventListener("click", () => {
    if (options.onNodeClick) {
      void Promise.resolve(options.onNodeClick(node)).catch((error) => {
        console.warn("[AI Chat Helper] node click handler failed", error);
      });
      return;
    }
    scrollNodeIntoView(node, options.readingLineOffset || 150);
  });
  return button;
}

function findNearestScrollableAncestor(element: Element): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableContainerElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isScrollableContainerElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = String(style.overflowY || "").toLowerCase();
  const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  return canScroll && (element.scrollHeight || 0) - (element.clientHeight || 0) > 16;
}

function normalizeNodeRoleClass(role: unknown): string {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "user" || normalized === "human") return "ai-chat-helper-node--user";
  if (normalized === "assistant" || normalized === "ai") return "ai-chat-helper-node--assistant";
  if (normalized === "system") return "ai-chat-helper-node--system";
  return "";
}

function normalizeDotGap(value: unknown): number {
  const parsed = Number(value ?? 36);
  if (!Number.isFinite(parsed)) return 36;
  return Math.max(20, Math.min(50, Math.round(parsed)));
}

function normalizeVisibleLimit(value: unknown, nodeCount: number): number {
  const parsed = Number(value ?? nodeCount);
  if (!Number.isFinite(parsed)) return nodeCount;
  return Math.max(1, Math.min(nodeCount, Math.round(parsed)));
}

function getRailHeight(nodeCount: number, dotGap: number): number {
  return (nodeCount - 1) * dotGap + TRACK_VERTICAL_PADDING * 2 + TRACK_CAP_RADIUS * 2;
}

function getNodeCenterTop(nodeCount: number, index: number, dotGap: number, containerHeight: number): number {
  return nodeCount === 1
    ? Math.round(containerHeight / 2)
    : TRACK_VERTICAL_PADDING + TRACK_CAP_RADIUS + index * dotGap;
}

function scrollActiveNodeIntoRailViewport(
  container: HTMLElement,
  nodes: ConversationNode[],
  dotGap: number,
  activeNodeId: string | undefined,
  viewportHeight: number
): void {
  const activeIndex = activeNodeId ? nodes.findIndex((node) => node.id === activeNodeId) : -1;
  if (activeIndex < 0 || nodes.length <= 1) return;

  const fullHeight = getRailHeight(nodes.length, dotGap);
  if (fullHeight <= viewportHeight) {
    container.scrollTop = 0;
    return;
  }

  const activeTop = getNodeCenterTop(nodes.length, activeIndex, dotGap, fullHeight);
  const targetScrollTop = activeTop - viewportHeight / 2;
  container.scrollTop = Math.max(0, Math.min(fullHeight - viewportHeight, Math.round(targetScrollTop)));
}

