import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskTranscriptErrorBoundary } from "./TaskTranscriptErrorBoundary";

function BrokenTranscript({ broken }: { broken: boolean }) {
  if (broken) {
    throw new Error("Transcript render failed");
  }
  return <div>Rendered transcript</div>;
}

describe("TaskTranscriptErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("contains transcript failures and recovers when the chat changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    const { rerender } = render(
      <TaskTranscriptErrorBoundary resetKey="chat:1" onError={onError}>
        <BrokenTranscript broken />
      </TaskTranscriptErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This chat could not be displayed.",
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Transcript render failed" }),
    );

    rerender(
      <TaskTranscriptErrorBoundary resetKey="chat:2" onError={onError}>
        <BrokenTranscript broken={false} />
      </TaskTranscriptErrorBoundary>,
    );

    expect(screen.getByText("Rendered transcript")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can retry the current transcript without leaving the task view", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let broken = true;
    const Transcript = () => <BrokenTranscript broken={broken} />;
    render(
      <TaskTranscriptErrorBoundary resetKey="chat:1">
        <Transcript />
      </TaskTranscriptErrorBoundary>,
    );

    broken = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Try displaying chat again" }),
    );

    expect(screen.getByText("Rendered transcript")).toBeInTheDocument();
  });
});
