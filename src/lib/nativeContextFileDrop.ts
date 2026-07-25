import { isTauri } from "@tauri-apps/api/core";
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
  coordinateSpace: "logical" | "physical";
  readScaleFactor: () => Promise<number>;
  onScaleFactorChange: (
    handler: (scaleFactor: number) => void,
  ) => Promise<() => void>;
  onDragDropEvent: (
    handler: (event: NativeDragDropPayload) => void,
  ) => Promise<() => void>;
};

function isMacOsWebView() {
  const platform = globalThis.navigator?.platform ?? "";
  const userAgent = globalThis.navigator?.userAgent ?? "";
  return /Mac/i.test(platform) || /Macintosh/i.test(userAgent);
}

const defaultAdapter: NativeContextFileDropAdapter = {
  isAvailable: isTauri,
  // Wry's macOS drag handler reports NSView coordinates in logical AppKit
  // points, despite Tauri exposing the payload as PhysicalPosition.
  coordinateSpace: isMacOsWebView() ? "logical" : "physical",
  readScaleFactor: () => getCurrentWindow().scaleFactor(),
  onScaleFactorChange: (handler) =>
    getCurrentWindow().onScaleChanged(({ payload }) => {
      handler(payload.scaleFactor);
    }),
  onDragDropEvent: (handler) =>
    getCurrentWindow().onDragDropEvent(({ payload }) => {
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

export function nativeDropPositionToClient(
  position: PhysicalDropPosition,
  scaleFactor: number,
  coordinateSpace: NativeContextFileDropAdapter["coordinateSpace"],
) {
  return coordinateSpace === "logical"
    ? {
        clientX: position.x,
        clientY: position.y,
      }
    : physicalDropPositionToClient(position, scaleFactor);
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

      const position = nativeDropPositionToClient(
        event.position,
        scaleFactor,
        adapter.coordinateSpace,
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
