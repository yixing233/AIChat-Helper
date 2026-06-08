import { isInjectedMessage } from "../messaging/bridge";
import { detectPlatform } from "../shared/platform-detection";

function injectPageHooks(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/page-hooks.js");
  script.async = false;
  script.dataset.aiChatHelper = "page-hooks";
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

const platform = detectPlatform(new URL(window.location.href));

if (platform) {
  injectPageHooks();
  document.documentElement.dataset.aiChatHelperPlatform = platform.id;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isInjectedMessage(event.data)) return;
    console.debug("[AI Chat Helper] injected message", event.data.type);
  });
}
