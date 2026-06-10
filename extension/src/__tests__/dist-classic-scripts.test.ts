import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("classic extension script bundles", () => {
  it("does not emit ES module syntax for manifest content or injected scripts", () => {
    const contentScript = readFileSync(resolve(process.cwd(), "dist/content/main.js"), "utf8");
    const injectedScript = readFileSync(resolve(process.cwd(), "dist/injected/page-hooks.js"), "utf8");

    expect(contentScript).not.toMatch(/^\s*import\b/m);
    expect(contentScript).not.toMatch(/^\s*export\b/m);
    expect(injectedScript).not.toMatch(/^\s*import\b/m);
    expect(injectedScript).not.toMatch(/^\s*export\b/m);
  });
});
