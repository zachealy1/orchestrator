#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import net from "node:net";
import process from "node:process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOOL_SCHEMAS = {
  browser_navigate: objectSchema({ url: stringProperty("URL to navigate to") }, ["url"]),
  browser_navigate_back: objectSchema(),
  browser_snapshot: objectSchema(),
  browser_take_screenshot: objectSchema(),
  browser_click: objectSchema({ ref: stringProperty("Element reference from browser_snapshot") }, ["ref"]),
  browser_type: objectSchema({
    ref: stringProperty("Element reference from browser_snapshot"),
    text: stringProperty("Text to type"),
  }, ["ref", "text"]),
  browser_fill_form: objectSchema({
    fields: {
      type: "array",
      items: objectSchema({
        ref: stringProperty("Field reference"),
        value: stringProperty("Field value"),
        name: stringProperty("Safe field label"),
      }, ["ref", "value"]),
    },
  }, ["fields"]),
  browser_press_key: objectSchema({ key: stringProperty("Key or key chord") }, ["key"]),
  browser_console_messages: objectSchema(),
  browser_network_requests: objectSchema(),
  browser_wait_for: objectSchema({ time: { type: "number", minimum: 0, maximum: 10 } }),
  browser_resize: objectSchema({
    width: { type: "number", minimum: 320, maximum: 3840 },
    height: { type: "number", minimum: 240, maximum: 2160 },
  }, ["width", "height"]),
  browser_tabs: objectSchema({
    action: { type: "string", enum: ["list", "new", "select", "close"] },
    index: { type: "number", minimum: 0 },
  }),
};

const SENSITIVE_TOOLS = new Set([
  "browser_click",
  "browser_fill_form",
  "browser_press_key",
  "browser_type",
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(argument.slice(2), next);
      index += 1;
    }
  }
  return values;
}

const options = parseArguments(process.argv.slice(2));
const sessionToken = options.get("session-token");
const entryId = options.get("entry-id");
const bridgeSocket = options.get("bridge-socket");
const bridgeSecret = options.get("bridge-secret");
const groupKey = options.get("group-key");
const groupTitle = options.get("group-title") ?? "Orchestrator";
const accessMode = options.get("access-mode") ?? "ask-for-approval";

if (!sessionToken || !entryId || !bridgeSocket || !bridgeSecret || !groupKey) {
  process.stderr.write("Orchestrator default-browser MCP is missing its scoped configuration.\n");
  process.exit(2);
}

const approvedOrigins = new Set();
const server = new Server(
  { name: "orchestrator-default-browser", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(TOOL_SCHEMAS).map(([name, inputSchema]) => ({
    name,
    description: toolDescription(name),
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  if (!(name in TOOL_SCHEMAS)) {
    throw new Error("This browser capability is not available in Orchestrator.");
  }
  if (name === "browser_navigate") {
    const target = parseOrigin(args.url);
    if (target.kind === "blocked") throw new Error("This URL scheme is not supported.");
    if (target.kind === "external" && !approvedOrigins.has(target.origin)) {
      const accepted = await requestApproval("origin", target.origin, "navigate");
      if (!accepted) throw new Error("Browser navigation was denied.");
      approvedOrigins.add(target.origin);
    }
  }
  if (SENSITIVE_TOOLS.has(name) && isSensitiveAction(name, args)) {
    const inspection = await inspectSensitiveReferences(name, args);
    const accepted = await requestApproval(
      "sensitive-action",
      "the current page",
      inspection?.action ?? sensitiveActionLabel(name, args),
    );
    if (!accepted) throw new Error("Browser action was denied.");
  } else if (SENSITIVE_TOOLS.has(name)) {
    const inspection = await inspectSensitiveReferences(name, args);
    if (inspection?.sensitive) {
      const accepted = await requestApproval(
        "sensitive-action",
        "the current page",
        inspection.action,
      );
      if (!accepted) throw new Error("Browser action was denied.");
    }
  }
  return bridgeRequest("tool", {
    tool: name,
    arguments: args,
    groupKey,
    groupTitle,
    sessionToken,
    approvedOrigins: [...approvedOrigins],
  });
});

async function requestApproval(kind, origin, action) {
  if (accessMode === "full-access") return true;
  const response = await server.elicitInput({
    mode: "form",
    message:
      kind === "origin"
        ? `Allow the browser to access ${origin}?`
        : `Allow the browser to ${action}?`,
    requestedSchema: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          title: "Browser access",
          enum: ["allow"],
          enumNames: ["Allow for this turn"],
        },
      },
      required: ["decision"],
    },
    _meta: {
      "orchestrator/browser-approval": {
        version: 1,
        nonce: randomUUID(),
        sessionToken,
        entryId,
        kind,
        origin,
        action,
      },
    },
  });
  return response.action === "accept" && response.content?.decision === "allow";
}

function bridgeRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(bridgeSocket);
    const id = randomUUID();
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("The browser extension did not respond."));
    }, 30_000);
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ role: "client", secret: bridgeSecret })}\n`);
      socket.write(`${JSON.stringify({ id, action, ...payload })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      socket.end();
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        if (!response.ok) reject(new Error(response.error ?? "The browser request failed."));
        else resolve(response.result);
      } catch {
        reject(new Error("The browser extension returned an invalid response."));
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`The default-browser bridge is unavailable: ${error.message}`));
    });
  });
}

function parseOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return { kind: "blocked", origin: url.origin };
    const host = url.hostname.toLowerCase();
    const local = host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(host);
    return { kind: local ? "local" : "external", origin: url.origin };
  } catch {
    return { kind: "blocked", origin: null };
  }
}

function isSensitiveAction(name, args) {
  const descriptor = [
    args.element,
    args.key,
    ...(Array.isArray(args.fields) ? args.fields.map((field) => field?.name) : []),
  ].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return (
    (name === "browser_press_key" && /(?:meta|control)\+(?:c|v|x)\b/u.test(descriptor)) ||
    /(?:password|passcode|credential|sign[ -]?in|log[ -]?in|otp|verification code|payment|card number|cvv|cvc|purchase|checkout|download|upload|clipboard|browser permission)/u.test(descriptor)
  );
}

async function inspectSensitiveReferences(name, args) {
  const references = name === "browser_fill_form"
    ? (Array.isArray(args.fields) ? args.fields.map((field) => field?.ref) : [])
    : [args.ref];
  const validReferences = references.filter((reference) => typeof reference === "string");
  if (validReferences.length === 0) return null;
  const result = await bridgeRequest("inspect-action", {
    groupKey,
    groupTitle,
    sessionToken,
    references: validReferences,
  });
  if (!result?.sensitive) return { sensitive: false, action: "perform the requested action" };
  const actions = {
    credentials: "use a credential or verification control",
    payment: "use a payment or purchase control",
    upload: "upload a file",
    download: "download a file",
    "browser-permission": "grant a browser permission",
  };
  return {
    sensitive: true,
    action: actions[result.kind] ?? "perform the requested sensitive action",
  };
}

function sensitiveActionLabel(name, args) {
  const descriptor = JSON.stringify(args).toLowerCase();
  if (/download|export|save file/u.test(descriptor)) return "download a file";
  if (/upload/u.test(descriptor)) return "upload a file";
  if (/clipboard|meta\+|control\+/u.test(descriptor)) return "access the clipboard";
  if (name === "browser_type" || name === "browser_fill_form") return "enter sensitive information";
  return "perform the requested sensitive action";
}

function objectSchema(properties = {}, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function stringProperty(description) {
  return { type: "string", description };
}

function toolDescription(name) {
  const descriptions = {
    browser_navigate: "Navigate the controlled browser tab.",
    browser_navigate_back: "Go back in the controlled tab.",
    browser_snapshot: "Inspect the current page through its accessibility tree.",
    browser_take_screenshot: "Capture the visible page.",
    browser_click: "Click an element from a browser snapshot.",
    browser_type: "Type into an element from a browser snapshot.",
    browser_fill_form: "Fill multiple fields from a browser snapshot.",
    browser_press_key: "Send a keyboard key or chord.",
    browser_console_messages: "Read bounded console messages from the controlled tab.",
    browser_network_requests: "Read bounded network activity from the controlled tab.",
    browser_wait_for: "Wait briefly for the page to update.",
    browser_resize: "Resize the controlled browser window.",
    browser_tabs: "List, create, select, or close tabs in this chat's group.",
  };
  return descriptions[name];
}

async function detachAndExit() {
  await bridgeRequest("detach-session", { sessionToken }).catch(() => undefined);
  process.exit(0);
}

process.once("SIGINT", () => void detachAndExit());
process.once("SIGTERM", () => void detachAndExit());
process.once("SIGHUP", () => void detachAndExit());

await server.connect(new StdioServerTransport());
