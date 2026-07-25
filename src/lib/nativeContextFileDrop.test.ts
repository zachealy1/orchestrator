import { describe, expect, it, vi } from "vitest";
import {
  physicalDropPositionToClient,
  registerNativeContextFileDrop,
  type NativeContextFileDropAdapter,
} from "./nativeContextFileDrop";

function createAdapter() {
  let scaleHandler: ((scaleFactor: number) => void) | null = null;
  let dropHandler:
    | ((event:
        | {
            type: "enter" | "drop";
            paths: string[];
            position: { x: number; y: number };
          }
        | {
            type: "over";
            position: { x: number; y: number };
          }
        | { type: "leave" }) => void)
    | null = null;
  const unlistenScale = vi.fn();
  const unlistenDrop = vi.fn();
  const adapter: NativeContextFileDropAdapter = {
    isAvailable: () => true,
    readScaleFactor: vi.fn(async () => 2),
    onScaleFactorChange: vi.fn(async (handler) => {
      scaleHandler = handler;
      return unlistenScale;
    }),
    onDragDropEvent: vi.fn(async (handler) => {
      dropHandler = handler;
      return unlistenDrop;
    }),
  };

  return {
    adapter,
    emitDrop: (event: Parameters<NonNullable<typeof dropHandler>>[0]) => {
      if (!dropHandler) throw new Error("Drop handler was not registered");
      dropHandler(event);
    },
    emitScale: (scaleFactor: number) => {
      if (!scaleHandler) throw new Error("Scale handler was not registered");
      scaleHandler(scaleFactor);
    },
    unlistenDrop,
    unlistenScale,
  };
}

describe("native context file drops", () => {
  it("converts physical coordinates with a safe scale factor", () => {
    expect(physicalDropPositionToClient({ x: 600, y: 300 }, 2)).toEqual({
      clientX: 300,
      clientY: 150,
    });
    expect(physicalDropPositionToClient({ x: 20, y: 10 }, 0)).toEqual({
      clientX: 20,
      clientY: 10,
    });
  });

  it("tracks display scale changes and unregisters both native listeners", async () => {
    const fixture = createAdapter();
    const handler = vi.fn();
    const unregister = await registerNativeContextFileDrop(
      handler,
      fixture.adapter,
    );

    fixture.emitDrop({
      type: "enter",
      paths: ["/Users/example/Desktop/readme.txt"],
      position: { x: 800, y: 400 },
    });
    expect(handler).toHaveBeenLastCalledWith({
      type: "enter",
      paths: ["/Users/example/Desktop/readme.txt"],
      clientX: 400,
      clientY: 200,
    });

    fixture.emitScale(1);
    fixture.emitDrop({
      type: "over",
      position: { x: 800, y: 400 },
    });
    expect(handler).toHaveBeenLastCalledWith({
      type: "over",
      clientX: 800,
      clientY: 400,
    });

    fixture.emitDrop({ type: "leave" });
    expect(handler).toHaveBeenLastCalledWith({ type: "leave" });

    unregister();
    unregister();
    expect(fixture.unlistenDrop).toHaveBeenCalledOnce();
    expect(fixture.unlistenScale).toHaveBeenCalledOnce();
  });

  it("does not register native listeners outside Tauri", async () => {
    const adapter = createAdapter().adapter;
    adapter.isAvailable = () => false;
    const handler = vi.fn();

    const unregister = await registerNativeContextFileDrop(handler, adapter);
    unregister();

    expect(adapter.readScaleFactor).not.toHaveBeenCalled();
    expect(adapter.onDragDropEvent).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
