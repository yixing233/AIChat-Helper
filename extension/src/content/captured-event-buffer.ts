import type { CapturedNetworkEvent } from "../shared/types";

export interface CapturedEventBuffer {
  push(event: CapturedNetworkEvent): void;
  snapshot(): CapturedNetworkEvent[];
  clear(): void;
}

export function createCapturedEventBuffer(limit = 300): CapturedEventBuffer {
  const events: CapturedNetworkEvent[] = [];

  return {
    push(event) {
      events.push(event);
      if (events.length > limit) {
        events.splice(0, events.length - limit);
      }
    },
    snapshot() {
      return [...events];
    },
    clear() {
      events.length = 0;
    }
  };
}
