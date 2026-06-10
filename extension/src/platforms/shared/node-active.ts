import type { ConversationNode, NodeActiveContext } from "../../shared/types";

export interface ViewportMetrics {
  viewportTop: number;
  viewportBottom: number;
  readingAnchor: number;
}

export interface FindNodeOptions {
  normalizeId?: (value: string) => string;
  normalizeText?: (value: string) => string;
  minTextScore?: number;
  sessionIndex?: number;
}

export function getActiveScrollContainer(
  context: NodeActiveContext,
  anchors: Array<HTMLElement | null | undefined> = [],
  selectors: string[] = []
): HTMLElement | null {
  if (context.scrollContainer instanceof HTMLElement && context.scrollContainer.isConnected) {
    return context.scrollContainer;
  }

  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLElement)) continue;
    const nearest = findNearestScrollableAncestor(anchor);
    if (nearest) return nearest;
  }

  const root = context.root || document;
  for (const selector of selectors) {
    const element = queryFirstElement(root, selector);
    if (element && isScrollableContainerElement(element)) return element;
    if (element) {
      const nearest = findNearestScrollableAncestor(element);
      if (nearest) return nearest;
    }
  }

  const scrollables = queryElements(root, "main, section, div, article")
    .filter(isScrollableContainerElement)
    .sort((a, b) => getScrollableDistance(b) - getScrollableDistance(a));
  return scrollables[0] || getDocumentScrollElement();
}

export function getViewportMetrics(context: NodeActiveContext, scrollContainer?: HTMLElement | null): ViewportMetrics {
  const raw = clampReadingLineOffset(context.readingLineOffset);
  if (scrollContainer && scrollContainer !== document.documentElement && scrollContainer !== document.body && scrollContainer !== document.scrollingElement) {
    const rect = scrollContainer.getBoundingClientRect();
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const bottom = Number.isFinite(rect.bottom) && rect.bottom > top
      ? rect.bottom
      : top + (scrollContainer.clientHeight || window.innerHeight || 0);
    return {
      viewportTop: top,
      viewportBottom: bottom,
      readingAnchor: Math.max(top + 10, Math.min(bottom - 10, top + raw))
    };
  }

  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  return {
    viewportTop: 0,
    viewportBottom: height,
    readingAnchor: Math.max(10, Math.min(Math.max(10, height - 10), raw))
  };
}

export function isScrollNearBottom(scrollContainer: HTMLElement | null | undefined, threshold = 140): boolean {
  if (!scrollContainer) return false;
  const remaining = Number(scrollContainer.scrollHeight || 0)
    - Math.max(0, Number(scrollContainer.scrollTop || 0))
    - Number(scrollContainer.clientHeight || 0);
  return remaining < threshold;
}

export function isElementVisibleInMetrics(element: HTMLElement, metrics: ViewportMetrics): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > metrics.viewportTop && rect.top < metrics.viewportBottom;
}

export function findNodeByIdText(
  nodes: ConversationNode[],
  id: string,
  text: string,
  options: FindNodeOptions = {}
): ConversationNode | null {
  const normalizeId = options.normalizeId || normalizeBasicId;
  const normalizeText = options.normalizeText || normalizeBasicText;
  const targetId = normalizeId(id);
  const targetText = normalizeText(text);

  if (targetId) {
    const byId = nodes.find((node) => {
      return getNodeIds(node, normalizeId).some((candidateId) => {
        return candidateId === targetId || candidateId.includes(targetId) || targetId.includes(candidateId);
      });
    });
    if (byId) return byId;
  }

  const sessionIndex = Number(options.sessionIndex);
  if (Number.isInteger(sessionIndex) && sessionIndex >= 0 && sessionIndex < nodes.length) {
    return nodes[sessionIndex] || null;
  }

  if (!targetText) return null;

  let bestNode: ConversationNode | null = null;
  let bestScore = -Infinity;
  nodes.forEach((node) => {
    const score = scoreTextMatch(targetText, normalizeText(node.text || node.title || ""));
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  });

  return bestScore >= (options.minTextScore ?? 8) ? bestNode : null;
}

export function scoreTextMatch(targetText: string, candidateText: string): number {
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
  if (targetText.length <= 24 && candidateText.includes(targetText)) score += 12;
  return score;
}

export function getOrderedNodes(nodes: ConversationNode[]): ConversationNode[] {
  return nodes.slice().sort((a, b) => {
    const ai = Number.isInteger(Number(a.sessionIndex)) ? Number(a.sessionIndex) : Number.MAX_SAFE_INTEGER;
    const bi = Number.isInteger(Number(b.sessionIndex)) ? Number(b.sessionIndex) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return (a.index || 0) - (b.index || 0);
  });
}

export function normalizeBasicText(value: string): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getElementText(element: HTMLElement): string {
  return String(element.innerText || element.textContent || "").trim();
}

export function queryElements(root: ParentNode, selector: string): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

export function findNearestScrollableAncestor(element: Element): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableContainerElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

export function isScrollableContainerElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = String(style.overflowY || "").toLowerCase();
  const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  return canScroll && getScrollableDistance(element) > 16;
}

export function getScrollableDistance(element: HTMLElement): number {
  return Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0));
}

export function clampReadingLineOffset(value: number): number {
  return Math.max(10, Math.min(500, Number(value) || 150));
}

function getNodeIds(node: ConversationNode, normalizeId: (value: string) => string): string[] {
  const seen = new Set<string>();
  [node.sourceMessageId, node.id].forEach((value) => {
    const normalized = normalizeId(value || "");
    if (normalized) seen.add(normalized);
  });
  return Array.from(seen);
}

function normalizeBasicId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function queryFirstElement(root: ParentNode, selector: string): HTMLElement | null {
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function getDocumentScrollElement(): HTMLElement | null {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}
