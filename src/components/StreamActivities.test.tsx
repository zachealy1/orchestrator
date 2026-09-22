import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StreamActivities } from "./StreamActivities";
import { StreamHostContext, type StreamHost } from "./StreamHost";
import { activityContent, emptyActivityStore, reduceStreamActivity } from "../lib/streamActivity";
import { ActivityResult } from "./ActivityResult";
import { BoundedLruCache } from "../shared/cache/BoundedLruCache";
import { ActivityDisclosure, ActivityTimeline, attentionTimelineItems } from "./TranscriptActivity";

const activity = (type: string, fields: Record<string, unknown> = {}) => {
  const state = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { id: "a", type, ...fields } } }, { threadId: "t", turnId: "u" });
  return state.byKey[state.order[0]];
};

describe("mixed activity presentation", () => {
  it.each([
    ["inProgress", "Compacting context"], ["completed", "Context compacted"], ["failed", "Failed: Context compaction"],
  ])("renders %s compaction once without disclosure semantics, even in a collapsed trace", (status, label) => {
    const a = activity("contextCompaction", { status, ...(status === "failed" ? { error: { message: "Original context retained" } } : { message: label }) });
    const items = [{ kind: "activities" as const, id: "compaction", activities: [a] }];
    const view = render(<ActivityDisclosure active={false} label="Worked" attention={<ActivityTimeline items={attentionTimelineItems(items)} />}><ActivityTimeline items={items} /></ActivityDisclosure>);
    expect(screen.getAllByText(label)).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(view.container.querySelector("[data-activity-id] summary, [data-activity-id] button, [data-activity-id] details")).toBeNull();
    if (status === "failed") expect(screen.getByText("Original context retained")).toBeVisible();
  });
  it("restores an explicitly opened trace after a virtualized remount", async () => {
    const host: StreamHost = { profileKey: "default", threadId: "t", turnId: "u", readResource: vi.fn(), callTool: vi.fn(), readDetails: vi.fn(), disclosures: new BoundedLruCache(10) };
    const body = (threadId = "t") => <StreamHostContext.Provider value={{ ...host, threadId }}><ActivityDisclosure active={false} label="Worked"><p>Details</p></ActivityDisclosure></StreamHostContext.Provider>;
    const view = render(body());
    await userEvent.click(screen.getByLabelText("Run trace"));
    expect(await screen.findByText("Details")).toBeVisible();
    view.unmount(); const restored = render(body());
    expect(screen.getByText("Details")).toBeVisible();
    restored.rerender(body("another-thread"));
    expect(screen.queryByText("Details")).toBeNull();
  });
  it("retains explicit output expansion as a running command joins the completed group", async () => {
    const a = activity("commandExecution", { command: "cat src/a", cwd: "/worktree", aggregatedOutput: "file contents", commandActions: [{ type: "read", path: "src/a" }] });
    const view = render(<StreamActivities activities={[{ ...a, status: "running", label: "Reading src/a" }]} active />);
    await userEvent.click(screen.getByText("Reading src/a"));
    await screen.findByText("file contents");
    view.rerender(<StreamActivities activities={[a]} />);
    await waitFor(() => expect(screen.getByText("file contents")).toBeVisible());
    expect(screen.getByText("Read files")).toBeVisible();
    expect(screen.getByRole("link", { name: "src/a" })).toHaveAttribute("href", "/worktree/src/a");
    expect(screen.getAllByText("$ cat src/a")).toHaveLength(1);
  });
  it("loads deferred details only on disclosure, and caches expansion through remount", async () => {
    const a = activity("commandExecution", { command: "test", detailsDeferred: true });
    const host: StreamHost = { profileKey: "default", threadId: "t", turnId: "u", readResource: vi.fn(), callTool: vi.fn(),
      disclosures: new BoundedLruCache(10), readDetails: vi.fn().mockResolvedValue({ id: "a", type: "commandExecution", command: "test", status: "completed", aggregatedOutput: "Restored output" }) };
    const body = <StreamHostContext.Provider value={host}><StreamActivities activities={[a]} /></StreamHostContext.Provider>;
    const view = render(body);
    expect(host.readDetails).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Ran commands"));
    await userEvent.click(screen.getByText("Ran test"));
    await screen.findByText("Restored output");
    expect(host.readDetails).toHaveBeenCalledTimes(1);
    view.rerender(body);
    expect(host.readDetails).toHaveBeenCalledTimes(1);
    view.unmount(); render(body);
    await waitFor(() => expect(screen.getByText("Restored output")).toBeVisible());
  });
  it("distinguishes unavailable output and keeps failures exposed", async () => {
    const a = activity("commandExecution", { status: "failed", command: "test", detailsAvailable: false });
    render(<StreamActivities activities={[a]} />);
    expect(screen.queryByText("Ran commands")).toBeNull();
    await userEvent.click(screen.getByText("Failed: Ran test"));
    expect(await screen.findByText("Details unavailable")).toBeVisible();
    expect(screen.queryByText("No output")).toBeNull();
  });
  it("keeps artifacts standalone and renders unsupported formats as actionable cards", async () => {
    const a = activity("mcpToolCall", { server: "files", tool: "make", result: { content: [{ type: "resource_link", uri: "https://example.com/report.docx", name: "Report", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }] } });
    const onOpen = vi.fn().mockReturnValue(true);
    render(<StreamActivities activities={[a]} onOpen={onOpen} />);
    expect(screen.queryByText("Used tools")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Report" }));
    expect(onOpen).toHaveBeenCalledWith("https://example.com/report.docx");
  });
  it("uses sanitized content and rejects unsafe image and link protocols", async () => {
    render(<ActivityResult content={[...activityContent([{ type: "text", text: "<script>alert(1)</script>\n\n**Safe text**" }]), { type: "image", url: "javascript:alert(1)" }, { type: "resource", uri: "javascript:alert(2)", name: "Unsafe link" }, { type: "json", value: { count: 3 } }]} />);
    expect(document.querySelector(".activity-results script")).toBeNull();
    expect(screen.getByText("Safe text")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Unsafe link" })).toBeNull();
    expect(await screen.findByText("Image preview unavailable")).toBeVisible();
    expect(screen.getByText("Structured result")).toBeVisible();
  });
});
