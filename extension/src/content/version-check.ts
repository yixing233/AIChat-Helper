export interface ChangelogEntry {
  version?: string;
  date?: string;
  changes?: string[];
}

export interface ChangelogPayload {
  versions?: ChangelogEntry[];
}

export interface VersionCheckSummary {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}

export function parseScriptVersionFromSource(text: string): string {
  const match = String(text || "").match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
  if (!match?.[1]) throw new Error("Remote version metadata was not found");
  return match[1].trim();
}

export function compareVersionParts(a: string, b: string): number {
  const pa = String(a || "").split(".").map((item) => parseInt(item, 10) || 0);
  const pb = String(b || "").split(".").map((item) => parseInt(item, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let index = 0; index < len; index += 1) {
    const va = pa[index] || 0;
    const vb = pb[index] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}

export function summarizeVersionCheck(currentVersion: string, latestVersion: string): VersionCheckSummary {
  const current = String(currentVersion || "").trim();
  const latest = String(latestVersion || "").trim();
  return {
    hasUpdate: compareVersionParts(latest, current) > 0,
    currentVersion: current,
    latestVersion: latest
  };
}

export function getUpdateLogEntriesBetweenVersions(
  changelog: ChangelogPayload,
  currentVersion: string,
  latestVersion: string
): ChangelogEntry[] {
  const versions = Array.isArray(changelog?.versions) ? changelog.versions : [];
  return versions
    .filter((entry) => {
      const version = String(entry?.version || "").trim();
      if (!version) return false;
      return compareVersionParts(version, currentVersion) > 0
        && compareVersionParts(version, latestVersion) <= 0;
    })
    .sort((a, b) => compareVersionParts(String(b?.version || ""), String(a?.version || "")));
}
