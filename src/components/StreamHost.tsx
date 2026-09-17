import { createContext, useContext, useMemo, useRef, type PropsWithChildren, type ReactNode } from "react";
import { commands } from "../generated/tauri";
import { codexDefaultProfileRpc, codexRpc } from "../codexClient";
import { object, string, type StreamActivity } from "../lib/streamActivity";
import { useOptionalAppServices } from "../runtime/AppServices";
import { AsyncResourceCache } from "../shared/cache/AsyncResourceCache";
import { BoundedLruCache } from "../shared/cache/BoundedLruCache";

export type StreamHost = {
  profileKey: string; threadId: string; turnId: string;
  readDetails: (activity: StreamActivity) => Promise<unknown>;
  readResource: (activity: StreamActivity, uri: string) => Promise<unknown>;
  callTool: (activity: StreamActivity, name: string, args: unknown) => Promise<unknown>;
  draft?: (text: string) => void;
  inspectSubagent?: (threadId: string) => void;
  disclosures?: BoundedLruCache<string, boolean>;
  notifyLayoutChange?: () => void;
};
export const StreamHostContext = createContext<StreamHost | null>(null);
const PlanContext = createContext<ReactNode>(null);
export const useStreamPlan = () => useContext(PlanContext);
export const useStreamHost = () => useContext(StreamHostContext);

export function StreamHostProvider({ profileKey, threadId, turnId, runId = null, onDraft, onInspectSubagent, planView, children }: PropsWithChildren<{
  profileKey: string; threadId: string | null; turnId: string | null; runId?: number | null; onDraft?: (text: string) => void;
  onInspectSubagent?: (profileKey: string, threadId: string) => void; planView?: ReactNode;
}>) {
  const services = useOptionalAppServices();
  const local = useRef({ details: new AsyncResourceCache<string, unknown>(50), disclosures: new BoundedLruCache<string, boolean>(300) });
  const callbacks = useRef({ onDraft, onInspectSubagent }); callbacks.current = { onDraft, onInspectSubagent };
  const host = useMemo<StreamHost | null>(() => {
    if (!threadId || !turnId || !/^(default|account:[1-9]\d*)$/.test(profileKey)) return null;
    const rpc = (method: string, params: unknown): Promise<unknown> => profileKey === "default" ? codexDefaultProfileRpc(method, params) : codexRpc(Number(profileKey.slice(8)), method, params);
    const scopedTool = (activity: StreamActivity) => {
      if (activity.threadId && activity.threadId !== threadId) throw new Error("Activity belongs to another task");
      if (activity.payload.kind !== "tool" || !activity.payload.server) throw new Error("Tool resource is unavailable");
      return activity.payload;
    };
    return { profileKey, threadId, turnId, draft: onDraft ? text => callbacks.current.onDraft?.(text) : undefined,
      inspectSubagent: onInspectSubagent ? id => callbacks.current.onInspectSubagent?.(profileKey, id) : undefined,
      disclosures: services?.activityDisclosures ?? local.current.disclosures,
      notifyLayoutChange: () => services?.transcriptGeometry.invalidateActivityGeometry(),
      readDetails: a => {
        if (a.threadId && a.threadId !== threadId) return Promise.reject(new Error("Activity belongs to another task"));
        return (services?.activityDetails ?? local.current.details).getOrLoad(JSON.stringify([profileKey, runId, threadId, a.turnId ?? turnId, a.id, a.status]), () => commands.codexActivityItemRead(profileKey, runId, threadId, a.turnId ?? turnId, a.id));
      },
      readResource: (a, uri) => {
        const tool = scopedTool(a);
        return rpc("mcpServer/resource/read", { threadId, originCallId: a.id, server: tool.server, uri, ...(string(tool.appContext.connectorId) ? { connectorId: tool.appContext.connectorId } : {}) });
      },
      callTool: async (a, name, args) => {
        const tool = scopedTool(a);
        const response = await rpc("mcpServer/tool/call", { threadId, server: tool.server, tool: name, arguments: object(args) });
        return object(response).result ?? response;
      },
    };
  }, [profileKey, threadId, turnId, runId, services, Boolean(onDraft), Boolean(onInspectSubagent)]);
  return <StreamHostContext.Provider value={host}><PlanContext.Provider value={planView}>{children}</PlanContext.Provider></StreamHostContext.Provider>;
}
