import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/content/styles.css"), "utf8");

describe("content styles", () => {
  it("uses light gray for the rail and inactive node dots", () => {
    expect(css).toContain("--ai-chat-helper-rail: #d1d5db;");
    expect(css).toContain("--ai-chat-helper-node-idle: #cbd5e1;");
    expect(css).toContain("background: var(--ai-chat-helper-rail);");
    expect(css).toContain("border: 1px solid var(--ai-chat-helper-node-idle);");
  });

  it("shows the reading-line baseline label only while adjusting", () => {
    expect(css).toMatch(/\.ai-chat-helper-reading-line\s*\{[^}]*opacity:\s*0;/s);
    expect(css).toMatch(/\.ai-chat-helper-reading-line\.is-adjusting\s*\{[^}]*opacity:\s*1;/s);
    expect(css).not.toMatch(/\.ai-chat-helper-reading-line::after/);
    expect(css).toMatch(/\.ai-chat-helper-reading-line\.is-adjusting::after/);
  });
});
