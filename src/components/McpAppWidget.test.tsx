import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpAppWidget } from "./McpAppWidget";
import { StreamHostContext, type StreamHost } from "./StreamHost";
import { emptyActivityStore, reduceStreamActivity } from "../lib/streamActivity";

const mocks = vi.hoisted(() => ({ bridges: [] as Array<Record<string, any>>, create: vi.fn(), close: vi.fn() }));
vi.mock("../generated/tauri", () => ({ commands: { widgetSandboxCreate: mocks.create, widgetSandboxClose: mocks.close } }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, convertFileSrc: (path: string) => `orchestrator-widget://localhost/${encodeURIComponent(path)}` }));
vi.mock("@modelcontextprotocol/ext-apps/app-bridge", async importOriginal => {
  const original = await importOriginal<typeof import("@modelcontextprotocol/ext-apps/app-bridge")>();
  return { ...original, AppBridge: class {
    handlers: Record<string, (params?: unknown) => void> = {};
    connect = vi.fn().mockResolvedValue(undefined); close = vi.fn();
    sendSandboxResourceReady = vi.fn().mockResolvedValue(undefined);
    sendToolInput = vi.fn().mockResolvedValue(undefined); sendToolResult = vi.fn().mockResolvedValue(undefined);
    sendHostContextChange = vi.fn(); sendToolCancelled = vi.fn().mockResolvedValue(undefined);
    teardownResource = vi.fn().mockResolvedValue(undefined);
    constructor() { mocks.bridges.push(this); }
    addEventListener(name: string, fn: (params?: unknown) => void) { this.handlers[name] = fn; }
  } };
});

const state = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { id: "tool", type: "mcpToolCall", server: "app", tool: "report", arguments: { query: "x" }, appContext: { resourceUri: "ui://report" }, result: { content: [{ type: "text", text: "Result" }] } } } }, { threadId: "thread", turnId: "turn" });
const activity = state.byKey[state.order[0]];
let host: StreamHost;
beforeEach(() => {
  mocks.bridges.length = 0; mocks.create.mockReset().mockResolvedValue("token"); mocks.close.mockReset().mockResolvedValue(undefined);
  host = { profileKey: "default", threadId: "thread", turnId: "turn", readDetails: vi.fn(),
    readResource: vi.fn().mockResolvedValue({ contents: [{ mimeType: "text/html;profile=mcp-app", text: "<p>Widget</p>", _meta: { ui: { csp: { resourceDomains: ["https://cdn.example"] } } } }] }),
    callTool: vi.fn().mockResolvedValue({ content: [] }), draft: vi.fn() };
});
const body = (a = activity) => <StreamHostContext.Provider value={host}><McpAppWidget activity={a} /></StreamHostContext.Provider>;

describe("MCP app bridge lifecycle", () => {
  it("initializes from scoped resources, resizes, and never repeats a tool on restore", async () => {
    const view = render(body());
    await waitFor(() => expect(mocks.bridges).toHaveLength(1));
    const bridge = mocks.bridges[0];
    expect(host.readResource).toHaveBeenCalledWith(activity, "ui://report");
    expect(mocks.create).toHaveBeenCalledWith("<p>Widget</p>", { resourceDomains: ["https://cdn.example"] });
    await act(async () => { bridge.handlers.sandboxready(); bridge.handlers.initialized(); bridge.handlers.sizechange({ height: 470 }); });
    expect(bridge.sendToolInput).toHaveBeenCalledWith({ arguments: { query: "x" } });
    expect(bridge.sendToolResult).toHaveBeenCalled();
    expect(screen.getByTitle("Tool interface sandbox")).toHaveStyle({ height: "470px" });
    view.rerender(body({ ...activity }));
    expect(mocks.bridges).toHaveLength(1);
    expect(host.callTool).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(bridge.close).toHaveBeenCalled());
    expect(mocks.close).toHaveBeenCalledWith("token");
  });
  it("puts widget messages in the composer and gates tool actions on a host user action", async () => {
    render(body());
    await waitFor(() => expect(mocks.bridges).toHaveLength(1));
    const bridge = mocks.bridges[0];
    await bridge.onmessage({ content: [{ type: "text", text: "Follow up" }] });
    expect(host.draft).toHaveBeenCalledWith("Follow up");
    let request!: Promise<unknown>;
    act(() => { request = bridge.oncalltool({ name: "update", arguments: { x: 1 } }); });
    expect(host.callTool).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run tool" }));
    await act(async () => { await request; });
    expect(host.callTool).toHaveBeenCalledExactlyOnceWith(activity, "update", { x: 1 });
    expect(await bridge.onopenlink({ url: "javascript:alert(1)" })).toEqual({ isError: true });
  });
  it("cancels pending requests on teardown and notifies an interrupted tool", async () => {
    const view = render(body());
    await waitFor(() => expect(mocks.bridges).toHaveLength(1));
    const bridge = mocks.bridges[0];
    await act(async () => bridge.handlers.initialized());
    view.rerender(body({ ...activity, status: "interrupted" }));
    await waitFor(() => expect(bridge.sendToolCancelled).toHaveBeenCalledWith({ reason: "interrupted" }));
    let request!: Promise<unknown>;
    act(() => { request = bridge.oncalltool({ name: "mutate", arguments: {} }).catch((e: Error) => e.message); });
    view.unmount();
    expect(await request).toBe("Tool action cancelled");
    expect(host.callTool).not.toHaveBeenCalled();
  });
  it("falls back when HTML resources are unavailable", async () => {
    host.readResource = vi.fn().mockResolvedValue({ contents: [] });
    render(body());
    expect(await screen.findByText(/does not provide a compatible HTML interface/)).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(host.callTool).not.toHaveBeenCalled();
  });
  it("rejects messages from windows other than the owning sandbox", async () => {
    const { PostMessageTransport } = await import("@modelcontextprotocol/ext-apps/app-bridge");
    const iframe = document.createElement("iframe"); document.body.append(iframe);
    const transport = new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!);
    const receive = vi.fn(); transport.onmessage = receive; await transport.start();
    const data = { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 500 } };
    window.dispatchEvent(new MessageEvent("message", { source: window, data }));
    expect(receive).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent("message", { source: iframe.contentWindow, data }));
    expect(receive).toHaveBeenCalledOnce();
    await transport.close(); iframe.remove();
  });
});
