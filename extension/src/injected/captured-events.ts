import type { CapturedNetworkEvent } from "../shared/types";

type CapturedEventPatch = Omit<CapturedNetworkEvent, "id" | "kind" | "createdAt">;

export function createCapturedNetworkEventFactory(now: () => number = () => Date.now()) {
  const nextIds = new Map<CapturedNetworkEvent["kind"], number>();

  return function createCapturedNetworkEvent(
    kind: CapturedNetworkEvent["kind"],
    patch: CapturedEventPatch
  ): CapturedNetworkEvent {
    const nextId = nextIds.get(kind) || 1;
    nextIds.set(kind, nextId + 1);

    return {
      id: `${kind}-${nextId}`,
      kind,
      ...patch,
      createdAt: now()
    };
  };
}
