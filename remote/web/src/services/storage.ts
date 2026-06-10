export type RemoteConfig = {
  baseUrl: string;
  token: string;
};

export const remoteConfigStorageKey = "ai-chat-remote-config";

export function saveRemoteConfig(config: RemoteConfig) {
  localStorage.setItem(remoteConfigStorageKey, JSON.stringify(config));
}

export function loadRemoteConfig(): RemoteConfig | null {
  const rawConfig = localStorage.getItem(remoteConfigStorageKey);
  if (!rawConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawConfig) as Partial<RemoteConfig>;
    if (typeof parsed.baseUrl === "string" && typeof parsed.token === "string") {
      return {
        baseUrl: parsed.baseUrl,
        token: parsed.token,
      };
    }
  } catch {
    localStorage.removeItem(remoteConfigStorageKey);
  }

  return null;
}

export function requireRemoteConfig() {
  const config = loadRemoteConfig();
  if (!config) {
    throw new Error("Remote service is not configured");
  }

  return config;
}
