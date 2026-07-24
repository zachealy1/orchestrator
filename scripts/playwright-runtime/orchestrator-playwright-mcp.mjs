#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { createConnection } from "@playwright/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "playwright";

const ALLOWED_TOOLS = new Set([
  "browser_console_messages",
  "browser_navigate",
  "browser_navigate_back",
  "browser_network_requests",
  "browser_press_key",
  "browser_resize",
  "browser_snapshot",
  "browser_tabs",
  "browser_take_screenshot",
  "browser_wait_for",
  "browser_click",
  "browser_fill_form",
  "browser_type",
]);

const SENSITIVE_EXTERNAL_TOOLS = new Set([
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
    const separator = argument.indexOf("=");
    if (separator > 0) {
      values.set(argument.slice(2, separator), argument.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(argument.slice(2), next);
      index += 1;
    } else {
      values.set(argument.slice(2), "true");
    }
  }
  return values;
}

const argumentsMap = parseArguments(process.argv.slice(2));
const sessionToken = argumentsMap.get("session-token");
const entryId = argumentsMap.get("entry-id");
const stateFile = argumentsMap.get("state-file");
const browserExecutable = argumentsMap.get("browser-executable");
const outputDirectory = argumentsMap.get("output-dir");
const controlSocket = argumentsMap.get("control-socket");
const accessMode = argumentsMap.get("access-mode") ?? "ask-for-approval";

if (
  !sessionToken ||
  !entryId ||
  !stateFile ||
  !browserExecutable ||
  !outputDirectory ||
  !controlSocket
) {
  process.stderr.write(
    "Orchestrator Playwright MCP is missing its isolated session configuration.\n",
  );
  process.exit(2);
}

fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
process.chdir(outputDirectory);

const approvedOrigins = new Set();
const pendingOriginApprovals = new Map();
let connection;
let browserServer;
let browserConnection;
let browserContext;
let controlServer;
let closing = false;
let currentStatus = "ready";
let browserPid = null;

function writeState(status, extra = {}) {
  currentStatus = status;
  const directory = path.dirname(stateFile);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      {
        version: 1,
        sessionToken,
        entryId,
        wrapperPid: process.pid,
        browserPid,
        controlSocket,
        status,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  fs.renameSync(temporary, stateFile);
}

function startControlServer() {
  fs.mkdirSync(path.dirname(controlSocket), { recursive: true, mode: 0o700 });
  fs.rmSync(controlSocket, { force: true });
  controlServer = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffered = "";
    socket.on("data", (chunk) => {
      buffered += chunk;
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      const rawCommand = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      void handleControlCommand(rawCommand, socket);
    });
  });
  controlServer.listen(controlSocket);
}

