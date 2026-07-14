import { afterEach, describe, expect, it } from "vitest";
import {
  captureTranscriptViewportAnchor,
  findFirstVisibleTranscriptRow,
  restoreTranscriptViewportAnchor,
} from "./transcriptScrollAnchor";

function defineScrollGeometry(
  scroller: HTMLElement,
  geometry: { clientHeight: number; scrollHeight: number },
) {
  Object.defineProperty(scroller, "clientHeight", {
    configurable: true,
    get: () => geometry.clientHeight,
  });
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    get: () => geometry.scrollHeight,
  });
}

describe("transcript viewport anchors", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("preserves the first visible row and its viewport offset", () => {
    const scroller = document.createElement("section");
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.dataset.transcriptEntryId = "first";
    second.dataset.transcriptEntryId = "second";
    scroller.append(first, second);
    document.body.append(scroller);

    const geometry = { clientHeight: 200, scrollHeight: 1_200 };
    defineScrollGeometry(scroller, geometry);
    scroller.scrollTop = 300;
    scroller.getBoundingClientRect = () =>
      ({ top: 100, bottom: 300 } as DOMRect);
    first.getBoundingClientRect = () =>
      ({ top: 30, bottom: 90 } as DOMRect);
    let secondTop = 90;
    second.getBoundingClientRect = () =>
      ({ top: secondTop, bottom: secondTop + 80 } as DOMRect);

    const anchor = captureTranscriptViewportAnchor(scroller);
    expect(anchor).toMatchObject({ entryId: "second", offset: -10, atBottom: false });

    secondTop = 70;
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(280);
  });

  it("keeps a bottom-pinned transcript at the new bottom", () => {
    const scroller = document.createElement("section");
    document.body.append(scroller);
    const geometry = { clientHeight: 200, scrollHeight: 1_000 };
    defineScrollGeometry(scroller, geometry);
    scroller.scrollTop = 800;

    const anchor = captureTranscriptViewportAnchor(scroller);
    expect(anchor?.atBottom).toBe(true);

    geometry.scrollHeight = 1_250;
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(1_050);
  });

  it("does not alter a detached transcript", () => {
    const scroller = document.createElement("section");
    document.body.append(scroller);
    const geometry = { clientHeight: 200, scrollHeight: 1_000 };
    defineScrollGeometry(scroller, geometry);
    scroller.scrollTop = 400;

    const anchor = captureTranscriptViewportAnchor(scroller);
    scroller.remove();
    restoreTranscriptViewportAnchor(anchor);

    expect(scroller.scrollTop).toBe(400);
  });

  it("finds a visible anchor without measuring the full transcript", () => {
    let measurementCount = 0;
    const rows = Array.from({ length: 1_024 }, (_, index) => {
      const row = document.createElement("div");
      row.dataset.transcriptEntryId = `entry-${index}`;
      row.getBoundingClientRect = () => {
        measurementCount += 1;
        return {
          top: index * 20,
          bottom: (index + 1) * 20,
        } as DOMRect;
      };
      return row;
    });

    expect(findFirstVisibleTranscriptRow(rows, 10_000)?.dataset.transcriptEntryId).toBe(
      "entry-500",
    );
    expect(measurementCount).toBeLessThanOrEqual(11);
  });
});
