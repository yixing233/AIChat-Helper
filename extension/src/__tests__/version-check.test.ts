import { describe, expect, it } from "vitest";
import {
  compareVersionParts,
  getUpdateLogEntriesBetweenVersions,
  parseScriptVersionFromSource,
  summarizeVersionCheck
} from "../content/version-check";

describe("version-check", () => {
  it("parses the userscript metadata version", () => {
    expect(parseScriptVersionFromSource("// @name AI\n// @version      3.1.4\n")).toBe("3.1.4");
  });

  it("compares dotted version parts like the userscript", () => {
    expect(compareVersionParts("3.0.10", "3.0.2")).toBe(1);
    expect(compareVersionParts("3.0", "3.0.0")).toBe(0);
    expect(compareVersionParts("2.9.9", "3.0.0")).toBe(-1);
  });

  it("summarizes newer and current versions", () => {
    expect(summarizeVersionCheck("3.0.0", "3.1.0")).toEqual({
      hasUpdate: true,
      currentVersion: "3.0.0",
      latestVersion: "3.1.0"
    });
    expect(summarizeVersionCheck("3.0.0", "3.0.0")).toEqual({
      hasUpdate: false,
      currentVersion: "3.0.0",
      latestVersion: "3.0.0"
    });
  });

  it("filters changelog entries newer than current through latest", () => {
    const entries = getUpdateLogEntriesBetweenVersions({
      versions: [
        { version: "3.2.0", changes: ["future"] },
        { version: "3.1.0", changes: ["new"] },
        { version: "3.0.1", changes: ["patch"] },
        { version: "3.0.0", changes: ["current"] }
      ]
    }, "3.0.0", "3.1.0");

    expect(entries.map((entry) => entry.version)).toEqual(["3.1.0", "3.0.1"]);
  });
});
