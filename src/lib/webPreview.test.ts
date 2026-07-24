import { describe, expect, it } from "vitest";
import {
  commandOutputTail,
  extractLocalWebPreviewCandidates,
  normalizeLocalWebPreviewUrl,
  parsePersistedRunWebPreview,
  readWebPreviewCommandSignal,
  serializeRunWebPreview,
  type RunWebPreview,
} from "./webPreview";

describe("web preview detection", () => {
  it("detects ready URLs from common local development servers", () => {
    expect(
      extractLocalWebPreviewCandidates({
        command: "npm run dev",
        output: "\u001b[32m  Local:   http://localhost:5173/\u001b[0m\n",
      }),
    ).toEqual(["http://localhost:5173/"]);

    expect(
      extractLocalWebPreviewCandidates({
        command: "python3 -m http.server 8123",
        output: "Serving HTTP on :: port 8123 (http://[::]:8123/) ...\n",
      }),
    ).toEqual(["http://localhost:8123/"]);
  });

  it("derives candidates from known server commands", () => {
    expect(
      extractLocalWebPreviewCandidates({
        command: "vite --host 0.0.0.0 --port 4173",
        output: "",
      }),
    ).toEqual(["http://localhost:4173/"]);
    expect(
      extractLocalWebPreviewCandidates({
        command: "python3 -m http.server 9000",
        output: "",
      }),
    ).toEqual(["http://localhost:9000/"]);
  });

  it("recognizes URLs split across output chunks", () => {
    const first = commandOutputTail("", "  Local: http://local");
    const complete = commandOutputTail(first, "host:5173/\n");

    expect(
      extractLocalWebPreviewCandidates({
        command: "npm run dev",
        output: complete,
      }),
    ).toEqual(["http://localhost:5173/"]);
  });

  it("rejects failures, external hosts, credentials, and unsupported schemes", () => {
    expect(
      extractLocalWebPreviewCandidates({
        command: "npm run dev",
        output: "Error: failed to start at http://localhost:5173/\n",
      }),
    ).toEqual([]);
    expect(normalizeLocalWebPreviewUrl("https://example.com:3000/")).toBeNull();
    expect(
      normalizeLocalWebPreviewUrl("http://user:secret@localhost:3000/"),
    ).toBeNull();
    expect(normalizeLocalWebPreviewUrl("file:///tmp/index.html")).toBeNull();
  });

  it("normalizes wildcard and loopback URLs without retaining secrets", () => {
    expect(
      normalizeLocalWebPreviewUrl(
        "http://0.0.0.0:4173/game?token=secret#debug",
      ),
    ).toBe("http://localhost:4173/game");
    expect(normalizeLocalWebPreviewUrl("http://127.0.0.2:3000/")).toBe(
      "http://127.0.0.2:3000/",
    );
  });

  it("reads structured command execution signals only", () => {
    expect(
      readWebPreviewCommandSignal({
        method: "item/commandExecution/outputDelta",
        params: {
          itemId: "command-1",
          delta: "Local: http://localhost:5173/",
        },
      }),
    ).toEqual({
      commandId: "command-1",
      command: "",
      outputDelta: "Local: http://localhost:5173/",
      completed: false,
    });
    expect(
      readWebPreviewCommandSignal({
        method: "item/agentMessage/delta",
        params: { itemId: "message-1", delta: "http://localhost:5173/" },
      }),
    ).toBeNull();
  });

  it("round-trips persisted availability and accepts legacy records", () => {
    const preview: RunWebPreview = {
      version: 1,
      url: "http://localhost:5173/",
      origin: "http://localhost:5173",
      detectedAt: "2026-07-24T12:00:00.000Z",
      sourceCommandId: "command-1",
      availability: "unavailable",
    };
    expect(parsePersistedRunWebPreview(serializeRunWebPreview(preview))).toEqual(
      preview,
    );

    expect(
      parsePersistedRunWebPreview(
        JSON.stringify({
          version: 1,
          url: "http://localhost:3000/",
          origin: "http://localhost:3000",
          detectedAt: "2026-07-24T12:00:00.000Z",
          sourceCommandId: "legacy-command",
        }),
      )?.availability,
    ).toBe("unchecked");
  });
});
