import type { ConversationNode, NodeJumpContext } from "../../shared/types";

type ScrollTarget = HTMLElement;

export interface NodeJumpCandidate {
  row: HTMLElement;
  element: HTMLElement;
  id: string;
  text: string;
}

export interface VirtualizedNodeJumpOptions {
  rowSelectors: string[];
  scrollContainerSelectors?: string[];
  minScore?: number;
  maxSearchAttempts?: number;
  waitAfterScrollMs?: number;
  alignRatio?: number;
  acceptRow?: (row: HTMLElement) => boolean;
  getCandidateElement?: (row: HTMLElement) => HTMLElement | null;
  getCandidateId?: (row: HTMLElement) => string;
  getCandidateText?: (row: HTMLElement, element: HTMLElement) => string;
  normalizeId?: (value: string) => string;
  normalizeText?: (value: string) => string;
}

const DEFAULT_SCROLL_CONTAINER_SELECTORS = [
  "[data-ai-chat-helper-scroll-container]",
  "[data-testid=\"message-list\"]",
  "[data-target-id=\"message-box-target-id\"]",
  ".ds-virtual-list",
  ".ds-virtual-list-visible-items",
  "main",
  "[role=\"main\"]"
];

export async function jumpToVirtualizedNode(
  node: ConversationNode,
  context: NodeJumpContext,
  options: VirtualizedNodeJumpOptions
): Promise<boolean> {
  const root = context.root || document;
  const targetIndex = getNodeIndex(node, context.nodes, options);
  let target = findVirtualizedNodeElement(node, context, options);

  if (!target) {
    const scrollTarget = findSearchScrollTarget(root, options);
    const direction = getSearchDirection(targetIndex, context, options);
    const step = getScrollStep(scrollTarget);
    const attempts = Math.max(1, options.maxSearchAttempts ?? 64);
    const waitMs = Math.max(0, options.waitAfterScrollMs ?? 80);

    for (let index = 0; index < attempts && !target; index += 1) {
      scrollByAmount(scrollTarget, direction * step);
      target = findVirtualizedNodeElement(node, context, options);
      if (target) break;
      if (waitMs > 0) await wait(waitMs);
      target = findVirtualizedNodeElement(node, context, options);
    }
  }

  if (!target || !target.isConnected) return false;

  target.scrollIntoView?.({ behavior: "smooth", block: "center" });
  await alignElementToReadingLine(target, context.readingLineOffset, options);
  markJumpTarget(target);
  return true;
}

export function findVirtualizedNodeElement(
  node: ConversationNode,
  context: NodeJumpContext,
  options: VirtualizedNodeJumpOptions
): HTMLElement | null {
  const fromSelector = findElementFromNodeSelector(node, context, options);
  if (fromSelector) return fromSelector;

  const candidates = collectNodeCandidates(context.root || document, options);
  const minScore = options.minScore ?? 8;
  let bestElement: HTMLElement | null = null;
  let bestScore = -Infinity;

  candidates.forEach((candidate) => {
    const score = scoreCandidate(node, candidate, options);
    if (score > bestScore) {
      bestScore = score;
      bestElement = candidate.element;
    }
  });

  return bestScore >= minScore ? bestElement : null;
}

export function collectNodeCandidates(root: ParentNode, options: VirtualizedNodeJumpOptions): NodeJumpCandidate[] {
  const seen = new Set<HTMLElement>();
  const out: NodeJumpCandidate[] = [];

  options.rowSelectors.forEach((selector) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((row) => {
      if (!(row instanceof HTMLElement) || seen.has(row)) return;
      seen.add(row);
      if (options.acceptRow && !options.acceptRow(row)) return;

      const element = options.getCandidateElement?.(row) || row;
      if (!(element instanceof HTMLElement)) return;
      const text = normalizeText(options, options.getCandidateText?.(row, element) || getElementText(element) || getElementText(row));
      if (!text) return;

      out.push({
        row,
        element,
        id: normalizeId(options, options.getCandidateId?.(row) || getDefaultElementId(row, element)),
        text
      });
    });
  });

  return out;
}

