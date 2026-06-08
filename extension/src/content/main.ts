import { isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { exportBatchSnapshots, exportSnapshot, type SnapshotExportFormat } from "../exporters/snapshot-export";
import { filterConversationNodes, renderNodeList } from "../ui/controls/node-list";
import { openExportModal } from "../ui/modals/export-modal";
import { createPanel, setPanelStatus } from "../ui/panel/panel";
import type { ConversationNode } from "../shared/types";

function injectPageHooks(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/page-hooks.js");
  script.async = false;
  script.dataset.aiChatHelper = "page-hooks";
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

const adapter = getPlatformAdapter(new URL(window.location.href));
const capturedEvents = createCapturedEventBuffer();

function mountPanel(): void {
  if (!adapter || document.getElementById("ai-chat-helper-panel")) return;

  const canBatchExport = Boolean(adapter.fetchConversationList && adapter.fetchConversationDetail);
  const panel = createPanel({ platformName: adapter.name, canBatchExport });
  document.body.appendChild(panel);

  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  const searchInput = panel.querySelector<HTMLInputElement>("[data-ai-chat-helper-search]");
  let currentNodes: ConversationNode[] = [];

  const renderCurrentNodes = () => {
    if (!nodesContainer) return;
    renderNodeList(nodesContainer, filterConversationNodes(currentNodes, searchInput?.value || ""));
  };

  const refreshNodes = () => {
    currentNodes = adapter.scanDomNodes(document);
    renderCurrentNodes();
  };

  refreshNodes();
  panel.querySelector("[data-ai-chat-helper-refresh]")?.addEventListener("click", refreshNodes);
  searchInput?.addEventListener("input", renderCurrentNodes);
  panel.querySelector("[data-ai-chat-helper-export]")?.addEventListener("click", () => {
    openExportModal((format) => {
      void exportCurrentConversation(format, panel);
    });
  });
  panel.querySelector("[data-ai-chat-helper-batch-export]")?.addEventListener("click", () => {
    openExportModal((format) => {
      void exportRecentConversations(format, panel);
    });
  });
}

async function exportCurrentConversation(format: SnapshotExportFormat, panel: HTMLElement): Promise<void> {
  if (!adapter) return;
  setPanelStatus(panel, "Exporting current conversation...");

  try {
    const snapshot = await createConversationSnapshot(adapter, capturedEvents.snapshot(), document);
    const files = await exportSnapshot(snapshot, format);

    for (const file of files) {
      await sendBackgroundRequest({
        type: "download-file",
        payload: {
          ...file,
          fileName: file.path
        }
      });
    }

    setPanelStatus(panel, "Current conversation export started.");
  } catch (error) {
    console.error("[AI Chat Helper] current export failed", error);
    setPanelStatus(panel, `Current export failed: ${getErrorMessage(error)}`);
  }
}

async function exportRecentConversations(format: SnapshotExportFormat, panel: HTMLElement): Promise<void> {
  if (!adapter?.fetchConversationList || !adapter.fetchConversationDetail) return;
  setPanelStatus(panel, "Fetching recent conversations...");

  try {
    const summaries = await adapter.fetchConversationList({ limit: 20 });
    const snapshots = [];

    for (const [index, summary] of summaries.entries()) {
      setPanelStatus(panel, `Exporting ${index + 1}/${summaries.length}: ${summary.title || summary.conversationId}`);
      snapshots.push(await adapter.fetchConversationDetail(summary.conversationId));
    }

    const files = await exportBatchSnapshots(snapshots, format);
    for (const file of files) {
      await sendBackgroundRequest({
        type: "download-file",
        payload: {
          ...file,
          fileName: file.path
        }
      });
    }

    setPanelStatus(panel, `Batch export started for ${snapshots.length} conversations.`);
  } catch (error) {
    console.error("[AI Chat Helper] batch export failed", error);
    setPanelStatus(panel, `Batch export failed: ${getErrorMessage(error)}`);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (adapter) {
  injectPageHooks();
  document.documentElement.dataset.aiChatHelperPlatform = adapter.id;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isInjectedMessage(event.data)) return;
    if (event.data.type === "captured-network-event") {
      capturedEvents.push(event.data.payload);
    }
    console.debug("[AI Chat Helper] injected message", event.data.type);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel, { once: true });
  } else {
    mountPanel();
  }
}