async function handleControlCommand(rawCommand, socket) {
  let command;
  try {
    command = JSON.parse(rawCommand);
  } catch {
    socket.end('{"ok":false,"error":"Invalid browser control command."}\n');
    return;
  }
  if (command?.sessionToken !== sessionToken) {
    socket.end('{"ok":false,"error":"Browser session token mismatch."}\n');
    return;
  }
  if (command.action === "focus") {
    try {
      const page = browserContext?.pages().at(-1);
      if (!page) {
        socket.end('{"ok":false,"error":"The browser has not started yet."}\n');
        return;
      }
      await page.bringToFront();
      socket.end('{"ok":true}\n');
    } catch (error) {
      socket.end(
        `${JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
    }
    return;
  }
  if (command.action === "stop") {
    socket.end('{"ok":true}\n');
    await closeSession(0);
    return;
  }
  socket.end('{"ok":false,"error":"Unsupported browser control command."}\n');
}

function parseOrigin(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "blocked", origin: null };
  }
  if (["about:", "blob:", "data:"].includes(url.protocol)) {
    return { kind: "local", origin: url.origin };
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
    return { kind: "blocked", origin: url.origin };
  }
  const hostname = url.hostname.toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname);
  return {
    kind: loopback ? "local" : "external",
    origin: url.origin,
  };
}

function approvalMetadata(kind, origin, action) {
  return {
    "orchestrator/browser-approval": {
      version: 1,
      nonce: randomUUID(),
      sessionToken,
      entryId,
      kind,
      origin,
      action,
    },
  };
}

async function requestBrowserApproval(kind, origin, action) {
  if (accessMode === "full-access") return true;
  const previousStatus = currentStatus;
  writeState("awaiting-approval", { approvalKind: kind, origin });
  try {
    const result = await connection.elicitInput({
      mode: "form",
      message:
        kind === "origin"
          ? `Allow the browser to access ${origin}?`
          : `Allow the browser to ${action} on ${origin}?`,
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
      _meta: approvalMetadata(kind, origin, action),
    });
    return result.action === "accept" && result.content?.decision === "allow";
  } finally {
    writeState(browserContext ? "running" : previousStatus);
  }
}

async function ensureExternalOrigin(origin, action = "visit this origin") {
  if (accessMode === "full-access" || approvedOrigins.has(origin)) return true;
  const existing = pendingOriginApprovals.get(origin);
  if (existing) return existing;
  const approval = requestBrowserApproval("origin", origin, action).then(
    (accepted) => {
      if (accepted) approvedOrigins.add(origin);
      return accepted;
    },
  );
  pendingOriginApprovals.set(origin, approval);
  try {
    return await approval;
  } finally {
    pendingOriginApprovals.delete(origin);
  }
}

async function authorizeUrl(rawUrl, action) {
  const target = parseOrigin(rawUrl);
  if (target.kind === "blocked") return false;
  if (target.kind === "local" || !target.origin) return true;
  return ensureExternalOrigin(target.origin, action);
}

async function authorizeSensitiveTool(name, toolArguments) {
  if (accessMode === "full-access" || !SENSITIVE_EXTERNAL_TOOLS.has(name)) {
    return true;
  }
  const page = browserContext?.pages().at(-1);
  const target = page ? parseOrigin(page.url()) : null;
  if (!target || !target.origin) return true;
  const fieldNames = Array.isArray(toolArguments?.fields)
    ? toolArguments.fields.flatMap((field) =>
        typeof field?.name === "string" ? [field.name] : [],
      )
    : [];
  const descriptor = [
    toolArguments?.element,
    toolArguments?.key,
    ...fieldNames,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const accessesClipboard =
    name === "browser_press_key" &&
    /(?:meta|control)\+(?:c|v|x)\b/u.test(descriptor);
  const targetsSensitiveField =
    /(?:password|passcode|credential|sign[ -]?in|log[ -]?in|otp|one[ -]?time|verification code|payment|credit card|debit card|card number|cvv|cvc|security code|purchase|checkout|download|export|save file)/u.test(
      descriptor,
    );
  if (
    target.kind !== "external" &&
    !accessesClipboard &&
    !targetsSensitiveField
  ) {
    return true;
  }
  const labels = {
    browser_click: "click the requested element",
    browser_fill_form: "fill the requested form",
    browser_press_key: "send keyboard input",
    browser_type: "type into the requested field",
  };
  const action = accessesClipboard
    ? "access the system clipboard"
    : /(?:download|export|save file)/u.test(descriptor)
      ? "download a file"
    : targetsSensitiveField
      ? "interact with a sensitive field"
      : labels[name] ?? "perform this action";
  return requestBrowserApproval("sensitive-action", target.origin, action);
}

async function createBrowserContext() {
  if (browserContext) return browserContext;
  writeState("starting");
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  browserServer = await chromium.launchServer({
    executablePath: browserExecutable,
    headless: false,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
    ],
  });
  browserPid = browserServer.process()?.pid ?? null;
  browserConnection = await chromium.connect(browserServer.wsEndpoint());
  browserContext = await browserConnection.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: null,
  });
  await browserContext.route("**/*", async (route) => {
    const allowed = await authorizeUrl(
      route.request().url(),
      "load a resource from this origin",
    );
    if (allowed) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await browserContext.routeWebSocket("**/*", async (route) => {
    const allowed = await authorizeUrl(
      route.url(),
      "open a WebSocket to this origin",
    );
    if (allowed) {
      route.connectToServer();
    } else {
      await route.close({
        code: 1008,
        reason: "Browser origin approval was denied.",
      });
    }
  });
  browserConnection.on("disconnected", () => {
    browserContext = undefined;
    browserConnection = undefined;
    browserServer = undefined;
    browserPid = null;
    if (!closing) writeState("stopped");
  });
  writeState("running");
  return browserContext;
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

function hasSafeOutputFileArguments(toolArguments) {
  const filename = toolArguments?.filename;
  if (filename === undefined) return true;
  return (
    typeof filename === "string" &&
    filename.length > 0 &&
    filename.length <= 80 &&
    filename !== "." &&
    filename !== ".." &&
    path.basename(filename) === filename &&
    /^[a-zA-Z0-9._-]+$/u.test(filename)
  );
}

class PolicyTransport {
  constructor(inner) {
    this.inner = inner;
    this.listToolRequests = new Set();
  }

  async start() {
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (error) => this.onerror?.(error);
    this.inner.onmessage = (message, extra) => {
      void this.handleIncoming(message, extra);
    };
    await this.inner.start();
  }

  async handleIncoming(message, extra) {
    if (message?.method === "tools/list" && message.id !== undefined) {
      this.listToolRequests.add(String(message.id));
    }
    if (message?.method === "tools/call" && message.id !== undefined) {
      const name = message.params?.name;
      if (typeof name !== "string" || !ALLOWED_TOOLS.has(name)) {
        await this.inner.send(
          jsonRpcError(
            message.id,
            -32601,
            "This browser capability is not available in Orchestrator.",
          ),
        );
        return;
      }
      try {
        if (!hasSafeOutputFileArguments(message.params?.arguments)) {
          await this.inner.send(
            jsonRpcError(
              message.id,
              -32602,
              "Browser output filenames must stay inside the isolated session.",
            ),
          );
          return;
        }
        if (name === "browser_navigate") {
          const url = message.params?.arguments?.url;
          if (typeof url !== "string" || !(await authorizeUrl(url, "navigate"))) {
            await this.inner.send(
              jsonRpcError(message.id, -32001, "Browser navigation was denied."),
            );
            return;
          }
        }
        if (
          !(await authorizeSensitiveTool(name, message.params?.arguments ?? {}))
        ) {
          await this.inner.send(
            jsonRpcError(message.id, -32001, "Browser action was denied."),
          );
          return;
        }
      } catch (error) {
        await this.inner.send(
          jsonRpcError(
            message.id,
            -32000,
            error instanceof Error ? error.message : String(error),
          ),
        );
        return;
      }
    }
    this.onmessage?.(message, extra);
  }

  async send(message, options) {
    if (
      message?.id !== undefined &&
      this.listToolRequests.delete(String(message.id)) &&
      Array.isArray(message.result?.tools)
    ) {
      message = {
        ...message,
        result: {
          ...message.result,
          tools: message.result.tools.filter((tool) =>
            ALLOWED_TOOLS.has(tool.name),
          ),
        },
      };
    }
    await this.inner.send(message, options);
  }

  async close() {
    await this.inner.close();
  }
}

async function closeSession(exitCode = 0) {
  if (closing) return;
  closing = true;
  writeState("stopping");
  try {
    await browserContext?.close();
  } catch {
    // Best-effort cleanup continues below.
  }
  try {
    await browserConnection?.close();
  } catch {
    // Best-effort cleanup continues below.
  }
  try {
    await browserServer?.close();
  } catch {
    try {
      await browserServer?.kill();
    } catch {
      // The process may already have exited.
    }
  }
  try {
    await new Promise((resolve) => controlServer?.close(resolve));
  } catch {
    // The socket may already be closed.
  }
  fs.rmSync(controlSocket, { force: true });
  browserPid = null;
  writeState("stopped");
  setImmediate(() => process.exit(exitCode));
}

process.once("SIGINT", () => void closeSession(0));
process.once("SIGTERM", () => void closeSession(0));
process.once("SIGHUP", () => void closeSession(0));
process.once("uncaughtException", (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  writeState("error", { error: error.message });
  void closeSession(1);
});
process.once("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  writeState("error", { error: message });
  void closeSession(1);
});

startControlServer();
writeState("ready");
connection = await createConnection(
  {
    browser: {
      browserName: "chromium",
      isolated: false,
      launchOptions: {
        executablePath: browserExecutable,
        headless: false,
      },
    },
    capabilities: ["core"],
    codegen: "none",
    console: { level: "error" },
    imageResponses: "allow",
    outputDir: outputDirectory,
    saveSession: false,
    sharedBrowserContext: false,
  },
  createBrowserContext,
);
const transport = new PolicyTransport(new StdioServerTransport());
await connection.connect(transport);
writeState("ready");
