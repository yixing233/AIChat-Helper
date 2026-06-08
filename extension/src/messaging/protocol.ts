import type { CapturedNetworkEvent, ExportFile } from "../shared/types";

export const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";

export type InjectedToContentMessage =
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "injected-ready";
      payload: { href: string };
    }
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "captured-network-event";
      payload: CapturedNetworkEvent;
    };

export type BackgroundRequest =
  | {
      type: "http-request";
      payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
    }
  | {
      type: "download-file";
      payload: ExportFile & { fileName: string };
    }
  | {
      type: "get-version";
    };

export type BackgroundResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };
