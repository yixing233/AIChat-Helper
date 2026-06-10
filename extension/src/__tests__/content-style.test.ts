import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/content/styles.css"), "utf8");

function getCssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`, "s"))?.[0] || "";
}

describe("content styles", () => {
  it("mirrors the backup-library rail and node colors", () => {
    expect(css).toContain("--ai-chat-helper-rail: #d8e2ef;");
    expect(css).toContain("--ai-chat-helper-node-idle: #0ea5e9;");
    expect(css).toContain("background: var(--ai-chat-helper-rail);");
    expect(css).toContain("background: var(--ai-chat-helper-node-idle);");
  });

  it("keeps the page rail visible on light chat backgrounds", () => {
    expect(css).toMatch(/--ai-chat-helper-rail-edge:\s*rgba\(37, 99, 235, 0\.24\);/);
    expect(css).toMatch(/\.ai-chat-helper-orbital > \.ai-chat-helper-orbital__track,\s*\.ai-chat-helper-orbital__nodes > \.ai-chat-helper-orbital__track\s*\{[\s\S]*width:\s*26px;[\s\S]*box-shadow:[\s\S]*var\(--ai-chat-helper-rail-edge\)/s);
  });

  it("styles the node hover information card like the userscript tooltip", () => {
    expect(css).toMatch(/\.ai-chat-helper-node-tooltip\s*\{[\s\S]*position:\s*fixed;[\s\S]*max-width:\s*280px;[\s\S]*pointer-events:\s*none;[\s\S]*-webkit-line-clamp:\s*4;/s);
    expect(css).toMatch(/\.ai-chat-helper-node-tooltip\.is-visible\s*\{[\s\S]*opacity:\s*1;/s);
  });

  it("shows the reading-line baseline label only while adjusting", () => {
    expect(css).toMatch(/\.ai-chat-helper-reading-line\s*\{[^}]*opacity:\s*0;/s);
    expect(css).toMatch(/\.ai-chat-helper-reading-line\.is-adjusting\s*\{[^}]*opacity:\s*1;/s);
    expect(css).not.toMatch(/\.ai-chat-helper-reading-line::after/);
    expect(css).toMatch(/\.ai-chat-helper-reading-line\.is-adjusting::after/);
  });

  it("keeps action and export buttons pointer-enabled with hover border highlights", () => {
    expect(css).toMatch(/\.ai-chat-helper-panel__actions button\s*\{[^}]*cursor:\s*pointer;/s);
    expect(css).toMatch(/\.ai-chat-helper-panel__actions button:hover[\s\S]*box-shadow:\s*inset 0 0 0 1px rgba\(37, 99, 235, 0\.2\);/s);
    expect(css).toMatch(/\.ai-chat-helper-export-modal__button[\s\S]*cursor:\s*pointer;/s);
    expect(css).toMatch(/\.ai-chat-helper-export-modal__button:hover[\s\S]*box-shadow:\s*inset 0 0 0 1px rgba\(37, 99, 235, 0\.26\);/s);
    expect(css).toMatch(/\.ai-chat-helper-export-modal__menu-item:hover[\s\S]*box-shadow:\s*inset 0 0 0 1px rgba\(37, 99, 235, 0\.28\);/s);
  });

  it("does not keep the removed inline panel status styles", () => {
    expect(css).not.toContain(".ai-chat-helper-panel__status");
  });

  it("includes the userscript-style toast surface and loading spinner", () => {
    expect(css).toMatch(/\.ai-chat-helper-toast\s*\{[\s\S]*position:\s*fixed;[\s\S]*left:\s*50%;[\s\S]*top:\s*24px;[\s\S]*backdrop-filter:\s*blur\(14px\) saturate\(1\.12\);/s);
    expect(css).toMatch(/\.ai-chat-helper-toast\.is-visible\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateX\(-50%\) translateY\(0\);/s);
    expect(css).toMatch(/\.ai-chat-helper-toast__spinner\s*\{[\s\S]*display:\s*none;[\s\S]*conic-gradient/s);
    expect(css).toMatch(/\.ai-chat-helper-toast\.is-loading \.ai-chat-helper-toast__spinner\s*\{[\s\S]*display:\s*block;/s);
    expect(css).toContain("@keyframes ai-chat-helper-toast-spin");
  });

  it("mirrors the backup-library node size and movable active ring", () => {
    expect(css).toMatch(/\.ai-chat-helper-node\s*\{[^}]*border:\s*2px solid #fff;/s);
    expect(css).toMatch(/\.ai-chat-helper-node-dot\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
    expect(css).toMatch(/\.ai-chat-helper-orbital > \.ai-chat-helper-orbital__track,\s*\.ai-chat-helper-orbital__nodes > \.ai-chat-helper-orbital__track\s*\{[\s\S]*width:\s*26px;/s);
    expect(css).toMatch(/\.ai-chat-helper-node-dot::after\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/\.ai-chat-helper-node-indicator\s*\{[^}]*left:\s*50%;[^}]*width:\s*22px;[^}]*height:\s*22px;[^}]*border:\s*3px solid #0ea5e9;[^}]*transform:\s*translateX\(-50%\) translateY\(var\(--ai-chat-helper-node-indicator-y,\s*0px\)\);/s);
    expect(css).toMatch(/\.ai-chat-helper-node--active\s*\{[^}]*box-shadow:\s*0 1px 3px rgb\(15 23 42 \/ 16%\);/s);
    expect(css).not.toMatch(/\.ai-chat-helper-node--active\s*\{[^}]*scale\(1\.6\)/s);
    expect(css).not.toContain("@keyframes ai-chat-helper-dot-active-ripple");
  });

  it("uses the orbital rail as the drag target instead of a separate grip", () => {
    const orbitalBlock = getCssBlock(".ai-chat-helper-orbital");
    const draggingBlock = getCssBlock(".ai-chat-helper-orbital.is-dragging");

    expect(css).not.toContain(".ai-chat-helper-nav-wrapper__grip");
    expect(orbitalBlock).toMatch(/cursor:\s*grab;/);
    expect(orbitalBlock).toMatch(/touch-action:\s*none;/);
    expect(draggingBlock).toMatch(/cursor:\s*grabbing;/);
    expect(draggingBlock).toMatch(/filter:\s*saturate\(1\.08\);/);
  });
});
