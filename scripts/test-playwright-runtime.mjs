#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const runtimeRoot = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "playwright",
  `darwin-${architecture}`,
);
const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "runtime.json"), "utf8"));
if (manifest.version !== 2 || !manifest.browserBackendScript) {
  throw new Error("The prepared runtime does not contain the Browser backend.");
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-browser-backend-smoke-"));
const stateFile = path.join(temporaryRoot, "state.json");
const backendPipe = path.join(temporaryRoot, "browser.sock");
const controlSocket = path.join(temporaryRoot, "control.sock");
const profileDirectory = path.join(temporaryRoot, "profile");
const sessionToken = "0123456789abcdef0123456789abcdef";
const sessionMetadata = {
  session_id: "browser-smoke-session",
  turn_id: "browser-smoke-turn",
  session_context: { source: "orchestrator-runtime-smoke" },
};

class BrowserBackendClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (error) => this.rejectAll(error));
    socket.on("close", () => this.rejectAll(new Error("Browser backend disconnected.")));
  }

  static async connect(socketPath) {
    const socket = net.createConnection(socketPath);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    return new BrowserBackendClient(socket);
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
    const frame = Buffer.allocUnsafe(payload.byteLength + 4);
    frame.writeUInt32LE(payload.byteLength, 0);
    payload.copy(frame, 4);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser backend timed out handling ${method}.`));
      }, 10_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.write(frame);
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (this.buffer.byteLength < length + 4) return;
      const message = JSON.parse(this.buffer.subarray(4, length + 4).toString("utf8"));
      this.buffer = this.buffer.subarray(length + 4);
      if (message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  close() {
    this.socket.destroy();
  }
}

const server = http.createServer((_request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html><body>
    <button id="action" onclick="this.textContent = 'clicked'">Run action</button>
    <p id="status">browser ready</p>
  </body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not start the Browser backend smoke-test server.");
}

const child = spawn(
  path.join(runtimeRoot, manifest.nodeExecutable),
  [
    path.join(runtimeRoot, manifest.browserBackendScript),
    "--backend", "isolated",
    "--session-token", sessionToken,
    "--entry-id", "browser-smoke-entry",
    "--state-file", stateFile,
    "--backend-pipe", backendPipe,
    "--control-socket", controlSocket,
    "--browser-executable", path.join(runtimeRoot, manifest.chromiumExecutable),
    "--profile-dir", profileDirectory,
  ],
  {
    cwd: temporaryRoot,
    env: { ...process.env, TMPDIR: temporaryRoot },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let childError = "";
child.stderr.on("data", (chunk) => { childError += String(chunk); });

let client;
try {
  await waitForBackend();
  client = await BrowserBackendClient.connect(backendPipe);

  if ((await client.request("ping", {})) !== "pong") {
    throw new Error("The Browser backend did not answer its health check.");
  }
  await sendControl({
    action: "update-target",
    target: {
      profileKey: "default",
      runId: 1,
      threadId: sessionMetadata.session_id,
      turnId: sessionMetadata.turn_id,
    },
  });
  const info = await client.request("getInfo", sessionMetadata);
  if (
    info?.id !== "orchestrator-browser-smoke-entry" ||
    info?.type !== "cdp" ||
    info?.family !== "chrome" ||
    info?.metadata?.orchestratorBackend !== "isolated"
  ) {
    throw new Error(`Unexpected Browser backend identity: ${JSON.stringify(info)}`);
  }

  const tabs = await client.request("getTabs", sessionMetadata);
  const tab = tabs[0] ?? await client.request("createTab", sessionMetadata);
  if (!Number.isInteger(tab?.id)) {
    throw new Error("The Browser backend did not return a usable tab.");
  }
  await client.request("attach", { ...sessionMetadata, tabId: tab.id });
  await client.request("executeCdp", {
    ...sessionMetadata,
    target: { tabId: tab.id },
    method: "Page.navigate",
    commandParams: { url: `http://127.0.0.1:${address.port}/` },
  });
  await waitForPage(client, tab.id);

  const status = await evaluate(client, tab.id, "document.querySelector('#status')?.textContent");
  if (status !== "browser ready") {
    throw new Error(`The Browser backend returned unexpected page content: ${status}`);
  }
  await evaluate(client, tab.id, "document.querySelector('#action')?.click()");
  const action = await evaluate(client, tab.id, "document.querySelector('#action')?.textContent");
  if (action !== "clicked") {
    throw new Error("The Browser backend could not interact with the local page.");
  }
  const screenshot = await client.request("executeCdp", {
    ...sessionMetadata,
    target: { tabId: tab.id },
    method: "Page.captureScreenshot",
    commandParams: { format: "png" },
  });
  if (!screenshot?.data?.startsWith("iVBOR")) {
    throw new Error("The Browser backend did not return a PNG screenshot.");
  }

  await expectFailure(() => client.request("getTabs", {}), /session metadata/i);
  await expectFailure(
    () =>
      client.request("getTabs", {
        ...sessionMetadata,
        turn_id: "another-turn",
      }),
    /turn does not match/i,
  );
  await expectFailure(
    () => client.request("allowDownload", sessionMetadata),
    /approval|unavailable/i,
  );
  await client.request("turnEnded", sessionMetadata);

  process.stdout.write(
    "Bundled Browser backend smoke test passed using one isolated CDP browser.\n",
  );
} finally {
  client?.close();
  await stopBackend().catch(() => undefined);
  if (child.exitCode === null) child.kill("SIGKILL");
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

async function evaluate(browser, tabId, expression) {
  const result = await browser.request("executeCdp", {
    ...sessionMetadata,
    target: { tabId },
    method: "Runtime.evaluate",
    commandParams: { expression, returnByValue: true, awaitPromise: true },
  });
  if (result?.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  }
  return result?.result?.value;
}

async function waitForPage(browser, tabId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const ready = await evaluate(browser, tabId, "document.readyState");
      if (ready === "interactive" || ready === "complete") return;
    } catch {
      // Navigation can replace the execution context between polls.
    }
    await delay(50);
  }
  throw new Error("The Browser backend did not finish local navigation.");
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Browser backend exited before startup (${child.exitCode}): ${childError}`);
    }
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (state.status === "error") throw new Error(state.error);
      if (state.status === "ready" && fs.existsSync(backendPipe)) return;
    } catch (error) {
      if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for the Browser backend.");
}

async function stopBackend() {
  if (!fs.existsSync(controlSocket)) return;
  await sendControl({ action: "stop" });
  for (let attempt = 0; attempt < 50 && child.exitCode === null; attempt += 1) {
    await delay(20);
  }
}

async function sendControl(command) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection(controlSocket);
    socket.setTimeout(1_000, () => socket.destroy());
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ sessionToken, ...command })}\n`);
    });
    socket.on("data", (chunk) => {
      const response = JSON.parse(String(chunk));
      if (!response.ok) reject(new Error(response.error));
      socket.destroy();
    });
    socket.on("close", resolve);
    socket.on("error", reject);
  });
}

async function expectFailure(action, pattern) {
  try {
    await action();
  } catch (error) {
    if (pattern.test(error instanceof Error ? error.message : String(error))) return;
    throw error;
  }
  throw new Error(`Expected Browser request to fail with ${pattern}.`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
