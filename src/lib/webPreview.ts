import type { CodexMessage } from "../types";

const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)?)|\u009b[0-?]*[ -/]*[@-~]/g;
const LOCAL_URL_PATTERN =
  /https?:\/\/(?:localhost|(?:[a-z0-9-]+\.)+localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[(?:::1|::)\])(?::\d{1,5})?(?:\/[^\s"'<>]*)?/gi;
const READY_LINE_PATTERN =
  /\b(?:local|ready|running|serving|listening|available|started)\b/i;
const FAILURE_LINE_PATTERN =
  /\b(?:failed|failure|error|eperm|eacces|eaddrinuse|could(?:n't| not) connect|connection refused)\b/i;
const COMMAND_OUTPUT_TAIL_LIMIT = 16_384;

export type RunWebPreviewAvailability =
  | "available"
  | "unavailable"
  | "unchecked";

export type RunWebPreview = {
  version: 1;
  url: string;
  origin: string;
  detectedAt: string;
  sourceCommandId: string;
  availability: RunWebPreviewAvailability;
};

export type PersistedRunWebPreview = RunWebPreview;

export type LocalWebPreviewProbeResult = {
  normalizedUrl: string;
  reachable: boolean;
};

export type WebPreviewCommandSignal = {
  commandId: string;
  command: string;
  outputDelta: string;
  completed: boolean;
};

export function commandOutputTail(current: string, delta: string) {
  const next = `${current}${delta}`.replace(ANSI_ESCAPE_PATTERN, "");
  return next.length <= COMMAND_OUTPUT_TAIL_LIMIT
    ? next
    : next.slice(next.length - COMMAND_OUTPUT_TAIL_LIMIT);
}

export function readWebPreviewCommandSignal(
  message: CodexMessage,
): WebPreviewCommandSignal | null {
  const params = readObject(message.params);
  const item = readObject(params.item);
  const itemType = readString(item.type);
  const method = message.method ?? "";
  const isCommandItem =
    itemType === "commandExecution" || itemType === "command";
  const isCommandMethod =
    method === "item/started" ||
    method === "item/completed" ||
    method === "item/commandExecution/started" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/commandExecution/completed" ||
    method === "command/exec/started" ||
    method === "command/exec/outputDelta" ||
    method === "command/exec/completed";

  if (!isCommandMethod || ((method === "item/started" || method === "item/completed") && !isCommandItem)) {
    return null;
  }

  const commandId =
    readString(params.itemId) ??
    readString(params.commandId) ??
    readString(params.id) ??
    readString(item.id);
  if (!commandId) return null;

  return {
    commandId,
    command: readCommand(params.command ?? item.command),
    outputDelta:
      readString(params.delta) ??
      readString(params.output) ??
      readString(item.aggregatedOutput) ??
      "",
    completed:
      method === "item/completed" ||
      method === "item/commandExecution/completed" ||
      method === "command/exec/completed",
  };
}

export function extractLocalWebPreviewCandidates(input: {
  command: string;
  output: string;
}) {
  const output = input.output.replace(ANSI_ESCAPE_PATTERN, "");
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | null) => {
    const normalized = candidate ? normalizeLocalWebPreviewUrl(candidate) : null;
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  output.split(/\r?\n/).forEach((line) => {
    if (FAILURE_LINE_PATTERN.test(line)) return;
    const matches = line.match(LOCAL_URL_PATTERN) ?? [];
    if (READY_LINE_PATTERN.test(line)) {
      matches.forEach(add);
      const readyPort = extractPortFromReadyLine(line);
      if (readyPort) {
        add(`http://localhost:${readyPort}/`);
      }
    }
    const servingMatch = line.match(
      /Serving HTTP on\s+(?:(?:0\.0\.0\.0|::|\[::\]|localhost|127(?:\.\d{1,3}){3})\s+)?port\s+(\d{1,5})/i,
    );
    if (servingMatch) {
      add(`http://localhost:${servingMatch[1]}/`);
    }
  });

  extractCandidateFromKnownServerCommand(input.command).forEach(add);
  return candidates;
}

function extractPortFromReadyLine(line: string) {
  const explicitPort = line.match(/\bport\s*(?:=|:)?\s*(\d{2,5})\b/i);
  if (explicitPort) return explicitPort[1];

  const listenerPort = line.match(
    /\b(?:listening|serving|running|available|started|ready)\b[^0-9\r\n]{0,48}\b(?:on|at)\s+(?:(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1?\]?)\s*:\s*)?(\d{2,5})\b/i,
  );
  return listenerPort?.[1] ?? null;
}

export function normalizeLocalWebPreviewUrl(value: string) {
  try {
    const url = new URL(value.trim().replace(/[),.;]+$/, ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!isAllowedLocalHostname(url.hostname)) return null;

    if (url.hostname === "0.0.0.0" || url.hostname === "[::]" || url.hostname === "::") {
      url.hostname = "localhost";
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parsePersistedRunWebPreview(
  value: string | null | undefined,
): RunWebPreview | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedRunWebPreview>;
    const url = normalizeLocalWebPreviewUrl(
      typeof parsed.url === "string" ? parsed.url : "",
    );
    if (
      parsed.version !== 1 ||
      !url ||
      typeof parsed.detectedAt !== "string" ||
      typeof parsed.sourceCommandId !== "string"
    ) {
      return null;
    }
    return {
      version: 1,
      url,
      origin: new URL(url).origin,
      detectedAt: parsed.detectedAt,
      sourceCommandId: parsed.sourceCommandId,
      availability:
        parsed.availability === "available" ||
        parsed.availability === "unavailable"
          ? parsed.availability
          : "unchecked",
    };
  } catch {
    return null;
  }
}

export function serializeRunWebPreview(preview: RunWebPreview) {
  return JSON.stringify({
    version: 1,
    url: preview.url,
    origin: preview.origin,
    detectedAt: preview.detectedAt,
    sourceCommandId: preview.sourceCommandId,
    availability: preview.availability,
  } satisfies PersistedRunWebPreview);
}

function extractCandidateFromKnownServerCommand(command: string) {
  if (!command || FAILURE_LINE_PATTERN.test(command)) return [];
  const knownServer =
    /\b(?:vite|next\s+dev|webpack(?:-dev-server)?|react-scripts\s+start|python(?:3)?\s+-m\s+http\.server|uvicorn|flask\s+run|rails\s+server|npm\s+(?:run\s+)?(?:dev|start)|pnpm\s+(?:dev|start)|yarn\s+(?:dev|start))\b/i.test(
      command,
    );
  if (!knownServer) return [];

  const explicit = command.match(LOCAL_URL_PATTERN) ?? [];
  const portMatch =
    command.match(/(?:--port|-p|--listen|-l)\s*(?:=|\s)\s*(\d{2,5})\b/i) ??
    command.match(/\bhttp\.server\s+(\d{2,5})\b/i) ??
    command.match(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1?\]?):(\d{2,5})\b/i);
  return portMatch
    ? [...explicit, `http://localhost:${portMatch[1]}/`]
    : explicit;
}

function isAllowedLocalHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 127
  );
}

function readCommand(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === "string").join(" ");
  }
  const command = readObject(value);
  return (
    readString(command.command) ??
    readString(command.cmd) ??
    readString(command.text) ??
    readString(command.shellCommand) ??
    ""
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}
