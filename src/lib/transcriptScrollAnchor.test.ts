import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
} from "./transcriptScrollAnchor";

function setReadonlyNumber(
  element: HTMLElement,
  property: "clientHeight" | "scrollHeight",
  read: () => number,
) {
  Object.defineProperty(element, property, {
    configurable: true,
    get: read,
  });
}

describe("transcript scroll anchoring", () => {
  let viewport: HTMLElement;
  let scroller: HTMLElement;
  let row: HTMLElement;
  let scrollHeight: number;
  let rowTop: number;

  beforeEach(() => {
    viewport = document.createElement("section");
    scroller = document.createElement("section");
    row = document.createElement("article");
    scroller.className = "task-chat-transcript native-transcript";
    row.dataset.transcriptEntryId = "turn-20";
    scroller.append(row);
    viewport.append(scroller);
    document.body.append(viewport);

    scrollHeight = 1_000;
    rowTop = 20;
    setReadonlyNumber(scroller, "clientHeight", () => 200);
    setReadonlyNumber(scroller, "scrollHeight", () => scrollHeight);
    scroller.getBoundingClientRect = () =>
      ({ top: 0, bottom: 200 } as DOMRect);
    row.getBoundingClientRect = () =>
      ({ top: rowTop, bottom: rowTop + 100 } as DOMRect);
    scroller.scrollTo = vi.fn(
      (optionsOrX?: ScrollToOptions | number, y?: number) => {
        scroller.scrollTop =
          typeof optionsOrX === "number"
            ? Number(y ?? 0)
            : Number(optionsOrX?.top ?? 0);
      },
    ) as HTMLElement["scrollTo"];
  });

  it("preserves the first visible turn and its pixel offset after a width reflow", () => {
    scroller.scrollTop = 300;
    const anchor = captureTranscriptViewportAnchor(viewport);

    rowTop = 50;
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(330);
  });

  it("stays at the bottom when the resized transcript remains in follow mode", () => {
    scroller.scrollTop = 800;
    const anchor = captureTranscriptViewportAnchor(viewport);

    scrollHeight = 1_200;
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(1_000);
  });

  it("does not misclassify an invalid position beyond the old bottom", () => {
    scroller.scrollTop = 900;
    const anchor = captureTranscriptViewportAnchor(viewport);

    scrollHeight = 1_200;
    rowTop = 40;
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(920);
  });
});
