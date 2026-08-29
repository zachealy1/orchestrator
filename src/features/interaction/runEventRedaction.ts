type InteractionRunEventContext = {
  browserEnabled: boolean;
  desktopEnabled: boolean;
  eventType?: string;
  method?: string | null;
};

type JsonObject = Record<string, unknown>;

const INTERACTION_SERVERS = new Set([
  "browser",
  "chrome",
  "computer-use",
  "node-repl",
  "playwright",
  "sky",
]);

/**
 * Produces the database projection for a Codex run event. The in-memory event
 * remains untouched so the transcript and live interaction UI still receive
 * the complete provider response.
 */
export function redactInteractionRunEvent(
  payload: unknown,
  context: InteractionRunEventContext,
): unknown {
  if (!context.browserEnabled && !context.desktopEnabled) return payload;
  const root = asObject(payload);
  const params = asObject(root?.params);
  const item = asObject(params?.item);
  const method = readString(root?.method) ?? context.method ?? undefined;
  if (context.eventType === "process") {
    return compactObject({
      status: safeProviderIdentifier(asObject(payload)?.status),
      redacted: true,
    });
  }
  const interactionRequest =
    context.eventType === "server-request" ||
    (context.eventType === "client-action" &&
      context.method === "serverRequest/resolved");
  if (!interactionRequest && !isInteractionEvent(method, params, item, context)) {
    return payload;
  }

  return compactObject({
    method,
    id: readPrimitive(root?.id),
    requestToken: readPrimitive(root?.requestToken),
    params: compactObject({
      threadId: readPrimitive(params?.threadId),
      turnId: readPrimitive(params?.turnId),
      itemId: readPrimitive(params?.itemId),
      requestId: readPrimitive(params?.requestId),
      item: item
        ? compactObject({
            id: readPrimitive(item.id),
            type: readPrimitive(item.type),
            server: safeProviderIdentifier(item.server),
            tool: safeProviderIdentifier(item.tool),
            status: readPrimitive(item.status),
            durationMs: readPrimitive(item.durationMs),
          })
        : undefined,
      redacted: true,
    }),
  });
}

function isInteractionEvent(
  method: string | undefined,
  params: JsonObject | null,
  item: JsonObject | null,
  context: InteractionRunEventContext,
) {
  const server = normalizeIdentifier(
    readString(item?.server) ?? readString(params?.server),
  );
  if (server && INTERACTION_SERVERS.has(server)) return true;

  const type = normalizeIdentifier(
    readString(item?.type) ?? readString(params?.type),
  );
  if (
    context.desktopEnabled &&
    (type?.includes("computer") || type?.includes("desktop"))
  ) {
    return true;
  }

  const normalizedMethod = method?.toLowerCase() ?? "";
  if (
    context.browserEnabled &&
    (normalizedMethod.includes("browser") ||
      normalizedMethod.includes("playwright"))
  ) {
    return true;
  }
  if (
    context.desktopEnabled &&
    (normalizedMethod.includes("computer") ||
      normalizedMethod.includes("desktop"))
  ) {
    return true;
  }

  // Progressive MCP events can carry arguments or result fragments without
  // repeating the server name. During an interaction session, persist only
  // their lifecycle metadata.
  return (
    normalizedMethod.includes("mcptoolcall") ||
    normalizedMethod.includes("mcp_tool_call")
  );
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function compactObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function readPrimitive(value: unknown) {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? value
    : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeIdentifier(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/_/gu, "-");
}

function safeProviderIdentifier(value: unknown) {
  const normalized = normalizeIdentifier(readString(value));
  return normalized?.replace(/[^a-z0-9.:-]/gu, "-").slice(0, 80);
}
