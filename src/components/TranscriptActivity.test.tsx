import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActivityDisclosure,
  ActivityTimeline,
  activityStatusLabel,
  attentionTimelineItems,
  CommandsGroup,
} from "./TranscriptActivity";
import type { TimelineItem } from "../lib/runTimeline";

const command = {
  id: "cmd",
  command: "npm test",
  status: "running" as const,
  output: "first line",
  durationMs: null,
};
describe("shared transcript activity", () => {
  it("collapses on completion by default and retains explicit disclosure choices", async () => {
    const body = (active: boolean) => (
      <ActivityDisclosure
        active={active}
        label={active ? "Working" : "Worked for 2s"}
      >
        <p>Activity text</p>
      </ActivityDisclosure>
    );
    const view = render(body(true));
    expect(screen.getByText("Activity text")).toBeVisible();
    view.rerender(body(false));
    expect(screen.queryByText("Activity text")).toBeNull();
    fireEvent.click(screen.getByLabelText("Run trace"));
    await screen.findByText("Activity text");
    view.rerender(body(true));
    view.rerender(body(false));
    expect(screen.getByText("Activity text")).toBeVisible();
  });
  it("keeps a reader's collapsed live activity closed as text arrives", async () => {
    const view = render(
      <ActivityDisclosure active label="Working">
        <p>First</p>
      </ActivityDisclosure>,
    );
    fireEvent.click(screen.getByLabelText("Run trace"));
    await waitFor(() => expect(screen.queryByText("First")).toBeNull());
    view.rerender(
      <ActivityDisclosure active label="Working for 3s">
        <p>Updated</p>
      </ActivityDisclosure>,
    );
    expect(screen.queryByText("Updated")).toBeNull();
  });
  it("exposes streaming command output without closing it on text updates", () => {
    const view = render(<CommandsGroup commands={[command]} />);
    fireEvent.click(screen.getByText("Output"));
    expect(screen.getByText("first line").closest("details")).toHaveAttribute(
      "open",
    );
    view.rerender(
      <CommandsGroup
        commands={[{ ...command, output: "first line\nsecond line" }]}
      />,
    );
    expect(screen.getByText(/second line/).closest("details")).toHaveAttribute(
      "open",
    );
  });
  it("keeps failed commands visible outside a collapsed completed trace", () => {
    const items: TimelineItem[] = [
      {
        kind: "commands",
        id: "commands",
        commands: [{ ...command, status: "failed" }],
      },
    ];
    render(
      <ActivityDisclosure
        active={false}
        label="Failed after 2s"
        attention={<ActivityTimeline items={attentionTimelineItems(items)} />}
      >
        <ActivityTimeline items={items} />
      </ActivityDisclosure>,
    );
    expect(screen.getByText("npm test")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
  });
  it.each([
    ["running", "Working"],
    ["completed", "Worked for 0s"],
    ["failed", "Failed after 0s"],
    ["interrupted", "You stopped after 0s"],
  ])("labels %s consistently in both transcripts", (status, label) => {
    expect(activityStatusLabel(status, 0)).toBe(label);
  });
});

it("keeps explicitly opened command output visible when execution completes", async () => {
  const user = userEvent.setup();
  const view = render(<CommandsGroup commands={[command]} />);
  await user.click(screen.getByText("Output"));
  view.rerender(
    <CommandsGroup
      commands={[{ ...command, status: "completed", output: "final output" }]}
    />,
  );
  expect(screen.getByText("final output")).toBeVisible();
});