export function getNodeIndex(
  node: ConversationNode,
  nodes: ConversationNode[],
  options: VirtualizedNodeJumpOptions
): number {
  const targetIds = getNodeIds(node, options);
  const exactIdIndex = nodes.findIndex((item) => {
    const itemIds = getNodeIds(item, options);
    return itemIds.some((id) => targetIds.includes(id));
  });
  if (exactIdIndex >= 0) return exactIdIndex;

  const sessionIndex = Number(node.sessionIndex);
  if (Number.isInteger(sessionIndex) && sessionIndex >= 0 && sessionIndex < nodes.length) return sessionIndex;

  const targetText = normalizeText(options, node.text || node.title || "");
  if (!targetText) return -1;

  let bestIndex = -1;
  let bestScore = -Infinity;
  nodes.forEach((item, index) => {
    const candidate: NodeJumpCandidate = {
      row: document.body,
      element: document.body,
      id: "",
      text: normalizeText(options, item.text || item.title || "")
    };
    const score = scoreText(targetText, candidate.text);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 8 ? bestIndex : -1;
}

function findElementFromNodeSelector(
  node: ConversationNode,
  context: NodeJumpContext,
  options: VirtualizedNodeJumpOptions
): HTMLElement | null {
  if (!node.elementSelector) return null;

  try {
    const element = (context.root || document).querySelector<HTMLElement>(node.elementSelector);
    if (!element || !element.isConnected) return null;
    const candidateText = normalizeText(options, getElementText(element));
    const targetText = normalizeText(options, node.text || node.title || "");
    if (!targetText || scoreText(targetText, candidateText) >= 8) return element;
  } catch {
    return null;
  }

  return null;
}

function getSearchDirection(
  targetIndex: number,
  context: NodeJumpContext,
  options: VirtualizedNodeJumpOptions
): 1 | -1 {
  if (targetIndex >= 0) {
    const bounds = getVisibleNodeIndexBounds(context, options);
    if (bounds.min >= 0 && targetIndex < bounds.min) return -1;
    if (bounds.max >= 0 && targetIndex > bounds.max) return 1;
  }

  const activeIndex = context.activeNodeId
    ? context.nodes.findIndex((node) => String(node.id) === String(context.activeNodeId))
    : -1;
  if (targetIndex >= 0 && activeIndex >= 0) return targetIndex >= activeIndex ? 1 : -1;
  return 1;
}

function getVisibleNodeIndexBounds(
  context: NodeJumpContext,
  options: VirtualizedNodeJumpOptions
): { min: number; max: number } {
  const indices = collectNodeCandidates(context.root || document, options)
    .map((candidate) => getCandidateNodeIndex(candidate, context.nodes, options))
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (!indices.length) return { min: -1, max: -1 };
  return { min: Math.min(...indices), max: Math.max(...indices) };
}

function getCandidateNodeIndex(
  candidate: NodeJumpCandidate,
  nodes: ConversationNode[],
  options: VirtualizedNodeJumpOptions
): number {
  let bestIndex = -1;
  let bestScore = -Infinity;

  nodes.forEach((node, index) => {
    const idScore = getNodeIds(node, options).some((id) => id && candidate.id && (id === candidate.id || id.includes(candidate.id) || candidate.id.includes(id)))
      ? 80
      : 0;
    const textScore = scoreText(normalizeText(options, node.text || node.title || ""), candidate.text);
    const score = idScore + textScore;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 8 ? bestIndex : -1;
}

function scoreCandidate(
  node: ConversationNode,
  candidate: NodeJumpCandidate,
  options: VirtualizedNodeJumpOptions
): number {
  let score = 0;
  const ids = getNodeIds(node, options);
  const candidateId = candidate.id;

  if (candidateId && ids.includes(candidateId)) {
    score += 80;
  } else if (candidateId && ids.some((id) => id && (id.includes(candidateId) || candidateId.includes(id)))) {
    score += 36;
  }

  score += scoreText(normalizeText(options, node.text || node.title || ""), candidate.text);
  return score;
}

function scoreText(targetText: string, candidateText: string): number {
  if (!targetText || !candidateText) return 0;
  if (targetText === candidateText) return 60;

  let score = 0;
  const prefix = targetText.slice(0, Math.min(48, targetText.length));
  const candidatePrefix = candidateText.slice(0, Math.min(48, candidateText.length));
  const middle = targetText.slice(
    Math.max(0, Math.floor(targetText.length / 2) - 20),
    Math.floor(targetText.length / 2) + 20
  );

  if (prefix && candidateText.includes(prefix)) score += 24;
  if (candidatePrefix && targetText.includes(candidatePrefix)) score += 18;
  if (middle && candidateText.includes(middle)) score += 10;
  if (targetText.length <= 24 && candidateText === targetText) score += 12;
  return score;
}

function getNodeIds(node: ConversationNode, options: VirtualizedNodeJumpOptions): string[] {
  const seen = new Set<string>();
  [node.sourceMessageId, node.id].forEach((value) => {
    const normalized = normalizeId(options, value || "");
    if (normalized) seen.add(normalized);
  });
  return Array.from(seen);
}

function findSearchScrollTarget(root: ParentNode, options: VirtualizedNodeJumpOptions): ScrollTarget {
  const candidates = collectNodeCandidates(root, options);
  for (const candidate of candidates) {
    const ancestor = findNearestScrollableAncestor(candidate.element);
    if (ancestor) return ancestor;
  }

  const selectors = [...(options.scrollContainerSelectors || []), ...DEFAULT_SCROLL_CONTAINER_SELECTORS];
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element && isScrollableContainerElement(element)) return element;
  }

  const scrollables = Array.from(root.querySelectorAll<HTMLElement>("main, section, div, article"))
    .filter(isScrollableContainerElement)
    .sort((a, b) => getScrollableDistance(b) - getScrollableDistance(a));
  return scrollables[0] || getDocumentScrollElement();
}

async function alignElementToReadingLine(
  element: HTMLElement,
  readingLineOffset: number,
  options: VirtualizedNodeJumpOptions
): Promise<void> {
  const scrollTarget = findNearestScrollableAncestor(element) || getDocumentScrollElement();
  const ratio = options.alignRatio ?? 0.25;

  for (let index = 0; index < 6; index += 1) {
    const rect = element.getBoundingClientRect();
    const anchorOffset = Math.min(Math.max(rect.height * ratio, 8), 80);
    const targetY = rect.top + anchorOffset;
    const readingY = getReadingAnchorY(scrollTarget, readingLineOffset);
    const delta = targetY - readingY;
    if (Math.abs(delta) <= 8) return;
    scrollByAmount(scrollTarget, delta);
    if (index < 2) await wait(30);
  }
}

function getReadingAnchorY(scrollTarget: ScrollTarget, readingLineOffset: number): number {
  const raw = Math.max(10, Math.min(500, Number(readingLineOffset) || 150));
  if (scrollTarget === document.documentElement || scrollTarget === document.body || scrollTarget === document.scrollingElement) {
    return Math.max(10, Math.min((window.innerHeight || document.documentElement.clientHeight || 0) - 10, raw));
  }
  const rect = scrollTarget.getBoundingClientRect();
  return Math.max(rect.top + 10, Math.min(rect.bottom - 10, rect.top + raw));
}

function getScrollStep(scrollTarget: ScrollTarget): number {
  const height = scrollTarget.clientHeight || window.innerHeight || document.documentElement.clientHeight || 700;
  return Math.max(220, Math.round(height * 0.72));
}

function scrollByAmount(scrollTarget: ScrollTarget, delta: number): void {
  if (typeof scrollTarget.scrollBy === "function") {
    scrollTarget.scrollBy({ top: delta, behavior: "auto" });
    return;
  }
  scrollTarget.scrollTop += delta;
}

function findNearestScrollableAncestor(element: Element): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableContainerElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function getDocumentScrollElement(): HTMLElement {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function isScrollableContainerElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = String(style.overflowY || "").toLowerCase();
  const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  return canScroll && getScrollableDistance(element) > 16;
}

function getScrollableDistance(element: HTMLElement): number {
  return Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0));
}

function getDefaultElementId(row: HTMLElement, element: HTMLElement): string {
  return row.getAttribute("data-message-id")
    || row.getAttribute("data-msgid")
    || row.getAttribute("data-msg-id")
    || row.getAttribute("data-id")
    || row.getAttribute("data-virtual-list-item-key")
    || element.getAttribute("data-message-id")
    || element.id
    || row.id
    || "";
}

function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

function normalizeId(options: VirtualizedNodeJumpOptions, value: string): string {
  const normalized = options.normalizeId?.(value) ?? String(value || "").trim().toLowerCase();
  return String(normalized || "").trim().toLowerCase();
}

function normalizeText(options: VirtualizedNodeJumpOptions, value: string): string {
  const normalized = options.normalizeText?.(value) ?? String(value || "").replace(/\s+/g, " ").trim();
  return String(normalized || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function markJumpTarget(element: HTMLElement): void {
  element.classList.add("ai-chat-helper-jump-target");
  window.setTimeout(() => {
    element.classList.remove("ai-chat-helper-jump-target");
  }, 1200);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
