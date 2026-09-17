import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityResult } from "./ActivityResult";
import { StreamHostContext, type StreamHost } from "./StreamHost";
import { emptyActivityStore, reduceStreamActivity } from "../lib/streamActivity";
import type { ActivityResource } from "../lib/activityPreview";
import { commands } from "../generated/tauri";

vi.mock("../generated/tauri", () => ({ commands: { saveActivityResource: vi.fn().mockResolvedValue(null) } }));
const base: ActivityResource = { type: "resource", uri: "resource://report", name: "Report" };
const store = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { id: "call", type: "mcpToolCall", server: "files", tool: "report" } } }, { threadId: "thread", turnId: "turn" });
const activity = store.byKey[store.order[0]];
function host(readResource: StreamHost["readResource"]): StreamHost {
  return { profileKey: "default", threadId: "thread", turnId: "turn", readResource, readDetails: vi.fn(), callTool: vi.fn() };
}
function body(resource: ActivityResource, scope: StreamHost | null = null) {
  return <StreamHostContext.Provider value={scope}><ActivityResult content={[resource]} activity={activity} /></StreamHostContext.Provider>;
}

describe("artifact preview controls", () => {
  it("previews embedded text using an icon-only control without availability captions", async () => {
    render(body({ ...base, text: "**Recorded result**" }));
    const button = screen.getByRole("button", { name: "Preview" });
    expect(button).toHaveAttribute("data-tooltip", "Preview");
    expect(button.textContent).toBe("");
    expect(screen.queryByText(/Preview available|Preview on demand|Preview unavailable/)).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByText("Recorded result")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByText("Recorded result")).toBeNull();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });
  it("shows markup resources as inert source rather than an empty or executable preview", async () => {
    const view = render(body({ ...base, mimeType: "text/html", text: "<script>danger()</script><p>HTML source</p>" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("<script>danger()</script><p>HTML source</p>")).toBeVisible();
    expect(view.container.querySelector("script")).toBeNull();
  });
  it.each(["image/png", "audio/mpeg", "video/mp4", "application/json"])("offers supplied %s content", async mimeType => {
    const view = render(body({ ...base, mimeType, blob: btoa("content") }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("button", { name: "Hide preview" })).toBeVisible();
    if (mimeType === "image/png") expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,Y29udGVudA==");
    else if (mimeType === "application/json") expect(screen.getByText("content")).toBeVisible();
    else expect(view.container.querySelector(mimeType.startsWith("audio") ? "audio" : "video")).not.toBeNull();
  });
  it("reads supported metadata on demand only on request, using the originating activity", async () => {
    let resolve!: (value: unknown) => void;
    const read = vi.fn(() => new Promise(r => { resolve = r; }));
    const scope = host(read);
    const resource = { ...base, mimeType: "text/markdown" };
    render(body(resource, scope));
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(read).toHaveBeenCalledWith(activity, base.uri);
    resolve({ contents: [{ uri: base.uri, text: "Loaded preview" }] });
    expect(await screen.findByText("Loaded preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(commands.saveActivityResource).toHaveBeenCalledWith("Report", "Loaded preview", null));
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/svg+xml", undefined])("keeps download independent for unsupported %s metadata", async mimeType => {
    const read = vi.fn().mockResolvedValue({ contents: [{ uri: base.uri, blob: "ZmlsZQ==", mimeType }] });
    render(body({ ...base, mimeType }, host(read)));
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(commands.saveActivityResource).toHaveBeenCalledWith("Report", null, "ZmlsZQ=="));
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("hides unavailable controls and their action row while retaining an external open link", () => {
    const view = render(body({ ...base, uri: "https://example.com/report.pdf", mimeType: "application/pdf" }));
    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute("href", "https://example.com/report.pdf");
    expect(screen.queryByRole("button")).toBeNull();
    expect(view.container.querySelector(".activity-artifact-actions")).toBeNull();
  });
  it.each([
    { contents: [] },
    { contents: [{ uri: "resource://another", text: "Wrong resource" }] },
    { contents: [{ uri: base.uri }] },
    { contents: [{ uri: base.uri, mimeType: "application/pdf", blob: "ZmlsZQ==" }] },
  ])("hides preview after missing or unsupported resource content", async response => {
    const scope = host(vi.fn().mockResolvedValue(response));
    render(body({ ...base, mimeType: "text/plain" }, scope));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("status")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByText("Wrong resource")).toBeNull();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });
  it("shows read failures and clears stale preview/error state when a resource changes", async () => {
    const scope = host(vi.fn().mockRejectedValue(new Error("Resource not found")));
    const view = render(body({ ...base, mimeType: "text/plain" }, scope));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Resource not found");
    view.rerender(body({ ...base, text: "Updated result" }, scope));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Updated result")).toBeVisible();
    view.rerender(body({ ...base, text: "New result" }, scope));
    expect(screen.queryByText("Updated result")).toBeNull();
  });
  it("does not add an empty result block to the stream", () => {
    const view = render(<ActivityResult content={[]} />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
