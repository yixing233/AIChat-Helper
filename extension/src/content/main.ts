import { exporters, type ExportFormat } from "../exporters";
import { isInjectedMessage } from "../messaging/bridge";
import { sendBackgroundRequest } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { createCapturedEventBuffer } from "./captured-event-buffer";
import { createConversationSnapshot } from "./conversation-snapshot";
import { renderNodeList } from "../ui/controls/node-list";
import { openExportModal } from "../ui/modals/export-modal";
import { createPanel } from "../ui/panel/panel";

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

  const panel = createPanel({ platformName: adapter.name });
  document.body.appendChild(panel);

  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  const refreshNodes = () => {
    if (nodesContainer) renderNodeList(nodesContainer, adapter.scanDomNodes(document));
  };

  refreshNodes();
  panel.querySelector("[data-ai-chat-helper-refresh]")?.addEventListener("click", refreshNodes);
  panel.querySelector("[data-ai-chat-helper-export]")?.addEventListener("click", () => {
    openExportModal((format) => {
      void exportCurrentConversation(format);
    });
  });
}

async function exportCurrentConversation(format: ExportFormat): Promise<void> {
  if (!adapter) return;
  const snapshot = await createConversationSnapshot(adapter, capturedEvents.snapshot(), document);
  const files = await exporters[format].export(snapshot);

  for (const file of files) {
    await sendBackgroundRequest({
      type: "download-file",
      payload: {
        ...file,
        fileName: file.path
      }
    });
  }
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
