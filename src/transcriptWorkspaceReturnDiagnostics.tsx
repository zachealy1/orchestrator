import { useEffect, useMemo, useRef, useState } from "react";
import {
  VirtuosoTaskChatTranscript,
  type TranscriptViewportSnapshot,
  type VirtuosoTaskChatTranscriptHandle,
} from "./components/VirtuosoTaskChatTranscript";
import type { TaskChatEntry } from "./components/TaskChatTurn";
import { emptyRunView } from "./lib/codexEventReducer";
import { useAppServices } from "./runtime/AppServices";

const TURN_COUNT = 120;
const SAMPLE_FRAMES = 40;
const BOTTOM_TOLERANCE_PX = 2;

type DiagnosticPhase = "source" | "empty" | "restored";

type DiagnosticFrame = {
  state: "missing" | "preparing" | "visible";
  scrollTop: number | null;
  bottomDistance: number | null;
  anchor: string | null;
};

type WorkspaceReturnDiagnosticResult = {
  turns: number;
  sampledFrames: number;
  preparingFrames: number;
  missingFrames: number;
  blankVisibleFrames: number;
  visibleFramesAwayFromBottom: number;
  visibleScrollReversals: number;
  finalBottomDistance: number | null;
  firstFrames: DiagnosticFrame[];
};

function nextFrame() {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

function makeEntry(index: number): TaskChatEntry {
  const turn = index + 1;
  const paragraphCount = 1 + ((turn * 7) % 13);
  const html = Array.from(
    { length: paragraphCount },
    (_, paragraph) =>
      `<p>Snake workspace turn ${turn}, paragraph ${paragraph + 1}. Variable row heights reproduce a large restored conversation.</p>`,
  ).join("");

  return {
    clientId: `snake-workspace-turn-${turn}`,
    workspaceId: 2,
    chatId: 22,
    turnIndex: turn,
    runId: turn,
    taskId: turn,
    prompt: `Snake workspace prompt ${turn}`,
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
      sourceHash: `snake-workspace-summary-${turn}`,
    },
  };
}

function findVisibleScroller() {
  return document.querySelector<HTMLElement>(
    ".task-chat-transcript-layer.is-visible .task-chat-transcript.virtuoso-transcript",
  );
}

function findVisibleAnchor(scroller: HTMLElement) {
  const viewport = scroller.getBoundingClientRect();
  for (const row of scroller.querySelectorAll<HTMLElement>(
    "[data-transcript-entry-id]",
  )) {
    const bounds = row.getBoundingClientRect();
    if (bounds.bottom > viewport.top && bounds.top < viewport.bottom) {
      return row.dataset.transcriptEntryId ?? null;
    }
  }
  return null;
}

function getBottomDistance(scroller: HTMLElement) {
  return Math.max(
    0,
    scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop,
  );
}

function writeResult(result: WorkspaceReturnDiagnosticResult) {
  const output = document.getElementById("workspace-return-result");
  if (output) output.textContent = JSON.stringify(result, null, 2);
  document.title = "Workspace return complete";
}

export default function TranscriptWorkspaceReturnDiagnostics() {
  const { transcriptStates } = useAppServices();
  const [phase, setPhase] = useState<DiagnosticPhase>("source");
  const phaseRef = useRef(phase);
  const transcriptRef = useRef<VirtuosoTaskChatTranscriptHandle | null>(null);
  const sourceSnapshotRef = useRef<TranscriptViewportSnapshot | null>(null);
  const generationRef = useRef(0);
  const entries = useMemo(
    () => Array.from({ length: TURN_COUNT }, (_, index) => makeEntry(index)),
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
      const sourceScroller = findVisibleScroller();
      if (!sourceScroller) return;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (sourceScroller.scrollHeight > sourceScroller.clientHeight * 2) break;
        await nextFrame();
      }
      sourceScroller.scrollTop = Math.max(
        0,
        sourceScroller.scrollHeight - sourceScroller.clientHeight,
      );
      sourceScroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      for (let frame = 0; frame < 12; frame += 1) await nextFrame();

      transcriptRef.current?.captureViewportState();
      for (
        let attempt = 0;
        attempt < 8 && !sourceSnapshotRef.current;
        attempt += 1
      ) {
        await nextFrame();
      }
      if (!sourceSnapshotRef.current) return;

      setPhase("empty");
      for (let frame = 0; frame < 8; frame += 1) await nextFrame();
      setPhase("restored");

      let preparingFrames = 0;
      let missingFrames = 0;
      let blankVisibleFrames = 0;
      let visibleFramesAwayFromBottom = 0;
      let visibleScrollReversals = 0;
      let previousVisibleScrollTop: number | null = null;
      let previousDirection = 0;
      let finalBottomDistance: number | null = null;
      const firstFrames: DiagnosticFrame[] = [];

      for (let frame = 0; frame < SAMPLE_FRAMES; frame += 1) {
        await nextFrame();
        if (cancelled || generationRef.current !== generation) return;

        const scroller = findVisibleScroller();
        if (!scroller) {
          const preparing = Boolean(
            document.querySelector(".task-chat-transcript-layer.is-preparing"),
          );
          if (preparing) preparingFrames += 1;
          else missingFrames += 1;
          if (firstFrames.length < 12) {
            firstFrames.push({
              state: preparing ? "preparing" : "missing",
              scrollTop: null,
              bottomDistance: null,
              anchor: null,
            });
          }
          continue;
        }

        const anchor = findVisibleAnchor(scroller);
        const bottomDistance = getBottomDistance(scroller);
        finalBottomDistance = bottomDistance;
        if (!anchor) blankVisibleFrames += 1;
        if (bottomDistance > BOTTOM_TOLERANCE_PX) {
          visibleFramesAwayFromBottom += 1;
        }
        if (previousVisibleScrollTop !== null) {
          const delta = scroller.scrollTop - previousVisibleScrollTop;
          const direction = Math.abs(delta) <= BOTTOM_TOLERANCE_PX ? 0 : Math.sign(delta);
          if (
            direction !== 0 &&
            previousDirection !== 0 &&
            direction !== previousDirection
          ) {
            visibleScrollReversals += 1;
          }
          if (direction !== 0) previousDirection = direction;
        }
        previousVisibleScrollTop = scroller.scrollTop;
        if (firstFrames.length < 12) {
          firstFrames.push({
            state: "visible",
            scrollTop: scroller.scrollTop,
            bottomDistance,
            anchor,
          });
        }
      }

      writeResult({
        turns: entries.length,
        sampledFrames: SAMPLE_FRAMES,
        preparingFrames,
        missingFrames,
        blankVisibleFrames,
        visibleFramesAwayFromBottom,
        visibleScrollReversals,
        finalBottomDistance,
        firstFrames,
      });
    })();

    return () => {
      cancelled = true;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [entries]);

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <section className="task-hero has-chat" style={{ height: "100%" }}>
        {phase === "empty" ? (
          <h1>Use the plan, Luke.</h1>
        ) : (
          <VirtuosoTaskChatTranscript
            ref={transcriptRef}
            model={{
              entries,
              transcriptIdentity: "workspace:snake-test",
              transcriptVersion: "v1",
              restoredViewportSnapshot:
                phase === "restored" ? sourceSnapshotRef.current : null,
              viewportWidth: 1_180,
              viewportStable: true,
              firstItemIndex: 1_000_000 - entries.length,
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
        )}
      </section>
      <pre id="workspace-return-result" hidden />
    </main>
  );
}
