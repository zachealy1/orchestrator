import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

type PhysicalDropPosition = {
  x: number;
  y: number;
};

type NativeDragDropPayload =
  | {
      type: "enter";
      paths: string[];
      position: PhysicalDropPosition;
    }
  | {
      type: "over";
      position: PhysicalDropPosition;
    }
  | {
      type: "drop";
      paths: string[];
      position: PhysicalDropPosition;
    }
  | {
      type: "leave";
    };

export type NativeContextFileDropEvent =
  | {
      type: "enter";
      paths: string[];
      clientX: number;
      clientY: number;
    }
  | {
      type: "over";
      clientX: number;
      clientY: number;
    }
  | {
      type: "drop";
      paths: string[];
      clientX: number;
      clientY: number;
    }
  | {
      type: "leave";
    };

export type NativeContextFileDropAdapter = {
  isAvailable: () => boolean;
  readScaleFactor: () => Promise<number>;
  onScaleFactorChange: (
    handler: (scaleFactor: number) => void,
  ) => Promise<() => void>;
  onDragDropEvent: (
    handler: (event: NativeDragDropPayload) => void,
  ) => Promise<() => void>;
};

const defaultAdapter: NativeContextFileDropAdapter = {
  isAvailable: isTauri,
  readScaleFactor: () => getCurrentWindow().scaleFactor(),
  onScaleFactorChange: (handler) =>
    getCurrentWindow().onScaleChanged(({ payload }) => {
      handler(payload.scaleFactor);
    }),
  onDragDropEvent: (handler) =>
    getCurrentWebview().onDragDropEvent(({ payload }) => {
      handler(payload);
    }),
};

export function physicalDropPositionToClient(
  position: PhysicalDropPosition,
  scaleFactor: number,
) {
  const scale =
    Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return {
    clientX: position.x / scale,
    clientY: position.y / scale,
  };
}

export async function registerNativeContextFileDrop(
  handler: (event: NativeContextFileDropEvent) => void,
  adapter: NativeContextFileDropAdapter = defaultAdapter,
) {
  if (!adapter.isAvailable()) {
    return () => undefined;
  }

  let scaleFactor = await adapter.readScaleFactor();
  const unlistenScale = await adapter.onScaleFactorChange((nextScaleFactor) => {
    scaleFactor = nextScaleFactor;
  });

  try {
    const unlistenDrop = await adapter.onDragDropEvent((event) => {
      if (event.type === "leave") {
        handler(event);
        return;
      }

      const position = physicalDropPositionToClient(
        event.position,
        scaleFactor,
      );
      if (event.type === "over") {
        handler({
          type: "over",
          ...position,
        });
        return;
      }

      handler({
        type: event.type,
        paths: event.paths,
        ...position,
      });
    });

    let listening = true;
    return () => {
      if (!listening) return;
      listening = false;
      unlistenDrop();
      unlistenScale();
    };
  } catch (error) {
    unlistenScale();
    throw error;
  }
}
