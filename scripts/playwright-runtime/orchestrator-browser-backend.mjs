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
const browserExecutable = args.get("browser-executable");
const profileDirectory = args.get("profile-dir");
const bridgeSocket = args.get("bridge-socket");
const bridgeSecret = args.get("bridge-secret");
const groupKey = args.get("group-key");
const groupTitle = args.get("group-title") ?? "Orchestrator";

if (
  !["isolated", "default-browser"].includes(backend) ||
  !sessionToken ||
  !entryId ||
  !stateFile ||
  !backendPipe ||
  !controlSocket
) {
  process.stderr.write("Orchestrator Browser backend configuration is incomplete.\n");
  process.exit(2);
}
if (backend === "isolated" && (!browserExecutable || !profileDirectory)) {
  process.stderr.write("The isolated Browser backend is missing Chromium configuration.\n");
  process.exit(2);
}
if (backend === "default-browser" && (!bridgeSocket || !bridgeSecret || !groupKey)) {
  process.stderr.write("The default Browser backend is missing extension configuration.\n");
  process.exit(2);
}

let browserPid = null;
let adapter = null;
let backendServer = null;
let controlServer = null;
let closing = false;
let expectedSessionId = args.get("thread-id") ?? null;
let expectedTurnId = args.get("turn-id") ?? null;
let expectedRunId = args.get("run-id") ?? null;
let expectedProfileKey = args.get("profile-key") ?? null;
const clients = new Set();

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
  switch (method) {
    case "ping":
      return "pong";
    case "getInfo":
      return {
        id: `orchestrator-${entryId}`,
        type: "cdp",
        family: "chrome",
        name: backend === "isolated" ? "Orchestrator Isolated Chromium" : "Orchestrator Default Browser",
        metadata: {
          orchestratorSessionToken: sessionToken,
          orchestratorBackend: backend,
        },
        capabilities: { browser: [], tab: [] },
      };
    case "getTabs":
      return adapter.getTabs();
    case "getUserTabs":
      return backend === "default-browser" ? adapter.getUserTabs() : [];
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
      throw new Error("Downloads require explicit user approval and are unavailable in this session.");
    case "markTab":
      return null;
    case "nameSession":
      return adapter.nameSession(params.name);
    case "moveMouse":
      return adapter.moveMouse(params);
    case "turnEnded":
      await adapter.turnEnded(params);
      return null;
    case "executeUnhandledCommand":
      throw new Error("This Browser command is not supported by the selected backend.");
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

  async start() {
    await bridgeRequest("ensure-group");
    this.polling = setInterval(() => void this.pollEvents(), 50);
  }

  async pollEvents() {
    try {
      const events = await bridgeRequest("browser-backend-events");
      this.consecutivePollingFailures = 0;
      for (const event of Array.isArray(events) ? events : []) emitPageEvent(event);
    } catch {
      this.consecutivePollingFailures += 1;
      if (this.consecutivePollingFailures >= 20) {
        failBackend("The default-browser extension disconnected from this run.");
      }
    }
  }

  getTabs() { return bridgeRequest("browser-backend-tabs"); }
  getUserTabs() { return bridgeRequest("browser-backend-user-tabs"); }
  createTab(preferredWindowId) { return bridgeRequest("browser-backend-create-tab", { preferredWindowId }); }
  claimUserTab(tabId) { return bridgeRequest("browser-backend-claim-tab", { tabId }); }
  attach(tabId) { return bridgeRequest("browser-backend-attach", { tabId }); }
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
  turnEnded() { return null; }
  async close() {
    if (this.polling) clearInterval(this.polling);
    await bridgeRequest("detach-session").catch(() => undefined);
  }
}

