#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const EVENT_METHODS = [
  "Page.frameAttached",
  "Page.frameDetached",
  "Page.frameNavigated",
  "Page.frameResized",
  "Page.javascriptDialogClosed",
  "Page.javascriptDialogOpening",
  "Page.lifecycleEvent",
  "Page.loadEventFired",
  "Page.navigatedWithinDocument",
  "Runtime.bindingCalled",
  "Runtime.consoleAPICalled",
  "Runtime.exceptionThrown",
  "Runtime.executionContextCreated",
  "Runtime.executionContextDestroyed",
  "Runtime.executionContextsCleared",
  "DOM.documentUpdated",
  "Target.attachedToTarget",
  "Target.detachedFromTarget",
  "Target.targetInfoChanged",
];

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(current.slice(2), next);
      index += 1;
    } else {
      values.set(current.slice(2), "true");
    }
  }
  return values;
}

const args = parseArguments(process.argv.slice(2));
const backend = args.get("backend");
const sessionToken = args.get("session-token");
const entryId = args.get("entry-id");
const stateFile = args.get("state-file");
const backendPipe = args.get("backend-pipe");
const controlSocket = args.get("control-socket");
const downloadDir = args.get("download-dir");
const safariDriver = args.get("safari-driver");
const bridgeSocket = args.get("bridge-socket");
const bridgeSecret = args.get("bridge-secret");
const groupKey = args.get("group-key");
const groupTitle = args.get("group-title") ?? "Orchestrator";

if (
  !["browser-bridge", "safari-mcp"].includes(backend) ||
  !sessionToken ||
  !entryId ||
  !stateFile ||
  !backendPipe ||
  !controlSocket ||
  !downloadDir ||
  !path.isAbsolute(downloadDir)
) {
  process.stderr.write("Orchestrator Browser backend configuration is incomplete.\n");
  process.exit(2);
}
if (backend === "safari-mcp" && !safariDriver) {
  process.stderr.write("The Safari Browser backend is missing safaridriver configuration.\n");
  process.exit(2);
}
if (backend === "browser-bridge" && (!bridgeSocket || !bridgeSecret || !groupKey)) {
  process.stderr.write("The default Browser backend is missing extension configuration.\n");
  process.exit(2);
}

let browserPid = null;
let adapter = null;
let backendServer = null;
let controlServer = null;
let closing = false;
let paused = false;
let takeover = false;
let generation = 1;
let expectedSessionId = args.get("thread-id") ?? null;
let expectedTurnId = args.get("turn-id") ?? null;
let expectedRunId = args.get("run-id") ?? null;
let expectedProfileKey = args.get("profile-key") ?? null;
const clients = new Set();
const INVALIDATING_PAGE_EVENTS = new Set([
  "DOM.documentUpdated",
  "Page.frameNavigated",
  "Page.frameResized",
  "Page.navigatedWithinDocument",
  "Runtime.executionContextsCleared",
  "Target.targetInfoChanged",
]);

function failBackend(message) {
  if (closing) return;
  writeState("error", { error: message });
  void closeSession(1);
}

function writeState(status, extra = {}) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify({
      version: 2,
      sessionToken,
      entryId,
      backend,
      backendPipe,
      wrapperPid: process.pid,
      browserPid,
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    }),
    { mode: 0o600 },
  );
  fs.renameSync(temporary, stateFile);
}

function encodeFrame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.byteLength > MAX_FRAME_BYTES) throw new Error("Browser response is too large.");
  const frame = Buffer.allocUnsafe(4 + payload.byteLength);
  frame.writeUInt32LE(payload.byteLength, 0);
  payload.copy(frame, 4);
  return frame;
}

class FrameDecoder {
  buffer = Buffer.alloc(0);

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    const messages = [];
    while (this.buffer.byteLength >= 4) {
      const size = this.buffer.readUInt32LE(0);
      if (size > MAX_FRAME_BYTES) throw new Error("Browser request is too large.");
      if (this.buffer.byteLength < size + 4) break;
      messages.push(JSON.parse(this.buffer.subarray(4, size + 4).toString("utf8")));
      this.buffer = this.buffer.subarray(size + 4);
    }
    return messages;
  }
}

