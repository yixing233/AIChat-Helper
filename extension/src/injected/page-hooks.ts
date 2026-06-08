const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";

window.postMessage(
  {
    source: INJECTED_MESSAGE_SOURCE,
    type: "injected-ready",
    payload: { href: window.location.href }
  },
  window.location.origin
);