class CdpConnection {
  constructor(url) { this.url = url; }
  socket = null;
  nextId = 1;
  pending = new Map();
  eventHandler = null;
  closeHandler = null;

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed."));
        else pending.resolve(message.result ?? {});
      } else if (message.method) {
        this.eventHandler?.(message);
      }
    });
    this.socket.addEventListener("close", () => this.closeHandler?.());
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Could not connect to Chromium DevTools.")), { once: true });
    });
  }

  send(method, params = {}, sessionId = undefined) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("Chromium DevTools is unavailable.");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { this.socket?.close(); }
}

class IsolatedBrowserAdapter {
  child = null;
  cdp = null;
  tabIds = new Map();
  targets = new Map();
  sessions = new Map();
  childSessions = new Map();
  cachedExpressions = new Map();
  nextTabId = 1;
  activeTabId = null;

  async start() {
    fs.mkdirSync(profileDirectory, { recursive: true, mode: 0o700 });
    this.child = spawn(browserExecutable, [
      `--user-data-dir=${profileDirectory}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-features=Translate,MediaRouter",
      "about:blank",
    ], { stdio: "ignore" });
    browserPid = this.child.pid ?? null;
    this.child.once("exit", () => {
      if (!closing) failBackend("Isolated Chromium exited during browser control.");
    });
    const portFile = path.join(profileDirectory, "DevToolsActivePort");
    const [port, browserPath] = await waitForDevTools(portFile, this.child);
    this.cdp = new CdpConnection(`ws://127.0.0.1:${port}${browserPath}`);
    this.cdp.eventHandler = (event) => this.handleEvent(event);
    this.cdp.closeHandler = () => {
      if (!closing) failBackend("The isolated Chromium DevTools connection was lost.");
    };
    await this.cdp.connect();
    await this.cdp.send("Target.setDiscoverTargets", { discover: true });
  }

  tabId(targetId) {
    let id = this.targets.get(targetId);
    if (!id) {
      id = this.nextTabId++;
      this.targets.set(targetId, id);
      this.tabIds.set(id, targetId);
    }
    return id;
  }

  async targetInfos() {
    const result = await this.cdp.send("Target.getTargets");
    return (result.targetInfos ?? []).filter((target) => target.type === "page");
  }

  async getTabs() {
    const infos = await this.targetInfos();
    return infos.map((target, index) => {
      const id = this.tabId(target.targetId);
      if (this.activeTabId === null && index === 0) this.activeTabId = id;
      return { id, title: target.title ?? "Untitled tab", url: target.url ?? "about:blank", active: id === this.activeTabId };
    });
  }

  getUserTabs() { return []; }
  async createTab() {
    const created = await this.cdp.send("Target.createTarget", { url: "about:blank" });
    const id = this.tabId(created.targetId);
    this.activeTabId = id;
    return { id, title: "New tab", url: "about:blank", active: true };
  }
  claimUserTab(tabId) { return this.attach(tabId).then(() => this.getTab(tabId)); }
  async getTab(tabId) { return (await this.getTabs()).find((tab) => tab.id === Number(tabId)) ?? null; }

  async attach(tabId) {
    const numeric = Number(tabId);
    const targetId = this.tabIds.get(numeric);
    if (!targetId) throw new Error("The browser tab is unavailable.");
    if (!this.sessions.has(numeric)) {
      const result = await this.cdp.send("Target.attachToTarget", { targetId, flatten: true });
      this.sessions.set(numeric, result.sessionId);
      for (const method of ["Page.enable", "Runtime.enable", "DOM.enable", "Accessibility.enable"]) {
        await this.cdp.send(method, {}, result.sessionId).catch(() => undefined);
      }
    }
    this.activeTabId = numeric;
    return null;
  }

  async detach(tabId) {
    const numeric = Number(tabId);
    for (const [key, childSessionId] of this.childSessions) {
      if (!key.startsWith(`${numeric}:`)) continue;
      await this.cdp
        .send("Target.detachFromTarget", { sessionId: childSessionId })
        .catch(() => undefined);
      this.childSessions.delete(key);
    }
    const sessionId = this.sessions.get(numeric);
    if (sessionId) {
      await this.cdp.send("Target.detachFromTarget", { sessionId }).catch(() => undefined);
      this.sessions.delete(numeric);
    }
    return null;
  }

  async attachTarget(tabId, targetId) {
    await this.attach(tabId);
    const numeric = Number(tabId);
    const sessionId = this.sessions.get(numeric);
    const attached = await this.cdp.send(
      "Target.attachToTarget",
      { targetId, flatten: true },
      sessionId,
    );
    if (typeof attached?.sessionId === "string") {
      this.childSessions.set(`${numeric}:${targetId}`, attached.sessionId);
    }
    return null;
  }
  async detachTarget(tabId, targetId) {
    const numeric = Number(tabId);
    const parentSessionId = this.sessions.get(numeric);
    const childSessionId = this.childSessions.get(`${numeric}:${targetId}`);
    if (parentSessionId && childSessionId) {
      await this.cdp
        .send("Target.detachFromTarget", { sessionId: childSessionId }, parentSessionId)
        .catch(() => undefined);
      this.childSessions.delete(`${numeric}:${targetId}`);
    }
    return null;
  }

  async executeCdp(params) {
    const tabId = Number(params.target?.tabId);
    await this.attach(tabId);
    const sessionId = this.sessions.get(tabId);
    return this.cdp.send(params.method, params.commandParams ?? {}, sessionId);
  }

  async executeCdpWithCachedExpression(params) {
    const commandParams = { ...(params.commandParams ?? {}) };
    if (typeof commandParams.expression === "string") this.cachedExpressions.set(params.expressionCacheKey, commandParams.expression);
    else if (this.cachedExpressions.has(params.expressionCacheKey)) commandParams.expression = this.cachedExpressions.get(params.expressionCacheKey);
    else return { kind: "missing" };
    return { kind: "executed", result: await this.executeCdp({ ...params, commandParams }) };
  }

  nameSession() { return null; }
  moveMouse(params) { return this.executeCdp({ target: { tabId: params.tabId }, method: "Input.dispatchMouseEvent", commandParams: { type: "mouseMoved", x: params.x, y: params.y } }); }
  async focus() {
    const targetId = this.tabIds.get(this.activeTabId);
    if (targetId) await this.cdp.send("Target.activateTarget", { targetId });
  }
  turnEnded() { return null; }

  handleEvent(event) {
    if (event.method === "Target.detachedFromTarget") {
      for (const [tabId, sessionId] of this.sessions) if (sessionId === event.params?.sessionId) this.sessions.delete(tabId);
      for (const [key, sessionId] of this.childSessions) {
        if (sessionId === event.params?.sessionId) this.childSessions.delete(key);
      }
    }
    const tabId = [...this.sessions].find(([, sessionId]) => sessionId === event.sessionId)?.[0];
    if (!tabId || !EVENT_METHODS.includes(event.method)) return;
    emitPageEvent({ source: { tabId, ...(event.sessionId ? { sessionId: event.sessionId } : {}) }, method: event.method, params: event.params ?? {} });
  }

  async close() {
    this.cdp?.close();
    if (this.child?.pid) {
      this.child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (this.child.exitCode === null) this.child.kill("SIGKILL");
    }
  }
}

async function waitForDevTools(portFile, child) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Chromium exited before its Browser backend was ready.");
    try {
      const [port, browserPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/u);
      if (/^\d+$/u.test(port) && browserPath?.startsWith("/")) return [Number(port), browserPath];
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Chromium DevTools.");
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
  adapter = backend === "isolated" ? new IsolatedBrowserAdapter() : new DefaultBrowserAdapter();
  await adapter.start();
  startBackendServer();
  startControlServer();
  writeState("ready");
} catch (error) {
  writeState("error", { error: error instanceof Error ? error.message : String(error) });
  await adapter?.close().catch(() => undefined);
  process.exit(1);
}