function emitPageEvent(event) {
  if (INVALIDATING_PAGE_EVENTS.has(event?.method)) {
    generation += 1;
    adapter?.invalidate?.();
  }
  const message = encodeFrame({ jsonrpc: "2.0", method: "onPageEvent", params: event });
  for (const client of clients) client.write(message);
}

function validateSession(params) {
  if (!params || typeof params !== "object") throw new Error("Browser session metadata is missing.");
  if (typeof params.session_id !== "string" || typeof params.turn_id !== "string") {
    throw new Error("Browser session metadata is incomplete.");
  }
  if (expectedSessionId !== null && params.session_id !== expectedSessionId) {
    throw new Error("Browser request thread does not match this run.");
  }
  if (expectedTurnId !== null && params.turn_id !== expectedTurnId) {
    throw new Error("Browser request turn does not match this run.");
  }
}

async function handleRequest(message) {
  const method = message.method;
  const params = message.params ?? {};
  if (method !== "ping") validateSession(params);
  if (paused && !["ping", "getInfo"].includes(method)) {
    throw new Error(
      takeover
        ? "Browser control is paused while the user has taken over."
        : "Browser control is paused by the user.",
    );
  }
  switch (method) {
    case "ping":
      return "pong";
    case "getInfo":
      return {
        id: `orchestrator-${entryId}`,
        type: "cdp",
        family: backend === "safari-mcp" ? "safari" : "chrome",
        name: backend === "safari-mcp" ? "Orchestrator Safari" : "Orchestrator Default Browser",
        metadata: {
          orchestratorSessionToken: sessionToken,
          orchestratorBackend: backend,
          orchestratorGeneration: String(generation),
        },
        capabilities: { browser: [], tab: [] },
      };
    case "getTabs":
      return adapter.getTabs();
    case "getUserTabs":
      return adapter.getUserTabs();
    case "getUserHistory":
      return [];
    case "createTab":
      return adapter.createTab(params.preferredWindowId);
    case "claimUserTab":
      return adapter.claimUserTab(params.tabId);
    case "attach":
      return adapter.attach(params.tabId);
    case "detach":
      return adapter.detach(params.tabId);
    case "attachTarget":
      return adapter.attachTarget(params.tabId, params.targetId);
    case "detachTarget":
      return adapter.detachTarget(params.tabId, params.targetId);
    case "executeCdp":
      return adapter.executeCdp(params);
    case "executeCdpWithCachedExpression":
      return adapter.executeCdpWithCachedExpression(params);
    case "allowDownload":
      if (backend !== "browser-bridge") {
        throw new Error("Downloads are unavailable with this Browser provider.");
      }
      return adapter.allowDownload(params);
    case "markTab":
      return adapter.markTab(params);
    case "nameSession":
      return adapter.nameSession(params.name);
    case "moveMouse":
      return adapter.moveMouse(params);
    case "turnEnded":
      await adapter.turnEnded(params);
      return null;
    case "executeUnhandledCommand":
      return adapter.executeUnhandledCommand(params);
    default:
      throw new Error(`No handler registered for method: ${method}`);
  }
}

