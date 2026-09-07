export type BrowserRuntimeStatus = {
  status: "available" | "unavailable" | "unknown";
  message: string;
};

type McpServerStatus = {
  name: string;
  pluginId?: string | null;
  runtimeStatus?: string | null;
  tools?: Record<string, unknown>;
};

export type BrowserMcpStatusPage = {
  data: McpServerStatus[];
  nextCursor?: string | null;
};

export async function loadBrowserRuntimeStatus(
  readPage: (cursor: string | null) => Promise<BrowserMcpStatusPage>,
): Promise<BrowserRuntimeStatus> {
  const servers: McpServerStatus[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await readPage(cursor);
    if (!Array.isArray(page?.data)) {
      throw new Error("Codex returned an invalid browser runtime status.");
    }
    servers.push(...page.data);
    cursor = page.nextCursor ?? null;
    if (cursor !== null) {
      if (cursors.has(cursor) || cursors.size >= 100) {
        throw new Error("Codex returned incomplete browser runtime status.");
      }
      cursors.add(cursor);
    }
  } while (cursor !== null);

  const runtime = servers.find((server) =>
    server.name === "cua_repl" &&
    (!server.pluginId || server.pluginId === "unified-computer-use@openai-bundled"),
  );
  if (!runtime) {
    return {
      status: "unknown",
      message: "This account does not report the current browser runtime. Check that Unified Computer Use is enabled in Codex, then retry.",
    };
  }
  if (["failed", "cancelled", "disabled", "authenticationRequired"].includes(runtime.runtimeStatus ?? "")) {
    return {
      status: "unavailable",
      message: `The browser runtime for this account is ${runtime.runtimeStatus}. Reconnect the account in Codex, then retry.`,
    };
  }
  if (runtime.runtimeStatus === "starting" || runtime.runtimeStatus === "notStarted" || !runtime.tools?.js) {
    return {
      status: "unknown",
      message: "The browser runtime has not made its tools available yet. Retry once it has started.",
    };
  }
  // A profile inventory can expose tools without a thread-runtime connection.
  // Do not claim that an IAB backend is connected or launch one from Settings.
  return {
    status: "available",
    message: "Browser tools are available for this account. The in-app browser connection is checked when a task uses it.",
  };
}
