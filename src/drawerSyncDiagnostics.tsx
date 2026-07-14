import { useEffect, useMemo, useRef } from "react";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
} from "./lib/transcriptScrollAnchor";

type Phase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "releasing"
  | "closing";

type Sample = {
  time: number;
  composerLeft: number;
  composerWidth: number;
  drawerLeft: number;
};

type SequenceResult = {
  rows: number;
  openingStartDeltaMs: number | null;
  openingEndDeltaMs: number | null;
  openingProgressError: number;
  closingStartDeltaMs: number | null;
  closingEndDeltaMs: number | null;
  closingProgressError: number;
  maxFrameMs: number;
  framesOverBudget: number;
  openAnchorDelta: number;
  closeAnchorDelta: number;
  openCommitGeometryDelta: number;
  drawerTransition: string;
  composerTransition: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function visibleAnchorOffset(scroller: HTMLElement) {
  const top = scroller.getBoundingClientRect().top;
  const row = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  ).find((candidate) => candidate.getBoundingClientRect().bottom > top + 1);
  return row ? row.getBoundingClientRect().top - top : 0;
}

async function collectSamples(
  composer: HTMLElement,
  drawer: HTMLElement,
  durationMs: number,
) {
  const samples: Sample[] = [];
  const startedAt = performance.now();
  while (performance.now() - startedAt < durationMs) {
    await nextFrame();
    const composerRect = composer.getBoundingClientRect();
    const drawerRect = drawer.getBoundingClientRect();
    samples.push({
      time: performance.now(),
      composerLeft: composerRect.left,
      composerWidth: composerRect.width,
      drawerLeft: drawerRect.left,
    });
  }
  return samples;
}

function analyzeProgress(
  samples: Sample[],
  start: Sample,
  end: Sample,
  direction: "opening" | "closing",
) {
  const drawerDistance = end.drawerLeft - start.drawerLeft;
  const composerLeftDistance = end.composerLeft - start.composerLeft;
  const composerWidthDistance = end.composerWidth - start.composerWidth;
  const rows = samples.map((sample) => {
    const drawerProgress = clamp(
      drawerDistance === 0
        ? 1
        : (sample.drawerLeft - start.drawerLeft) / drawerDistance,
    );
    const leftProgress = clamp(
      composerLeftDistance === 0
        ? drawerProgress
        : (sample.composerLeft - start.composerLeft) / composerLeftDistance,
    );
    const widthProgress = clamp(
      composerWidthDistance === 0
        ? drawerProgress
        : (sample.composerWidth - start.composerWidth) / composerWidthDistance,
    );
    const composerProgress = (leftProgress + widthProgress) / 2;
    return {
      time: sample.time,
      drawerProgress,
      composerProgress,
      error: Math.abs(drawerProgress - composerProgress),
    };
  });
  const firstDrawer = rows.find((row) => row.drawerProgress >= 0.02)?.time ?? null;
  const firstComposer =
    rows.find((row) => row.composerProgress >= 0.02)?.time ?? null;
  const lastDrawer = rows.find((row) => row.drawerProgress >= 0.98)?.time ?? null;
  const lastComposer =
    rows.find((row) => row.composerProgress >= 0.98)?.time ?? null;

  return {
    startDelta:
      firstDrawer !== null && firstComposer !== null
        ? Math.abs(firstDrawer - firstComposer)
        : null,
    endDelta:
      lastDrawer !== null && lastComposer !== null
        ? Math.abs(lastDrawer - lastComposer)
        : null,
    maxError: rows.reduce((maximum, row) => Math.max(maximum, row.error), 0),
    direction,
  };
}

function asSample(composer: DOMRect, drawer: DOMRect): Sample {
  return {
    time: performance.now(),
    composerLeft: composer.left,
    composerWidth: composer.width,
    drawerLeft: drawer.left,
  };
}

