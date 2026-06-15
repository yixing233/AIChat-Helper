import { getChatGPTImagePreviewModel } from "../../exporters/shared";
import type { ExportAttachment } from "../../shared/types";
import { escapeHtml } from "../shared/escape-html";

const NODE_TOOLTIP_ID = "ai-chat-helper-node-tooltip";
const NODE_TOOLTIP_CLASS = "ai-chat-helper-node-tooltip";
const NODE_TOOLTIP_MAX_LENGTH = 150;
const DEFAULT_TEXT_TOOLTIP_SELECTOR = "[data-ai-chat-helper-tooltip]";

export interface TooltipNodeLike {
  title?: string;
  text?: string;
  role?: string;
  attachments?: ExportAttachment[];
}

export function showNodeTooltip(anchor: HTMLElement, node: TooltipNodeLike): void {
  const tooltipHtml = getNodeTooltipHtml(node);
  if (!tooltipHtml) return;

  showTooltipHtml(anchor, tooltipHtml);
}

export function showTextTooltip(anchor: HTMLElement, text: string): void {
  const normalizedText = truncateNodeTooltipText(text);
  if (!normalizedText) return;

  showTooltipHtml(anchor, `<div class="ai-chat-helper-node-tooltip__text">${escapeHtml(normalizedText)}</div>`);
}

export function hideTooltip(anchor?: HTMLElement): void {
  anchor?.removeAttribute("aria-describedby");

  const tooltip = document.getElementById(NODE_TOOLTIP_ID);
  if (!tooltip) return;

  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
  const side = tooltip.dataset.side || "left";
  tooltip.style.transform = side === "right"
    ? "translate(calc(-100% + 10px), -50%) scale(0.95)"
    : "translate(-10px, -50%) scale(0.95)";
}

export function hideNodeTooltip(anchor?: HTMLElement): void {
  hideTooltip(anchor);
}

export function bindTextTooltipHandlers(root: ParentNode, selector = DEFAULT_TEXT_TOOLTIP_SELECTOR): void {
  root.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLElement>(selector);
    if (!anchor) return;
    const related = event instanceof MouseEvent ? event.relatedTarget : null;
    if (related instanceof Node && anchor.contains(related)) return;
    const text = getTooltipText(anchor);
    if (!text) return;
    showTextTooltip(anchor, text);
  });

  root.addEventListener("mouseout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLElement>(selector);
    if (!anchor) return;
    const related = event instanceof MouseEvent ? event.relatedTarget : null;
    if (related instanceof Node && anchor.contains(related)) return;
    hideTooltip(anchor);
  });

  root.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLElement>(selector);
    if (!anchor) return;
    const text = getTooltipText(anchor);
    if (!text) return;
    showTextTooltip(anchor, text);
  });

  root.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLElement>(selector);
    if (!anchor) return;
    hideTooltip(anchor);
  });
}

function showTooltipHtml(anchor: HTMLElement, tooltipHtml: string): void {
  const tooltip = getOrCreateNodeTooltip();
  tooltip.innerHTML = tooltipHtml;
  tooltip.setAttribute("aria-hidden", "false");
  anchor.setAttribute("aria-describedby", tooltip.id);

  const anchorRect = anchor.getBoundingClientRect();
  const winWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const isOnRightHalf = anchorRect.left > winWidth / 2;

  tooltip.classList.remove("is-visible");
  tooltip.style.transition = "none";
  tooltip.dataset.side = isOnRightHalf ? "right" : "left";
  tooltip.style.left = isOnRightHalf ? `${anchorRect.left - 15}px` : `${anchorRect.right + 15}px`;
  tooltip.style.top = `${anchorRect.top + anchorRect.height / 2}px`;
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

function getNodeTooltipHtml(node: TooltipNodeLike): string {
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

function getTooltipText(anchor: HTMLElement): string {
  return String(
    anchor.getAttribute("data-ai-chat-helper-tooltip")
    || anchor.getAttribute("aria-label")
    || ""
  ).trim();
}
