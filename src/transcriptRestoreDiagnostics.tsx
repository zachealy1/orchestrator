import { useEffect, useMemo, useRef, useState } from "react";
import { emptyRunView } from "./lib/codexEventReducer";
import {
  VirtuosoTaskChatTranscript,
  type TranscriptViewportSnapshot,
  type VirtuosoTaskChatTranscriptHandle,
} from "./components/VirtuosoTaskChatTranscript";
import type { TaskChatEntry } from "./components/TaskChatTurn";
import { useAppServices } from "./runtime/AppServices";

const RESTORE_TURN_COUNT = 120;
const RESTORE_SAMPLE_FRAMES = 40;

type RestorePhase = "source" | "other" | "restored";

type VisibleAnchor = {
  entryId: string;
  offset: number;
};

type RestoreDiagnosticResult = {
  turns: number;
  sampledFrames: number;
  blankFrames: number;
  outgoingFramesBeforeSwap: number;
  unexpectedAnchorFrames: number;
  finalAnchorOffsetError: number | null;
  sourceAnchor: string | null;
  outgoingAnchor: string | null;
  restoredAnchor: string | null;
  firstFrames: Array<{
    anchor: string | null;
    layer: string | null;
    scrollTop: number | null;
  }>;
};

function nextFrame() {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

function makeEntry(index: number, prefix = "restore"): TaskChatEntry {
  const turn = index + 1;
  const paragraphCount = 1 + ((turn * 5) % 11);
  const prompt = Array.from(
    { length: 1 + (turn % 4) },
    () => `Restore diagnostic prompt ${turn}.`,
  ).join(" ");
  const html = Array.from(
    { length: paragraphCount },
    (_, paragraph) =>
      `<p>Turn ${turn}, paragraph ${paragraph + 1}. Variable content verifies that a saved middle-of-chat position restores without rendering another part of the conversation first.</p>`,
  ).join("");

  return {
    clientId: `${prefix}-turn-${turn}`,
    workspaceId: 1,
    chatId: 1,
    turnIndex: turn,
    runId: turn,
    taskId: turn,
    prompt,
    submittedAt: "2026-08-01T12:00:00.000Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage: html.replace(/<[^>]+>/g, " "),
    },
    preparedSummary: {
      kind: "html",
      html,
      sourceHash: `${prefix}-summary-${turn}`,
    },
  };
}

function findVisibleAnchor(scroller: HTMLElement): VisibleAnchor | null {
  const viewport = scroller.getBoundingClientRect();
  for (const row of scroller.querySelectorAll<HTMLElement>(
    "[data-transcript-entry-id]",
  )) {
    const bounds = row.getBoundingClientRect();
    if (bounds.bottom > viewport.top && bounds.top < viewport.bottom) {
      return {
        entryId: row.dataset.transcriptEntryId ?? "",
        offset: bounds.top - viewport.top,
      };
    }
  }
  return null;
}

function findDisplayedScroller() {
  return (
    document.querySelector<HTMLElement>(
      ".task-chat-transcript-layer.is-visible .task-chat-transcript.virtuoso-transcript",
    ) ??
    document.querySelector<HTMLElement>(
      ".task-chat-transcript.virtuoso-transcript",
    )
  );
}

function writeResult(result: RestoreDiagnosticResult) {
  const output = document.getElementById("transcript-restore-result");
  if (output) output.textContent = JSON.stringify(result, null, 2);
  document.title = "Transcript restore complete";
}

