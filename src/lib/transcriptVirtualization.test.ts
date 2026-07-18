import { beforeEach, describe, expect, it } from "vitest";
import { emptyRunView } from "./codexEventReducer";
import {
  calculateTranscriptDefaultItemHeight,
  calculateTranscriptOverscanItemCount,
  cacheTranscriptRowHeight,
  clearTranscriptMeasurementCache,
  estimateTranscriptRowHeight,
  getCachedTranscriptRowHeight,
  getTranscriptWidthBucket,
  type TranscriptGeometryEntry,
} from "./transcriptVirtualization";

function geometryEntry(
  clientId = "entry-1",
  finalMessage = "Finished the task.",
): TranscriptGeometryEntry {
  return {
    clientId,
    prompt: "Update the application",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage,
    },
  };
}

describe("transcript virtualization geometry", () => {
  beforeEach(() => clearTranscriptMeasurementCache());

  it("groups nearby viewport widths into stable 32px buckets", () => {
    expect(getTranscriptWidthBucket(1_001)).toBe(992);
    expect(getTranscriptWidthBucket(1_007)).toBe(992);
    expect(getTranscriptWidthBucket(1_024)).toBe(1_024);
  });

  it("reuses exact measurements only for the same content revision", () => {
    const entry = geometryEntry();
    cacheTranscriptRowHeight(entry, 1_024, 417.2);

    expect(getCachedTranscriptRowHeight(entry, 1_024)).toBe(418);
    expect(
      getCachedTranscriptRowHeight(
        geometryEntry("entry-1", "A different completed response."),
        1_024,
      ),
    ).toBeUndefined();
    expect(
      getCachedTranscriptRowHeight(
        geometryEntry("entry-1", "Finished the work."),
        1_024,
      ),
    ).toBeUndefined();
  });

  it("isolates exact measurements by transcript scope", () => {
    const entry = geometryEntry();
    cacheTranscriptRowHeight(entry, 1_024, 417.2, "chat:one:v1");

    expect(
      getCachedTranscriptRowHeight(
        geometryEntry(),
        1_024,
        "chat:one:v1",
      ),
    ).toBe(418);
    expect(
      getCachedTranscriptRowHeight(entry, 1_024, "chat:two:v1"),
    ).toBeUndefined();
  });

  it("uses content and viewport width for unmeasured row estimates", () => {
    const entry = geometryEntry("entry-long", "Long output ".repeat(240));

    expect(estimateTranscriptRowHeight(entry, 480)).toBeGreaterThan(
      estimateTranscriptRowHeight(entry, 1_024),
    );
    expect(estimateTranscriptRowHeight(geometryEntry(), 1_024)).toBeGreaterThanOrEqual(
      180,
    );
  });

  it("calculates a content-aware default without letting one outlier dominate", () => {
    const entries = [
      ...Array.from({ length: 14 }, (_, index) =>
        geometryEntry(`short-${index}`, "A concise result."),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        geometryEntry(`long-${index}`, "Long output ".repeat(300)),
      ),
    ];

    const defaultHeight = calculateTranscriptDefaultItemHeight(entries, 800);

    expect(defaultHeight).toBeGreaterThanOrEqual(180);
    expect(defaultHeight).toBeLessThan(1_000);
    expect(calculateTranscriptDefaultItemHeight(entries, 480)).toBeGreaterThan(
      defaultHeight,
    );
  });

  it("keeps short rows buffered while bounding rich DOM for very tall rows", () => {
    expect(calculateTranscriptOverscanItemCount([180, 190, 200], 3_200, 8)).toBe(8);
    expect(
      calculateTranscriptOverscanItemCount([2_400, 2_800, 3_200], 3_200, 8),
    ).toBe(2);
  });

  it("evicts old measurements after the 4,000-entry LRU limit", () => {
    const oldest = geometryEntry("oldest");
    cacheTranscriptRowHeight(oldest, 1_024, 300);
    for (let index = 0; index < 4_000; index += 1) {
      cacheTranscriptRowHeight(geometryEntry(`entry-${index}`), 1_024, 300);
    }

    expect(getCachedTranscriptRowHeight(oldest, 1_024)).toBeUndefined();
  });
});
