import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { Root, Text, Element } from "hast";
import { SKIP, visit } from "unist-util-visit";
import { TRANSCRIPT_MARKDOWN_PLUGINS } from "../lib/markdownPlugins";
import { transcriptMarkdownUrlTransform } from "./TranscriptMarkdownImage";

function motionEnabled() {
  return (
    document.visibilityState !== "hidden" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function subscribeMotion(callback: () => void) {
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  media?.addEventListener("change", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    media?.removeEventListener("change", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

type RevealState = { initialized: boolean; seen: Set<string> };
const RevealContext = createContext<{
  enabled: boolean;
  state: RevealState;
} | null>(null);

function TextReveal({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const motion = useSyncExternalStore(
    subscribeMotion,
    motionEnabled,
    () => false,
  );
  const state = useRef<RevealState>({ initialized: false, seen: new Set() });
  const value = useMemo(
    () => ({ enabled: active && motion, state: state.current }),
    [active, motion],
  );
  // Existing text on mount (history, navigation, disclosure reopening) is already read.
  useLayoutEffect(() => {
    state.current.initialized = true;
  }, []);
  return (
    <RevealContext.Provider value={value}>{children}</RevealContext.Provider>
  );
}

function RevealSegment({ id, children }: { id: string; children: ReactNode }) {
  const context = useContext(RevealContext)!;
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef<{ id: string; at: number } | null>(null);
  useLayoutEffect(() => {
    const unseen = !context.state.seen.has(id);
    context.state.seen.add(id);
    if (!context.enabled) {
      started.current = null;
      return;
    }
    if (unseen && context.state.initialized) {
      started.current = { id, at: performance.now() };
    }
    const elapsed =
      started.current?.id === id ? performance.now() - started.current.at : 150;
    if (elapsed >= 150 || !ref.current?.animate) return;
    const animation = ref.current.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: "cubic-bezier(.37,.55,.86,.88)",
    });
    // StrictMode replays mount effects in development. Resume the same fade
    // after its cleanup instead of treating it as already settled.
    animation.currentTime = elapsed;
    return () => animation.cancel();
  }, [context, id]);
  useLayoutEffect(() => {
    // Also remember the source range: closing emphasis can move a word's start
    // past a marker while reparenting it into a new DOM node.
    const start = Number(id);
    const length = ref.current?.textContent?.length ?? 0;
    for (let offset = start; offset < start + length; offset += 1) {
      context.state.seen.add(String(offset));
    }
  }, [children, context, id]);
  return (
    <span ref={ref} data-stream-segment={id}>
      {children}
    </span>
  );
}

function segments(text: string) {
  return Array.from(text.matchAll(/\s*\S+\s*|\s+/gu));
}

/** Source offsets remain stable when an unfinished Markdown node changes shape. */
function rehypeRevealText({ baseline }: { baseline: number }) {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (
        index === undefined ||
        !parent ||
        node.position?.start.offset === undefined
      )
        return;
      const offset = node.position.start.offset;
      if (offset + node.value.length <= baseline) return;
      const replacements: (Element | Text)[] = segments(node.value).map(
        (part) =>
          offset + part.index! < baseline
            ? { type: "text", value: part[0] }
            : {
                type: "element",
                tagName: "span",
                properties: {
                  "data-stream-segment": String(offset + part.index!),
                },
                children: [{ type: "text", value: part[0] }],
              },
      );
      parent.children.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });
  };
}

export function StreamingMarkdown({
  text,
  active,
  components,
  skipHtml,
}: {
  text: string;
  active: boolean;
  components?: Components;
  skipHtml?: boolean;
}) {
  const baseline = useRef(text.length).current;
  const revealComponents = useMemo<Components>(
    () => ({
      ...components,
      span: ({ node, children, ...props }) => {
        const id = node?.properties["data-stream-segment"];
        return typeof id === "string" ? (
          <RevealSegment id={id}>{children}</RevealSegment>
        ) : (
          <span {...props}>{children}</span>
        );
      },
    }),
    [components],
  );
  return (
    <TextReveal active={active}>
      <ReactMarkdown
        components={revealComponents}
        remarkPlugins={TRANSCRIPT_MARKDOWN_PLUGINS.remarkPlugins}
        rehypePlugins={
          active
            ? [
                ...TRANSCRIPT_MARKDOWN_PLUGINS.rehypePlugins,
                [rehypeRevealText, { baseline }],
              ]
            : TRANSCRIPT_MARKDOWN_PLUGINS.rehypePlugins
        }
        urlTransform={transcriptMarkdownUrlTransform}
        skipHtml={skipHtml}
      >
        {text}
      </ReactMarkdown>
    </TextReveal>
  );
}

export function StreamingText({
  text,
  active,
}: {
  text: string;
  active: boolean;
}) {
  const baseline = useRef(text.length).current;
  return (
    <TextReveal active={active}>
      {segments(text).map((part) =>
        !active || part.index! < baseline ? (
          part[0]
        ) : (
          <RevealSegment id={String(part.index)} key={part.index}>
            {part[0]}
          </RevealSegment>
        ),
      )}
    </TextReveal>
  );
}