function startBackendServer() {
  fs.mkdirSync(path.dirname(backendPipe), { recursive: true, mode: 0o700 });
  fs.rmSync(backendPipe, { force: true });
  backendServer = net.createServer((socket) => {
    clients.add(socket);
    const decoder = new FrameDecoder();
    socket.on("data", (chunk) => {
      let messages;
      try {
        messages = decoder.push(chunk);
      } catch (error) {
        socket.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      for (const message of messages) {
        if (!message || message.jsonrpc !== "2.0" || message.id === undefined) continue;
        void handleRequest(message).then(
          (result) => socket.write(encodeFrame({ jsonrpc: "2.0", id: message.id, result })),
          (error) => socket.write(encodeFrame({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: 1, message: error instanceof Error ? error.message : String(error) },
          })),
        );
      }
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });
  backendServer.listen(backendPipe, () => fs.chmodSync(backendPipe, 0o600));
}

function startControlServer() {
  fs.mkdirSync(path.dirname(controlSocket), { recursive: true, mode: 0o700 });
  fs.rmSync(controlSocket, { force: true });
  controlServer = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk;
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      let command;
      try {
        command = JSON.parse(input.slice(0, newline));
      } catch {
        socket.end('{"ok":false,"error":"Invalid browser control command."}\n');
        return;
      }
      if (command.sessionToken !== sessionToken) {
        socket.end('{"ok":false,"error":"Browser session token mismatch."}\n');
      } else if (command.action === "focus") {
        void adapter.focus().then(
          () => socket.end('{"ok":true}\n'),
          (error) => socket.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`),
        );
      } else if (command.action === "stop") {
        socket.end('{"ok":true}\n');
        void closeSession(0);
      } else if (command.action === "pause" || command.action === "takeover") {
        paused = true;
        takeover = command.action === "takeover";
        void adapter.pause({ takeover }).then(
          () => {
            generation += 1;
            writeState(takeover ? "takeover" : "paused", { generation });
            socket.end(`${JSON.stringify({ ok: true, generation })}\n`);
          },
          (error) => {
            paused = false;
            takeover = false;
            socket.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`);
          },
        );
      } else if (command.action === "resume") {
        void adapter.resume().then(
          () => {
            generation += 1;
            paused = false;
            takeover = false;
            writeState("ready", { generation });
            socket.end(`${JSON.stringify({ ok: true, generation })}\n`);
          },
          (error) => socket.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`),
        );
      } else if (command.action === "snapshot") {
        if (paused) {
          socket.end('{"ok":false,"error":"Browser control is paused."}\n');
          return;
        }
        void adapter.screenshot().then(
          (result) => socket.end(`${JSON.stringify({
            ok: true,
            result: {
              dataUrl: `data:${result.mimeType ?? "image/png"};base64,${result.data}`,
              generation,
              capturedAt: new Date().toISOString(),
            },
          })}\n`),
          (error) => socket.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`),
        );
      } else if (command.action === "update-target") {
        const target = command.target;
        if (!target || typeof target !== "object") {
          socket.end('{"ok":false,"error":"Browser target is missing."}\n');
          return;
        }
        expectedSessionId =
          typeof target.threadId === "string" && target.threadId
            ? target.threadId
            : null;
        expectedTurnId =
          typeof target.turnId === "string" && target.turnId
            ? target.turnId
            : null;
        expectedRunId =
          Number.isInteger(target.runId) && target.runId > 0
            ? String(target.runId)
            : null;
        expectedProfileKey =
          typeof target.profileKey === "string" && target.profileKey
            ? target.profileKey
            : null;
        writeState("ready", {
          expectedSessionId,
          expectedTurnId,
          expectedRunId,
          expectedProfileKey,
        });
        socket.end('{"ok":true}\n');
      } else {
        socket.end('{"ok":false,"error":"Unsupported browser control command."}\n');
      }
    });
  });
  controlServer.listen(controlSocket, () => fs.chmodSync(controlSocket, 0o600));
}

