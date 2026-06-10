import { describe, expect, it, vi } from "vitest";
import { attachPanelDrag, type PanelPosition } from "../ui/panel/drag";

describe("attachPanelDrag", () => {
  it("persists right and top offsets after dragging the panel rail", () => {
    const panel = document.createElement("aside");
    const handle = document.createElement("header");
    const saved: PanelPosition[] = [];

    document.body.appendChild(panel);
    panel.appendChild(handle);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 260 });
    panel.getBoundingClientRect = vi.fn(() => ({
      x: 724,
      y: 96,
      width: 260,
      height: 320,
      top: 96,
      right: 984,
      bottom: 416,
      left: 724,
      toJSON: () => ({})
    }));

    attachPanelDrag(panel, handle, (position) => saved.push(position));

    handle.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 800,
      clientY: 120,
      pointerId: 1
    } as MouseEventInit));
    expect(handle.classList.contains("is-dragging")).toBe(true);
    window.dispatchEvent(new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 760,
      clientY: 150
    }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(panel.style.right).toBe("56px");
    expect(panel.style.top).toBe("126px");
    expect(saved).toEqual([{ right: 56, top: 126 }]);
  });

  it("does not start panel dragging from interactive rail controls", () => {
    const panel = document.createElement("aside");
    const handle = document.createElement("nav");
    const button = document.createElement("button");
    const saved: PanelPosition[] = [];

    handle.appendChild(button);
    document.body.appendChild(panel);
    panel.appendChild(handle);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 260 });
    panel.getBoundingClientRect = vi.fn(() => ({
      x: 724,
      y: 96,
      width: 260,
      height: 320,
      top: 96,
      right: 984,
      bottom: 416,
      left: 724,
      toJSON: () => ({})
    }));

    attachPanelDrag(panel, handle, (position) => saved.push(position));

    button.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 800,
      clientY: 120,
      pointerId: 1
    } as MouseEventInit));
    window.dispatchEvent(new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 760,
      clientY: 150
    }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(panel.style.right).toBe("");
    expect(panel.style.top).toBe("");
    expect(saved).toEqual([]);
  });
});
