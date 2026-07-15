import { useEffect, useMemo, useRef } from "react";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
} from "./lib/transcriptScrollAnchor";

type Phase =
  | "closed"
  | "opening"
  | "open"
  | "closing";

type Sample = {
  time: number;
  composerLeft: number;
  composerWidth: number;
  drawerLeft: number;
  messageWidth: number;
};

type SequenceResult = {
  variant: "chat" | "empty" | "multiline";
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
  openingWidthReversals: number;
  openingMaxReversePx: number;
  closingWidthReversals: number;
  closingMaxReversePx: number;
  openingMessageWidthReversals: number;
  openingMessageMaxReversePx: number;
  closingMessageWidthReversals: number;
  closingMessageMaxReversePx: number;
  closedComposerWidth: number;
  openComposerWidth: number;
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
  message: HTMLElement,
  durationMs: number,
) {
  const samples: Sample[] = [];
  const startedAt = performance.now();
  while (performance.now() - startedAt < durationMs) {
    await nextFrame();
    const composerRect = composer.getBoundingClientRect();
    const drawerRect = drawer.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    samples.push({
      time: performance.now(),
      composerLeft: composerRect.left,
      composerWidth: composerRect.width,
      drawerLeft: drawerRect.left,
      messageWidth: messageRect.width,
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

function asSample(composer: DOMRect, drawer: DOMRect, message: DOMRect): Sample {
  return {
    time: performance.now(),
    composerLeft: composer.left,
    composerWidth: composer.width,
    drawerLeft: drawer.left,
    messageWidth: message.width,
  };
}

function analyzeWidthDirection(
  samples: Sample[],
  direction: "opening" | "closing",
  field: "composerWidth" | "messageWidth" = "composerWidth",
) {
  let reversals = 0;
  let maxReversePx = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const delta = samples[index][field] - samples[index - 1][field];
    const reverseDelta = direction === "opening" ? delta : -delta;
    if (reverseDelta > 0.25) {
      reversals += 1;
      maxReversePx = Math.max(maxReversePx, reverseDelta);
    }
  }

  return { reversals, maxReversePx };
}

export default function DrawerSyncDiagnostics() {
  const runGenerationRef = useRef(0);
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
    const runGeneration = runGenerationRef.current + 1;
    runGenerationRef.current = runGeneration;
    const body = bodyRef.current;
    const drawer = drawerRef.current;
    const composer = composerRef.current;
    const transcript = transcriptRef.current;
    if (!body || !drawer || !composer || !transcript) return;

    const findVisibleMessage = () => {
      const transcriptBounds = transcript.getBoundingClientRect();
      return (
        Array.from(
          transcript.querySelectorAll<HTMLElement>(
            ".task-chat-native-row:not([hidden]) article",
          ),
        ).find((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return (
            bounds.bottom > transcriptBounds.top &&
            bounds.top < transcriptBounds.bottom
          );
        }) ?? null
      );
    };

    const setPhase = (phase: Phase) => {
      if (cancelled || runGenerationRef.current !== runGeneration) return;
      body.className = `codex-workspace-body${
        phase === "opening" || phase === "open"
          ? " history-space-reserved history-open"
          : ""
      }`;
      body.dataset.historyTransitionPhase = phase;
      drawer.className = `workspace-history-drawer ${phase}`;
    };

    const runSequence = async (
      rowCount: number,
      variant: SequenceResult["variant"] = "chat",
    ): Promise<SequenceResult> => {
      const hero = body.querySelector<HTMLElement>(".task-hero");
      const textarea = composer.querySelector<HTMLTextAreaElement>("textarea");
      if (hero) hero.className = variant === "empty" ? "task-hero" : "task-hero has-chat";
      if (textarea) {
        textarea.value =
          variant === "multiline"
            ? "First line\nSecond line\nThird line\nFourth line"
            : "Profile the coordinated input animation";
        textarea.style.height = variant === "multiline" ? "116px" : "";
      }
      transcript.querySelectorAll<HTMLElement>(".task-chat-native-row").forEach(
        (row, index) => {
          row.hidden = index >= rowCount;
        },
      );
      setPhase("closed");
      await delay(80);
      transcript.scrollTop = Math.min(4_000, transcript.scrollHeight / 3);
      const message = findVisibleMessage() ?? transcript;
      const closed = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
        message.getBoundingClientRect(),
      );

      setPhase("opening");
      const drawerTransition = getComputedStyle(drawer).transition;
      const composerTransition = getComputedStyle(composer).transition;
      const openingSamples = await collectSamples(composer, drawer, message, 230);
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
        message.getBoundingClientRect(),
      );
      const opening = analyzeProgress(
        openingSamples,
        closed,
        open,
        "opening",
      );
      const finalOpeningSample = openingSamples[openingSamples.length - 1];
      const openCommitGeometryDelta = Math.max(
        Math.abs(open.composerLeft - finalOpeningSample.composerLeft),
        Math.abs(open.composerWidth - finalOpeningSample.composerWidth),
        Math.abs(open.drawerLeft - finalOpeningSample.drawerLeft),
      );
      const openingDirection = analyzeWidthDirection(openingSamples, "opening");
      const openingMessageDirection = analyzeWidthDirection(
        openingSamples,
        "opening",
        "messageWidth",
      );

      await delay(80);
      const closeAnchor = captureTranscriptViewportAnchor(transcript);
      const closeAnchorBefore = visibleAnchorOffset(transcript);
      setPhase("closing");
      const closingSamples = await collectSamples(composer, drawer, message, 230);
      setPhase("closed");
      restoreTranscriptViewportAnchor(closeAnchor);
      const closeAnchorDelta = Math.abs(
        visibleAnchorOffset(transcript) - closeAnchorBefore,
      );
      await nextFrame();
      const finalClosed = asSample(
        composer.getBoundingClientRect(),
        drawer.getBoundingClientRect(),
        message.getBoundingClientRect(),
      );
      const closing = analyzeProgress(closingSamples, open, finalClosed, "closing");
      const closingDirection = analyzeWidthDirection(closingSamples, "closing");
      const closingMessageDirection = analyzeWidthDirection(
        closingSamples,
        "closing",
        "messageWidth",
      );
      const frameDeltas = [openingSamples, closingSamples].flatMap((samples) =>
        samples.slice(1).map((sample, index) => sample.time - samples[index].time),
      );

      return {
        variant,
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
        openingWidthReversals: openingDirection.reversals,
        openingMaxReversePx: openingDirection.maxReversePx,
        closingWidthReversals: closingDirection.reversals,
        closingMaxReversePx: closingDirection.maxReversePx,
        openingMessageWidthReversals: openingMessageDirection.reversals,
        openingMessageMaxReversePx: openingMessageDirection.maxReversePx,
        closingMessageWidthReversals: closingMessageDirection.reversals,
        closingMessageMaxReversePx: closingMessageDirection.maxReversePx,
        closedComposerWidth: closed.composerWidth,
        openComposerWidth: open.composerWidth,
        drawerTransition,
        composerTransition,
      };
    };

    const runRapidReversal = async () => {
      const hero = body.querySelector<HTMLElement>(".task-hero");
      if (hero) hero.className = "task-hero has-chat";
      setPhase("closed");
      await delay(240);
      const message = findVisibleMessage();
      if (!message) {
        throw new Error("The diagnostic transcript has no visible message.");
      }
      const textarea = composer.querySelector("textarea");
      const originalTextarea = textarea;
      const originalValue = textarea?.value ?? "";
      textarea?.focus();
      textarea?.setSelectionRange(7, 7);
      const closedWidth = composer.getBoundingClientRect().width;

      setPhase("opening");
      const firstOpening = await collectSamples(composer, drawer, message, 72);
      setPhase("closing");
      const reversedClosing = await collectSamples(composer, drawer, message, 72);
      setPhase("opening");
      const finalOpening = await collectSamples(composer, drawer, message, 230);
      setPhase("open");
      const openWidth = composer.getBoundingClientRect().width;
      const samples = [...firstOpening, ...reversedClosing, ...finalOpening];
      const lowerBound = Math.min(closedWidth, openWidth) - 0.25;
      const upperBound = Math.max(closedWidth, openWidth) + 0.25;
      const frameDeltas = samples
        .slice(1)
        .map((sample, index) => sample.time - samples[index].time);
      const finalReversalSample = finalOpening[finalOpening.length - 1];

      return {
        firstOpeningReversals: analyzeWidthDirection(firstOpening, "opening").reversals,
        reversedClosingReversals: analyzeWidthDirection(reversedClosing, "closing")
          .reversals,
        finalOpeningReversals: analyzeWidthDirection(finalOpening, "opening").reversals,
        samplesOutsideEndpointBounds: samples.filter(
          (sample) =>
            sample.composerWidth < lowerBound || sample.composerWidth > upperBound,
        ).length,
        finalWidthDelta: Math.abs(
          finalReversalSample.composerWidth - openWidth,
        ),
        maxFrameMs: Math.max(0, ...frameDeltas),
        framesOverBudget: frameDeltas.filter((value) => value > 20).length,
        textareaPreserved:
          composer.querySelector("textarea") === originalTextarea &&
          textarea?.value === originalValue &&
          textarea?.selectionStart === 7 &&
          textarea?.selectionEnd === 7,
      };
    };

    void (async () => {
      await delay(500);
      const small = await runSequence(6);
      const large = await runSequence(300);
      const empty = await runSequence(0, "empty");
      const multiline = await runSequence(6, "multiline");
      const rapidReversal = await runRapidReversal();
      if (cancelled) return;
      const result = document.getElementById("profile-result");
      if (result) {
        result.textContent = JSON.stringify(
          { small, large, empty, multiline, rapidReversal },
          null,
          2,
        );
      }
      document.title = "Drawer profile complete";
    })();

    return () => {
      cancelled = true;
      if (runGenerationRef.current === runGeneration) {
        runGenerationRef.current += 1;
      }
    };
  }, []);

  return (
    <main
      style={{ width: "100vw", height: "100vh", containerType: "inline-size" }}
    >
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
        <pre id="profile-result" hidden />
      </div>
    </main>
  );
}
