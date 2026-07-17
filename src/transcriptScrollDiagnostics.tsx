import { useEffect, useMemo, useRef } from "react";
import { emptyRunView } from "./lib/codexEventReducer";
import { VirtuosoTaskChatTranscript } from "./components/VirtuosoTaskChatTranscript";
import type { TaskChatEntry } from "./components/TaskChatTranscript";

const PROFILE_TURN_COUNT = 300;
const PROFILE_FRAME_COUNT = 150;

type ScrollProfileResult = {
  turns: number;
  maxFrameMs: number;
  framesOver20Ms: number;
  framesOver32Ms: number;
  blankFrames: number;
  seekFrames: number;
  maxMountedRealRows: number;
  maxMountedSeekRows: number;
  finalScrollTop: number;
};

function nextFrame() {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

function makeParagraph(turn: number, paragraph: number) {
  return [
    `<p>Turn ${turn}, paragraph ${paragraph}. This prepared historical response`,
    "contains enough text to exercise variable-height layout and high-speed",
    "macOS momentum scrolling without parsing Markdown on the main thread.</p>",
  ].join(" ");
}

function makeEntry(index: number): TaskChatEntry {
  const turn = index + 1;
  const paragraphCount = 1 + ((turn * 7) % 13);
  const promptRepeat = turn % 17 === 0 ? 42 : 1 + (turn % 5);
  const prompt = Array.from(
    { length: promptRepeat },
    () => `Variable-height prompt ${turn} checks fast scrolling.`,
  ).join(" ");
  const html = Array.from({ length: paragraphCount }, (_, paragraph) =>
    makeParagraph(turn, paragraph + 1),
  ).join("");
  const finalMessage = html.replace(/<[^>]+>/g, " ");

  return {
    clientId: `profile-turn-${turn}`,
    workspaceId: 1,
    chatId: 1,
    turnIndex: turn,
    runId: turn,
    taskId: turn,
    prompt,
    submittedAt: "2026-07-15T12:00:00.000Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage,
      elapsedMs: turn * 100,
    },
    preparedSummary: {
      kind: "html",
      html,
      sourceHash: `profile-summary-${turn}`,
    },
  };
}

function intersectsViewport(element: Element, viewport: DOMRect) {
  const bounds = element.getBoundingClientRect();
  return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
}

export default function TranscriptScrollDiagnostics() {
  const generationRef = useRef(0);
  const entries = useMemo(
    () => Array.from({ length: PROFILE_TURN_COUNT }, (_, index) => makeEntry(index)),
    [],
  );

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;

    void (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      const scroller = document.querySelector<HTMLElement>(
        ".task-chat-transcript.virtuoso-transcript",
      );
      if (!scroller || cancelled || generationRef.current !== generation) return;

      const frameDurations: number[] = [];
      let blankFrames = 0;
      let seekFrames = 0;
      let maxMountedRealRows = 0;
      let maxMountedSeekRows = 0;
      let previousFrame = performance.now();
      const maximumScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

      for (let frame = 0; frame < PROFILE_FRAME_COUNT; frame += 1) {
        const phase = frame / (PROFILE_FRAME_COUNT - 1);
        const triangle = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
        const target = maximumScrollTop * triangle;
        scroller.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            deltaY: target - scroller.scrollTop,
          }),
        );
        scroller.scrollTop = target;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

        const now = await nextFrame();
        frameDurations.push(now - previousFrame);
        previousFrame = now;

        const viewport = scroller.getBoundingClientRect();
        const realRows = Array.from(
          scroller.querySelectorAll(".task-chat-virtuoso-row"),
        );
        const seekRows = Array.from(
          scroller.querySelectorAll(".task-chat-scroll-seek-row"),
        );
        const hasVisibleContent = [...realRows, ...seekRows].some((element) =>
          intersectsViewport(element, viewport),
        );
        if (!hasVisibleContent) blankFrames += 1;
        if (seekRows.some((element) => intersectsViewport(element, viewport))) {
          seekFrames += 1;
        }
        maxMountedRealRows = Math.max(maxMountedRealRows, realRows.length);
        maxMountedSeekRows = Math.max(maxMountedSeekRows, seekRows.length);
      }

      const result: ScrollProfileResult = {
        turns: entries.length,
        maxFrameMs: Math.max(0, ...frameDurations),
        framesOver20Ms: frameDurations.filter((duration) => duration > 20).length,
        framesOver32Ms: frameDurations.filter((duration) => duration > 32).length,
        blankFrames,
        seekFrames,
        maxMountedRealRows,
        maxMountedSeekRows,
        finalScrollTop: scroller.scrollTop,
      };
      const output = document.getElementById("transcript-profile-result");
      if (output) output.textContent = JSON.stringify(result, null, 2);
      document.title = "Transcript profile complete";
    })();

    return () => {
      cancelled = true;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [entries]);

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <section className="task-hero has-chat" style={{ height: "100%" }}>
        <VirtuosoTaskChatTranscript
          entries={entries}
          transcriptIdentity="scroll-profile"
          transcriptVersion="v1"
          viewportWidth={1_180}
          viewportStable
          firstItemIndex={1_000_000 - entries.length}
          openAtLatestRequest={null}
          liveFollow={false}
          onResolveRequest={() => undefined}
        />
      </section>
      <pre id="transcript-profile-result" hidden />
    </main>
  );
}
