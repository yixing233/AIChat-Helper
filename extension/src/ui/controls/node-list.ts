import { getChatGPTImagePreviewModel } from "../../exporters/shared";
import type { ConversationNode } from "../../shared/types";
import { escapeHtml } from "../shared/escape-html";

const NODE_TOOLTIP_ID = "ai-chat-helper-node-tooltip";
const NODE_TOOLTIP_CLASS = "ai-chat-helper-node-tooltip";
const NODE_TOOLTIP_MAX_LENGTH = 150;
const TRACK_CAP_RADIUS = 13;
const TRACK_VERTICAL_PADDING = 16;
const ACTIVE_RING_SIZE = 22;

export interface NodeListOptions {
  readingLineOffset?: number;
  dotGap?: number;
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

  const railHeight = (nodes.length - 1) * dotGap + TRACK_VERTICAL_PADDING * 2;
  const containerHeight = Math.max(96, railHeight);
  const indicator = createNodeIndicator(nodes, dotGap, options.activeNodeId, containerHeight);
  container.style.height = `${containerHeight}px`;
  container.replaceChildren(track, indicator, ...nodes.map((node, index) => createNodeButton(node, index, dotGap, options, containerHeight, nodes.length)));
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
  const activeTop = nodes.length === 1 ? Math.round(containerHeight / 2) : TRACK_CAP_RADIUS + activeIndex * dotGap;
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
  button.style.top = `${nodeCount === 1 ? Math.round(containerHeight / 2) : TRACK_CAP_RADIUS + index * dotGap}px`;
  button.setAttribute("aria-label", node.title);
  button.title = node.title;
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

function showNodeTooltip(dot: HTMLElement, node: ConversationNode): void {
  const tooltipHtml = getNodeTooltipHtml(node);
  if (!tooltipHtml) return;

  const tooltip = getOrCreateNodeTooltip();
  tooltip.innerHTML = tooltipHtml;
  tooltip.setAttribute("aria-hidden", "false");
  dot.setAttribute("aria-describedby", tooltip.id);

  const dotRect = dot.getBoundingClientRect();
  const winWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const isOnRightHalf = dotRect.left > winWidth / 2;

  tooltip.classList.remove("is-visible");
  tooltip.style.transition = "none";
  tooltip.dataset.side = isOnRightHalf ? "right" : "left";
  tooltip.style.left = isOnRightHalf ? `${dotRect.left - 15}px` : `${dotRect.right + 15}px`;
  tooltip.style.top = `${dotRect.top + dotRect.height / 2}px`;
  tooltip.style.transform = isOnRightHalf
    ? "translate(calc(-100% + 10px), -50%) scale(0.95)"
    : "translate(-10px, -50%) scale(0.95)";

  void tooltip.offsetHeight;
  tooltip.style.transition = "";
  tooltip.classList.add("is-visible");
  tooltip.style.transform = isOnRightHalf
    ? "translate(-100%, -50%) scale(1)"
    : "translate(0, -50%) scale(1)";
  keepTooltipInViewport(tooltip);
}

function hideNodeTooltip(dot?: HTMLElement): void {
  dot?.removeAttribute("aria-describedby");

  const tooltip = document.getElementById(NODE_TOOLTIP_ID);
  if (!tooltip) return;

  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
  const side = tooltip.dataset.side || "left";
  tooltip.style.transform = side === "right"
    ? "translate(calc(-100% + 10px), -50%) scale(0.95)"
    : "translate(-10px, -50%) scale(0.95)";
}

function getOrCreateNodeTooltip(): HTMLElement {
  const existing = document.getElementById(NODE_TOOLTIP_ID);
  if (existing) return existing;

  const tooltip = document.createElement("div");
  tooltip.id = NODE_TOOLTIP_ID;
  tooltip.className = NODE_TOOLTIP_CLASS;
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);
  return tooltip;
}

function getNodeTooltipHtml(node: ConversationNode): string {
  const imagePreview = getChatGPTImagePreviewModel(node);
  if (imagePreview) {
    const text = imagePreview.text
      ? `<div class="ai-chat-helper-node-tooltip__text">${escapeHtml(truncateNodeTooltipText(imagePreview.text))}</div>`
      : "";
    return `<div class="ai-chat-helper-node-tooltip__media"><img src="${escapeHtml(imagePreview.url)}" alt="${escapeHtml(imagePreview.alt)}" loading="lazy"></div>${text}`;
  }

  const rawText = String(node.text || node.title || "").trim();
  if (!rawText) return "";
  return `<div class="ai-chat-helper-node-tooltip__text">${escapeHtml(truncateNodeTooltipText(rawText))}</div>`;
}

function truncateNodeTooltipText(value: string): string {
  const text = String(value || "").trim();
  return text.length > NODE_TOOLTIP_MAX_LENGTH
    ? `${text.slice(0, NODE_TOOLTIP_MAX_LENGTH)}...`
    : text;
}

function keepTooltipInViewport(tooltip: HTMLElement): void {
  const winHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!winHeight) return;

  const rect = tooltip.getBoundingClientRect();
  if (rect.bottom > winHeight - 10) {
    tooltip.style.top = `${winHeight - rect.height - 10 + rect.height / 2}px`;
  }
  if (rect.top < 10) {
    tooltip.style.top = `${10 + rect.height / 2}px`;
  }
}