export default function DrawerSyncDiagnostics() {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLElement | null>(null);
  const rows = useMemo(
    () =>
      Array.from({ length: 300 }, (_, index) => ({
        id: `row-${index}`,
        paragraphs: 1 + (index % 8),
      })),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;
    const drawer = drawerRef.current;
    const composer = composerRef.current;
    const transcript = transcriptRef.current;
    if (!body || !drawer || !composer || !transcript) return;

    const setPhase = (phase: Phase) => {
      body.className = `codex-workspace-body${
        phase === "open" ? " history-space-reserved history-open" : ""
      }${phase === "preparing" ? " history-open history-input-animating" : ""}${
        phase === "opening"
          ? " history-open history-input-animating history-input-contracted"
          : ""
      }${
        phase === "releasing"
          ? " history-input-animating history-input-contracted"
          : ""
      }${phase === "closing" ? " history-input-animating" : ""}`;
      drawer.className = `workspace-history-drawer ${phase}`;
    };

    const runSequence = async (rowCount: number): Promise<SequenceResult> => {
      transcript.querySelectorAll<HTMLElement>(".task-chat-native-row").forEach(
        (row, index) => {
          row.hidden = index >= rowCount;
        },
      );
      setPhase("closed");
      await delay(80);
      transcript.scrollTop = Math.min(4_000, transcript.scrollHeight / 3);
      let closed = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
      );

      setPhase("releasing");
      const contracted = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
      );
      setPhase("closed");
      await delay(80);
      closed = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
      );

      setPhase("preparing");
      void composer.offsetWidth;
      await delay(0);
      setPhase("opening");
      const drawerTransition = getComputedStyle(drawer).transition;
      const composerTransition = getComputedStyle(composer).transition;
      const openingSamples = await collectSamples(composer, drawer, 230);
      const openAnchor = captureTranscriptViewportAnchor(transcript);
      const openAnchorBefore = visibleAnchorOffset(transcript);
      setPhase("open");
      restoreTranscriptViewportAnchor(openAnchor);
      const openAnchorDelta = Math.abs(
        visibleAnchorOffset(transcript) - openAnchorBefore,
      );
      await nextFrame();
      const open = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
      );
      const opening = analyzeProgress(
        openingSamples,
        closed,
        contracted,
        "opening",
      );
      const openCommitGeometryDelta = Math.max(
        Math.abs(open.composerLeft - contracted.composerLeft),
        Math.abs(open.composerWidth - contracted.composerWidth),
        Math.abs(open.drawerLeft - contracted.drawerLeft),
      );

      await delay(80);
      const closeAnchor = captureTranscriptViewportAnchor(transcript);
      const closeAnchorBefore = visibleAnchorOffset(transcript);
      setPhase("releasing");
      restoreTranscriptViewportAnchor(closeAnchor);
      void composer.offsetWidth;
      const closeAnchorDelta = Math.abs(
        visibleAnchorOffset(transcript) - closeAnchorBefore,
      );
      await delay(0);
      setPhase("closing");
      const closingSamples = await collectSamples(composer, drawer, 230);
      setPhase("closed");
      await nextFrame();
      const finalClosed = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
      );
      const closing = analyzeProgress(closingSamples, open, finalClosed, "closing");
      const frameDeltas = [openingSamples, closingSamples].flatMap((samples) =>
        samples.slice(1).map((sample, index) => sample.time - samples[index].time),
      );

      return {
        rows: rowCount,
        openingStartDeltaMs: opening.startDelta,
        openingEndDeltaMs: opening.endDelta,
        openingProgressError: opening.maxError,
        closingStartDeltaMs: closing.startDelta,
        closingEndDeltaMs: closing.endDelta,
        closingProgressError: closing.maxError,
        maxFrameMs: Math.max(0, ...frameDeltas),
        framesOverBudget: frameDeltas.filter((value) => value > 20).length,
        openAnchorDelta,
        closeAnchorDelta,
        openCommitGeometryDelta,
        drawerTransition,
        composerTransition,
      };
    };

    void (async () => {
      await delay(500);
      const small = await runSequence(6);
      const large = await runSequence(300);
      if (cancelled) return;
      const payload = encodeURIComponent(JSON.stringify({ small, large }));
      const beacon = new Image();
      beacon.src = `http://127.0.0.1:8765/profile?data=${payload}`;
      document.title = "Drawer profile complete";
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <div className="codex-workspace-body" ref={bodyRef} style={{ height: "100%" }}>
        <section className="task-hero has-chat" aria-label="Diagnostic chat">
          <section
            className="task-chat-transcript native-transcript"
            ref={transcriptRef}
          >
            <div className="task-chat-native-list">
              {rows.map((row) => (
                <div
                  className="task-chat-native-row"
                  data-transcript-entry-id={row.id}
                  key={row.id}
                >
                  <article style={{ width: "min(920px, 100%)" }}>
                    {Array.from({ length: row.paragraphs }, (_, paragraph) => (
                      <p key={paragraph}>
                        Turn {row.id} paragraph {paragraph + 1}. This variable-height
                        prepared response exercises native WebKit layout while the
                        history drawer and composer move together.
                      </p>
                    ))}
                  </article>
                </div>
              ))}
            </div>
          </section>
          <div className="composer-panel" ref={composerRef}>
            <div className="composer-input-zone">
              <div className="prompt-shell">
                <div className="prompt-field">
                  <textarea defaultValue="Profile the coordinated input animation" />
                </div>
              </div>
            </div>
            <div className="composer-controls" style={{ minHeight: 120 }} />
          </div>
        </section>
        <aside className="workspace-history-drawer closed" ref={drawerRef}>
          <header><h2>History</h2></header>
          <div className="history-drawer-body">Native profile fixture</div>
        </aside>
      </div>
    </main>
  );
}