export default function TranscriptRestoreDiagnostics() {
  const { transcriptStates } = useAppServices();
  const [phase, setPhase] = useState<RestorePhase>("source");
  const phaseRef = useRef<RestorePhase>(phase);
  const transcriptRef = useRef<VirtuosoTaskChatTranscriptHandle | null>(null);
  const sourceSnapshotRef = useRef<TranscriptViewportSnapshot | null>(null);
  const generationRef = useRef(0);
  const entries = useMemo(
    () => Array.from({ length: RESTORE_TURN_COUNT }, (_, index) => makeEntry(index)),
    [],
  );
  const otherEntries = useMemo(
    () => Array.from({ length: 90 }, (_, index) => makeEntry(index, "other")),
    [],
  );

  phaseRef.current = phase;

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;

    void (async () => {
      transcriptStates.clear();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      let scroller = findDisplayedScroller();
      if (!scroller || cancelled || generationRef.current !== generation) return;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (scroller.scrollHeight > scroller.clientHeight * 2) break;
        await nextFrame();
      }
      const targetScrollTop = Math.round(
        Math.max(0, scroller.scrollHeight - scroller.clientHeight) * 0.42,
      );
      scroller.scrollTop = targetScrollTop;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      for (let frame = 0; frame < 12; frame += 1) await nextFrame();

      const sourceAnchor = findVisibleAnchor(scroller);
      transcriptRef.current?.captureViewportState();
      for (let attempt = 0; attempt < 8 && !sourceSnapshotRef.current; attempt += 1) {
        await nextFrame();
      }
      const sourceSnapshot = sourceSnapshotRef.current;
      if (!sourceSnapshot) return;

      setPhase("other");
      for (let frame = 0; frame < 12; frame += 1) await nextFrame();
      const outgoingScroller = findDisplayedScroller();
      const outgoingAnchor = outgoingScroller
        ? findVisibleAnchor(outgoingScroller)
        : null;
      setPhase("restored");

      let blankFrames = 0;
      let outgoingFramesBeforeSwap = 0;
      let unexpectedAnchorFrames = 0;
      let restoredAnchor: VisibleAnchor | null = null;
      const firstFrames: RestoreDiagnosticResult["firstFrames"] = [];
      for (let frame = 0; frame < RESTORE_SAMPLE_FRAMES; frame += 1) {
        await nextFrame();
        if (cancelled || generationRef.current !== generation) return;
        scroller = findDisplayedScroller();
        if (!scroller) {
          blankFrames += 1;
          continue;
        }
        const anchor = findVisibleAnchor(scroller);
        if (firstFrames.length < 10) {
          firstFrames.push({
            anchor: anchor?.entryId ?? null,
            layer:
              scroller.closest<HTMLElement>(".task-chat-transcript-layer")
                ?.className ?? null,
            scrollTop: scroller.scrollTop,
          });
        }
        if (!anchor) blankFrames += 1;
        else {
          restoredAnchor = anchor;
          if (sourceAnchor && anchor.entryId === sourceAnchor.entryId) {
            // The restored target is visible at its saved anchor.
          } else if (
            outgoingAnchor &&
            anchor.entryId === outgoingAnchor.entryId
          ) {
            outgoingFramesBeforeSwap += 1;
          } else {
            unexpectedAnchorFrames += 1;
          }
        }
      }

      writeResult({
        turns: entries.length,
        sampledFrames: RESTORE_SAMPLE_FRAMES,
        blankFrames,
        outgoingFramesBeforeSwap,
        unexpectedAnchorFrames,
        finalAnchorOffsetError:
          sourceAnchor && restoredAnchor
            ? Math.abs(restoredAnchor.offset - sourceAnchor.offset)
            : null,
        sourceAnchor: sourceAnchor?.entryId ?? null,
        outgoingAnchor: outgoingAnchor?.entryId ?? null,
        restoredAnchor: restoredAnchor?.entryId ?? null,
        firstFrames,
      });
    })();

    return () => {
      cancelled = true;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [entries]);

  const activeEntries = phase === "other" ? otherEntries : entries;
  const identity = phase === "other" ? "restore-decoy" : "restore-target";
  const restoredSnapshot =
    phase === "restored" ? sourceSnapshotRef.current : null;

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <section className="task-hero has-chat" style={{ height: "100%" }}>
        <VirtuosoTaskChatTranscript
          ref={transcriptRef}
          model={{
            entries: activeEntries,
            transcriptIdentity: identity,
            transcriptVersion: "v1",
            restoredViewportSnapshot: restoredSnapshot,
            viewportWidth: 1_180,
            viewportStable: true,
            firstItemIndex: 1_000_000 - activeEntries.length,
            openAtLatestRequest: null,
            liveFollow: false,
          }}
          actions={{
            onViewportSnapshotChange: (snapshot) => {
              if (phaseRef.current === "source") {
                sourceSnapshotRef.current = snapshot;
              }
            },
            onResolveRequest: () => undefined,
          }}
        />
      </section>
      <pre id="transcript-restore-result" hidden />
    </main>
  );
}
