import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StreamHostProvider, useStreamHost } from "./StreamHost";
import { emptyActivityStore, reduceStreamActivity } from "../lib/streamActivity";
import type { PropsWithChildren } from "react";

const rpc = vi.hoisted(() => ({ account: vi.fn().mockResolvedValue({ contents: [] }), shared: vi.fn(), detail: vi.fn().mockResolvedValue({ id: "tool" }) }));
vi.mock("../codexClient", async original => ({ ...await original<typeof import("../codexClient")>(), codexRpc: rpc.account, codexDefaultProfileRpc: rpc.shared }));
vi.mock("../generated/tauri", () => ({ commands: { codexActivityItemRead: rpc.detail } }));
const store = reduceStreamActivity(emptyActivityStore, { method: "item/completed", params: { item: { id: "tool", type: "mcpToolCall", server: "server", appContext: { connectorId: "connector", resourceUri: "ui://app" } } } }, { threadId: "thread", turnId: "original-turn" });
const activity = store.byKey[store.order[0]];
const wrapper = ({ children }: PropsWithChildren) => <StreamHostProvider profileKey="account:7" threadId="thread" turnId="latest-turn" runId={22}>{children}</StreamHostProvider>;

describe("origin-scoped activity host", () => {
  it("keeps account, thread, server, connector and originating call on resource reads", async () => {
    const { result } = renderHook(useStreamHost, { wrapper });
    await result.current!.readResource(activity, "resource://report");
    expect(rpc.account).toHaveBeenCalledWith(7, "mcpServer/resource/read", { threadId: "thread", server: "server", connectorId: "connector", originCallId: "tool", uri: "resource://report" });
    expect(rpc.shared).not.toHaveBeenCalled();
    expect(() => result.current!.readResource({ ...activity, threadId: "foreign" }, "resource://report")).toThrow("another task");
  });
  it("loads and caches details using the activity's original turn", async () => {
    rpc.detail.mockClear();
    const { result } = renderHook(useStreamHost, { wrapper });
    await Promise.all([result.current!.readDetails(activity), result.current!.readDetails(activity)]);
    expect(rpc.detail).toHaveBeenCalledExactlyOnceWith("account:7", 22, "thread", "original-turn", "tool");
    await expect(result.current!.readDetails({ ...activity, threadId: "foreign" })).rejects.toThrow("another task");
  });
  it("routes tool actions only to the originating server and rejects foreign activity", async () => {
    const { result } = renderHook(useStreamHost, { wrapper });
    await result.current!.callTool(activity, "update", { value: 1 });
    expect(rpc.account).toHaveBeenCalledWith(7, "mcpServer/tool/call", { threadId: "thread", server: "server", tool: "update", arguments: { value: 1 } });
    await expect(result.current!.callTool({ ...activity, threadId: "foreign" }, "update", {})).rejects.toThrow("another task");
  });
});
