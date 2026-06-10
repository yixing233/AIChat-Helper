import { DEFAULT_EXTENSION_SETTINGS, normalizeExtensionSettings, type ExtensionSettings } from "../settings/extension-settings";
import { createExtensionStorage } from "../storage/extension-storage";
import { getPlatformAdapter } from "../platforms";
import type { PlatformId } from "../shared/types";
import { CONTENT_COMMAND_MESSAGE_TYPE, type ContentCommand } from "../messaging/protocol";
import { bindPopupActions, bindSettingsPopup, createSettingsPopup, type PopupAction } from "./settings-popup";

const settingsStorage = createExtensionStorage("settings");
const PROJECT_REPO_URL = "https://github.com/yixing233/AIChat-Helper";
const BACKUP_LIBRARY_PAGE = "backup/backup.html";

void bootPopup();

async function bootPopup(): Promise<void> {
  const host = document.getElementById("ai-chat-helper-popup-root");
  if (!host) return;

  try {
    const [settings, activeTab] = await Promise.all([
      loadSettings(),
      getActiveTabInfo()
    ]);
    const platform = getActivePlatform(activeTab.url);
    const popup = createSettingsPopup({
      settings,
      version: getExtensionVersion(),
      platformId: platform?.id || null,
      canExportCurrent: Boolean(platform),
      canBatchExport: Boolean(platform?.canBatchExport)
    });
    host.replaceChildren(popup);
    bindSettingsPopup(popup, settings, saveSettings);
    bindPopupActions(popup, (action) => handlePopupAction(action, activeTab.id));
  } catch (error) {
    host.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function loadSettings(): Promise<ExtensionSettings> {
  const values = await Promise.all(
    Object.entries(DEFAULT_EXTENSION_SETTINGS).map(async ([key, defaultValue]) => [
      key,
      await settingsStorage.get(key, defaultValue)
    ])
  );
  return normalizeExtensionSettings(Object.fromEntries(values));
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await Promise.all(
    Object.entries(settings).map(([key, value]) => settingsStorage.set(key, value))
  );
}

function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface ActiveTabInfo {
  id?: number;
  url?: string;
}

interface ActivePlatformInfo {
  id: PlatformId;
  canBatchExport: boolean;
}

async function getActiveTabInfo(): Promise<ActiveTabInfo> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      id: tabs[0]?.id,
      url: tabs[0]?.url
    };
  } catch {
    return {};
  }
}

function getActivePlatform(url: string | undefined): ActivePlatformInfo | null {
  if (!url) return null;
  try {
    const adapter = getPlatformAdapter(new URL(url));
    if (!adapter) return null;
    return {
      id: adapter.id,
      canBatchExport: Boolean(adapter.fetchConversationList && adapter.fetchConversationDetail)
    };
  } catch {
    return null;
  }
}

async function handlePopupAction(action: PopupAction, tabId: number | undefined): Promise<void> {
  if (action === "open-github") {
    await chrome.tabs.create({ url: PROJECT_REPO_URL });
    return;
  }
  if (action === "open-backups") {
    await chrome.tabs.create({ url: chrome.runtime.getURL(BACKUP_LIBRARY_PAGE) });
    return;
  }

  await sendContentCommand(tabId, action);
}

export async function sendContentCommand(tabId: number | undefined, command: ContentCommand): Promise<void> {
  if (typeof tabId !== "number") {
    return Promise.reject(new Error("当前标签页不可用"));
  }

  try {
    await sendContentCommandOnce(tabId, command);
  } catch (error) {
    if (!isMissingContentReceiverError(error)) throw error;
    await injectContentScript(tabId);
    await sendContentCommandOnce(tabId, command);
  }
}

function sendContentCommandOnce(tabId: number, command: ContentCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      type: CONTENT_COMMAND_MESSAGE_TYPE,
      command
    }, (response: { ok?: boolean; error?: string } | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "当前页面未加载扩展内容脚本"));
        return;
      }
      if (response?.ok === false) {
        reject(new Error(response.error || "操作失败"));
        return;
      }
      resolve();
    });
  });
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/styles.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/main.js"]
  });
}

function isMissingContentReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /receiving end does not exist|could not establish connection|当前页面未加载扩展内容脚本/i.test(message);
}