async function bridgeRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(bridgeSocket);
    socket.setEncoding("utf8");
    socket.setTimeout(10_000);
    let input = "";
    const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ role: "client", secret: bridgeSecret })}\n`);
      socket.write(`${JSON.stringify({ id, action, sessionToken, groupKey, groupTitle, ...payload })}\n`);
    });
    socket.on("data", (chunk) => {
      input += chunk;
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(input.slice(0, newline));
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error ?? "The browser extension request failed."));
      } catch (error) {
        reject(error);
      } finally {
        socket.end();
      }
    });
    socket.on("timeout", () => socket.destroy(new Error("The browser extension did not respond.")));
    socket.on("error", reject);
  });
}

class DefaultBrowserAdapter {
  cachedExpressions = new Map();
  polling = null;
  consecutivePollingFailures = 0;
  recovering = false;
  recoveryAttempts = 0;

  invalidate() {
    this.cachedExpressions.clear();
  }

  async start() {
    await bridgeRequest("ensure-group");
    this.startPolling();
  }

  startPolling() {
    if (this.polling) return;
    this.polling = setInterval(() => void this.pollEvents(), 50);
  }

  stopPolling() {
    if (!this.polling) return;
    clearInterval(this.polling);
    this.polling = null;
  }

  async pollEvents() {
    try {
      const events = await bridgeRequest("browser-backend-events");
      if (this.recovering) {
        await bridgeRequest("ensure-group");
        this.recovering = false;
        paused = false;
        takeover = false;
        generation += 1;
        this.invalidate();
        writeState("ready", { generation, recovered: true });
      }
      this.consecutivePollingFailures = 0;
      for (const event of Array.isArray(events) ? events : []) emitPageEvent(event);
    } catch {
      this.consecutivePollingFailures += 1;
      if (this.consecutivePollingFailures === 20) {
        if (this.recoveryAttempts >= 1) {
          failBackend("The default-browser extension disconnected again after recovery.");
          return;
        }
        this.recoveryAttempts += 1;
        this.recovering = true;
        paused = true;
        generation += 1;
        writeState("paused", {
          generation,
          error: "The Browser Bridge disconnected; waiting once for it to reconnect.",
        });
      } else if (this.consecutivePollingFailures >= 300) {
        failBackend("The default-browser extension disconnected from this run.");
      }
    }
  }

  getTabs() { return bridgeRequest("browser-backend-tabs"); }
  getUserTabs() { return []; }
  async createTab(preferredWindowId) {
    const result = await bridgeRequest("browser-backend-create-tab", { preferredWindowId });
    generation += 1;
    this.invalidate();
    return result;
  }
  async claimUserTab(tabId) {
    const result = await bridgeRequest("browser-backend-claim-tab", { tabId });
    generation += 1;
    this.invalidate();
    return result;
  }
  async attach(tabId) {
    const result = await bridgeRequest("browser-backend-attach", { tabId });
    generation += 1;
    this.invalidate();
    return result;
  }
  detach(tabId) { return bridgeRequest("browser-backend-detach", { tabId }); }
  attachTarget(tabId, targetId) { return bridgeRequest("browser-backend-attach-target", { tabId, targetId }); }
  detachTarget(tabId, targetId) { return bridgeRequest("browser-backend-detach-target", { tabId, targetId }); }
  executeCdp(params) { return bridgeRequest("browser-backend-cdp", params); }
  async executeCdpWithCachedExpression(params) {
    const commandParams = { ...(params.commandParams ?? {}) };
    if (typeof commandParams.expression === "string") {
      this.cachedExpressions.set(params.expressionCacheKey, commandParams.expression);
    } else if (this.cachedExpressions.has(params.expressionCacheKey)) {
      commandParams.expression = this.cachedExpressions.get(params.expressionCacheKey);
    } else {
      return { kind: "missing" };
    }
    return { kind: "executed", result: await this.executeCdp({ ...params, commandParams }) };
  }
  nameSession(name) { return bridgeRequest("rename-group", { groupTitle: String(name ?? groupTitle) }); }
  moveMouse(params) { return this.executeCdp({ target: { tabId: params.tabId }, method: "Input.dispatchMouseEvent", commandParams: { type: "mouseMoved", x: params.x, y: params.y } }); }
  focus() { return bridgeRequest("focus-group"); }
  markTab(params) { return bridgeRequest("mark-tab", { tabId: params.tabId, status: params.status }); }
  allowDownload(params) {
    return bridgeRequest("browser-backend-allow-download", {
      tabId: params.tabId,
      url: params.url,
      downloadDir,
    });
  }
  turnEnded(params) { return bridgeRequest("turn-ended", { turnId: params.turn_id }); }
  async pause({ takeover }) {
    await bridgeRequest("pause-session", { takeover });
    this.stopPolling();
    this.recovering = false;
  }
  async resume() {
    this.cachedExpressions.clear();
    this.consecutivePollingFailures = 0;
    this.startPolling();
  }
  async screenshot() {
    const tabs = await this.getTabs();
    const tab = tabs.find((candidate) => candidate.active) ?? tabs[0];
    if (!tab) throw new Error("The browser session has no active tab.");
    const result = await this.executeCdp({
      target: { tabId: tab.id },
      method: "Page.captureScreenshot",
      commandParams: { format: "png", fromSurface: true },
    });
    return { data: result.data, mimeType: "image/png" };
  }
  executeUnhandledCommand() { throw new Error("This Browser command is not supported by the Browser Bridge backend."); }
  async close() {
    this.stopPolling();
    await bridgeRequest("detach-session").catch(() => undefined);
  }
}

class SafariMcpAdapter {
  child = null;
  nextId = 1;
  pending = new Map();
  input = "";
  handles = new Map();
  reverseHandles = new Map();
  nextTabId = 1;
  activeTabId = null;
  cachedExpressions = new Map();

  invalidate() { this.cachedExpressions.clear(); }

  async start() {
    this.child = spawn(safariDriver, ["--mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    browserPid = this.child.pid ?? null;
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.once("exit", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Safari MCP disconnected."));
      this.pending.clear();
      if (!closing) failBackend("Safari MCP disconnected from this run.");
    });
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "Orchestrator", version: "1" },
    });
    this.notify("notifications/initialized", {});
    await this.callTool("create_tab", { url: "about:blank" });
    await this.getTabs();
  }

  onData(chunk) {
    this.input += chunk;
    for (;;) {
      const newline = this.input.indexOf("\n");
      if (newline < 0) return;
      const raw = this.input.slice(0, newline).trim();
      this.input = this.input.slice(newline + 1);
      if (!raw) continue;
      let message;
      try { message = JSON.parse(raw); } catch { continue; }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "Safari MCP request failed."));
      else pending.resolve(message.result ?? {});
    }
  }

  request(method, params = {}) {
    if (!this.child?.stdin.writable) throw new Error("Safari MCP is unavailable.");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Safari MCP timed out handling ${method}.`));
      }, 15_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async callTool(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(this.toolText(result) || `Safari tool ${name} failed.`);
    const text = this.toolText(result);
    if (!text) {
      const image = (result.content ?? []).find((item) => item.type === "image");
      if (image?.data) return { data: image.data, mimeType: image.mimeType ?? "image/png" };
      return result.structuredContent ?? {};
    }
    try { return JSON.parse(text); } catch { return text; }
  }

  toolText(result) {
    return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
  }

  tabId(handle) {
    const key = String(handle);
    if (!this.reverseHandles.has(key)) {
      const id = this.nextTabId++;
      this.reverseHandles.set(key, id);
      this.handles.set(id, key);
    }
    return this.reverseHandles.get(key);
  }

  async getTabs() {
    const value = await this.callTool("list_tabs");
    const tabs = Array.isArray(value) ? value : value.tabs ?? [];
    return tabs.map((tab, index) => {
      const handle = tab.handle ?? tab.id ?? tab.tabHandle;
      const id = this.tabId(handle);
      if (this.activeTabId === null || tab.active) this.activeTabId = id;
      return { id, title: tab.title ?? "Safari tab", url: tab.url ?? "about:blank", active: id === this.activeTabId || (!this.activeTabId && index === 0) };
    });
  }

  getUserTabs() { return []; }
  async createTab() {
    const value = await this.callTool("create_tab", { url: "about:blank" });
    const handle = value.handle ?? value.id ?? value.tabHandle;
    const id = this.tabId(handle);
    this.activeTabId = id;
    return { id, title: "New tab", url: "about:blank", active: true };
  }
  claimUserTab() { throw new Error("Safari exposes only Orchestrator-owned tabs."); }
  async attach(tabId) {
    const handle = this.handles.get(Number(tabId));
    if (!handle) throw new Error("The Safari tab is unavailable.");
    await this.callTool("switch_tab", { handle });
    this.activeTabId = Number(tabId);
    return null;
  }
  detach() { return null; }
  attachTarget() { return null; }
  detachTarget() { return null; }
  nameSession() { return null; }
  focus() { return this.activeTabId ? this.attach(this.activeTabId) : null; }
  turnEnded() { return null; }
  markTab() { return null; }
  pause() { return null; }
  resume() { this.cachedExpressions.clear(); return null; }
  async screenshot() {
    const result = await this.executeCdp({
      target: { tabId: this.activeTabId },
      method: "Page.captureScreenshot",
      commandParams: { format: "png" },
    });
    return { data: result.data, mimeType: "image/png" };
  }
  moveMouse() { return null; }
  executeUnhandledCommand(params) {
    const name = params.name ?? params.command ?? params.method;
    const supported = new Set([
      "browser_console_messages", "browser_dialogs", "get_network_request",
      "list_network_requests", "get_page_content", "page_info", "page_interactions",
      "screenshot", "wait_for_navigation",
    ]);
    if (!supported.has(name)) throw new Error(`Safari MCP command ${name ?? "unknown"} is unavailable.`);
    return this.callTool(name, params.arguments ?? params.params ?? {});
  }

  async executeCdp(params) {
    const tabId = Number(params.target?.tabId);
    if (tabId) await this.attach(tabId);
    const values = params.commandParams ?? {};
    switch (params.method) {
      case "Runtime.evaluate": {
        const value = await this.callTool("evaluate_javascript", { expression: values.expression });
        return { result: { type: value === null ? "object" : typeof value, value } };
      }
      case "Page.navigate":
        await this.callTool("navigate_to_url", { url: values.url });
        return { frameId: "safari-main" };
      case "Page.captureScreenshot": {
        const value = await this.callTool("screenshot", {});
        return { data: value.data ?? value.base64 ?? value.image ?? value };
      }
      case "Page.getLayoutMetrics": {
        const value = await this.callTool("evaluate_javascript", { expression: "({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})" });
        return { cssLayoutViewport: { clientWidth: value.width, clientHeight: value.height }, cssContentSize: { width: value.scrollWidth, height: value.scrollHeight, x: 0, y: 0 } };
      }
      case "Page.handleJavaScriptDialog":
        await this.callTool("browser_dialogs", { action: values.accept ? "accept" : "dismiss", text: values.promptText });
        return {};
      case "Network.getResponseBody": {
        const value = await this.callTool("get_network_request", { requestId: values.requestId });
        return { body: value.body ?? "", base64Encoded: Boolean(value.base64Encoded) };
      }
      case "Browser.getVersion":
        return { product: "Safari/27", userAgent: "Safari", protocolVersion: "Safari-MCP" };
      case "Page.getFrameTree":
        return { frameTree: { frame: { id: "safari-main", url: "about:blank", securityOrigin: "" } } };
      case "Runtime.enable": case "Page.enable": case "DOM.enable": case "Accessibility.enable":
      case "Network.enable": case "Log.enable": case "Console.enable":
      case "Runtime.disable": case "Page.disable": case "DOM.disable": case "Accessibility.disable":
      case "Network.disable": case "Log.disable": case "Console.disable":
        return {};
      default:
        throw new Error(`Safari MCP does not support Browser command ${params.method}.`);
    }
  }

  async executeCdpWithCachedExpression(params) {
    const commandParams = { ...(params.commandParams ?? {}) };
    if (typeof commandParams.expression === "string") this.cachedExpressions.set(params.expressionCacheKey, commandParams.expression);
    else if (this.cachedExpressions.has(params.expressionCacheKey)) commandParams.expression = this.cachedExpressions.get(params.expressionCacheKey);
    else return { kind: "missing" };
    return { kind: "executed", result: await this.executeCdp({ ...params, commandParams }) };
  }

  async close() {
    if (!this.child) return;
    this.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (this.child.exitCode === null) this.child.kill("SIGKILL");
  }
}


