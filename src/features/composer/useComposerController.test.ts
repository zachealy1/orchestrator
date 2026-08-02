import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SlashCommandItem } from "./types";
import { useComposerController } from "./useComposerController";

const commands: SlashCommandItem[] = [
  {
    kind: "builtin",
    command: "plan",
    title: "Plan",
    description: "Plan the work",
  },
];

describe("useComposerController", () => {
  it("updates prompt state and its event-facing ref atomically", () => {
    const { result } = renderHook(() =>
      useComposerController({
        initialAccessMode: "ask-for-approval",
        initialSlashCommands: commands,
      }),
    );

    act(() => result.current.replaceComposerPrompt("first"));
    expect(result.current.prompt).toBe("first");
    expect(result.current.promptRef.current).toBe("first");
    expect(result.current.promptRevision).toBe(1);

    act(() => result.current.replaceComposerPrompt((current) => `${current} second`));
    expect(result.current.prompt).toBe("first second");
    expect(result.current.promptRef.current).toBe("first second");
    expect(result.current.promptRevision).toBe(2);
  });

  it("does not overwrite locally typed input during unrelated rerenders", () => {
    const { result } = renderHook(() =>
      useComposerController({
        initialAccessMode: "ask-for-approval",
        initialSlashCommands: commands,
      }),
    );

    result.current.promptRef.current = "unsent local draft";
    act(() => result.current.setGoalMode(true));

    expect(result.current.prompt).toBe("");
    expect(result.current.promptRef.current).toBe("unsent local draft");
  });

  it("owns attachment and skill refs without leaking stale values", () => {
    const { result } = renderHook(() =>
      useComposerController({
        initialAccessMode: "full-access",
        initialSlashCommands: commands,
      }),
    );
    const file = {
      path: "/workspace/example.ts",
      name: "example.ts",
      source: "picker" as const,
    };
    const skill = { id: "review", name: "Review", description: null };

    act(() => {
      result.current.setContextFiles([file]);
      result.current.setSelectedSkills([skill]);
    });

    expect(result.current.contextFilesRef.current).toEqual([file]);
    expect(result.current.selectedSkillsRef.current).toEqual([skill]);
    expect(result.current.accessMode).toBe("full-access");
  });

  it("exposes stable composer element callbacks", () => {
    const { result } = renderHook(() =>
      useComposerController({
        initialAccessMode: "ask-for-approval",
        initialSlashCommands: commands,
      }),
    );
    const surface = document.createElement("section");
    const textarea = document.createElement("textarea");

    act(() => {
      result.current.handleTaskComposerDropSurfaceElementChange(surface);
      result.current.handleTaskComposerPromptElementChange(textarea);
    });

    expect(result.current.taskContextDropSurfaceRef.current).toBe(surface);
    expect(result.current.taskComposerPromptRef.current).toBe(textarea);
  });
});
