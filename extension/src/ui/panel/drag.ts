export interface PanelPosition {
  right: number;
  top: number;
}

const MAX_PANEL_OFFSET = 1200;

export function attachPanelDrag(
  panel: HTMLElement,
  handle: HTMLElement,
  onSave: (position: PanelPosition) => void
): void {
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    last: PanelPosition;
  } | null = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      last: readPanelPosition(panel)
    };
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const left = dragState.startLeft + event.clientX - dragState.startX;
    const top = dragState.startTop + event.clientY - dragState.startY;
    const right = window.innerWidth - left - panel.offsetWidth;
    dragState.last = applyPanelPosition(panel, { right, top });
  });

  const finishDrag = (event: PointerEvent) => {
    if (!dragState) return;
    const position = dragState.last;
    handle.releasePointerCapture?.(dragState.pointerId);
    handle.classList.remove("is-dragging");
    dragState = null;
    onSave(position);
    event.preventDefault();
  };

  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

export function applyPanelPosition(panel: HTMLElement, position: PanelPosition): PanelPosition {
  const normalized = normalizePanelPosition(position);
  panel.style.right = `${normalized.right}px`;
  panel.style.top = `${normalized.top}px`;
  return normalized;
}

function readPanelPosition(panel: HTMLElement): PanelPosition {
  return normalizePanelPosition({
    right: parseFloat(panel.style.right || "16"),
    top: parseFloat(panel.style.top || "96")
  });
}

function normalizePanelPosition(position: PanelPosition): PanelPosition {
  return {
    right: clampOffset(position.right),
    top: clampOffset(position.top)
  };
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), MAX_PANEL_OFFSET));
}