async function closeSession(exitCode) {
  if (closing) return;
  closing = true;
  const currentError = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8")).error
    : undefined;
  writeState("stopping", currentError ? { error: currentError } : {});
  await adapter?.close().catch(() => undefined);
  for (const client of clients) client.destroy();
  await Promise.all([
    new Promise((resolve) => backendServer?.close(resolve) ?? resolve()),
    new Promise((resolve) => controlServer?.close(resolve) ?? resolve()),
  ]);
  fs.rmSync(backendPipe, { force: true });
  fs.rmSync(controlSocket, { force: true });
  writeState(exitCode === 0 ? "stopped" : "error", currentError ? { error: currentError } : {});
  process.exit(exitCode);
}

process.on("SIGTERM", () => void closeSession(0));
process.on("SIGINT", () => void closeSession(0));
process.on("uncaughtException", (error) => {
  writeState("error", { error: error instanceof Error ? error.message : String(error) });
  void closeSession(1);
});
process.on("unhandledRejection", (error) => {
  writeState("error", { error: error instanceof Error ? error.message : String(error) });
  void closeSession(1);
});

try {
  writeState("starting");
  adapter = backend === "safari-mcp" ? new SafariMcpAdapter() : new DefaultBrowserAdapter();
  await adapter.start();
  startBackendServer();
  startControlServer();
  writeState("ready");
} catch (error) {
  writeState("error", { error: error instanceof Error ? error.message : String(error) });
  await adapter?.close().catch(() => undefined);
  process.exit(1);
}
