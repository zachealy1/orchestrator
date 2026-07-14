import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

if (process.env.RUN_CODEX_LIVE_PLAN_TEST !== "1") {
  console.log("Skipped. Set RUN_CODEX_LIVE_PLAN_TEST=1 to run the live Codex Plan test.");
  process.exit(0);
}

const codexBin =
  process.env.CODEX_BIN ?? "/Applications/ChatGPT.app/Contents/Resources/codex";
const workspace = await mkdtemp(join(tmpdir(), "orchestrator-live-plan-"));
const child = spawn(codexBin, ["app-server"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});
const lines = createInterface({ input: child.stdout });
const pending = new Map();
const notifications = [];
const notificationWaiters = new Set();
let nextId = 1;

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function rpc(method, params = {}) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => pending.set(String(id), { resolve, reject }));
}

function notifyWaiters(message) {
  notifications.push(message);
  for (const waiter of notificationWaiters) waiter(message);
}

function waitForNotification(predicate, timeoutMs = 180_000) {
  const existing = notifications.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      notificationWaiters.delete(onMessage);
      reject(new Error("Timed out waiting for an App Server notification."));
    }, timeoutMs);
    const onMessage = (message) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      notificationWaiters.delete(onMessage);
      resolve(message);
    };
    notificationWaiters.add(onMessage);
  });
}

function answerUserInput(message) {
  const answers = Object.fromEntries(
    (message.params?.questions ?? []).map((question) => [
      question.id,
      {
        answers: question.options?.[0]?.label
          ? [question.options[0].label]
          : ["Proceed with the smallest focused implementation."],
      },
    ]),
  );
  send({ jsonrpc: "2.0", id: message.id, result: { answers } });
}

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id !== undefined && message.method === undefined) {
    const request = pending.get(String(message.id));
    if (!request) return;
    pending.delete(String(message.id));
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
    return;
  }
  if (message.method === "item/tool/requestUserInput" && message.id !== undefined) {
    answerUserInput(message);
  } else if (message.id !== undefined) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32000, message: `Unexpected server request: ${message.method}` },
    });
  }
  notifyWaiters(message);
});

async function workspaceSnapshot(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await workspaceSnapshot(path)).map((item) => `${entry.name}/${item}`));
    } else {
      files.push(`${entry.name}:${await readFile(path, "utf8")}`);
    }
  }
  return files.sort();
}

try {
  await writeFile(join(workspace, "README.md"), "# Live Plan fixture\n", "utf8");
  await rpc("initialize", {
    clientInfo: {
      name: "orchestrator-live-plan-test",
      title: "Orchestrator live Plan test",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true },
  });
  send({ jsonrpc: "2.0", method: "initialized", params: {} });

  const presets = await rpc("collaborationMode/list", {});
  const planMask = presets.data.find((preset) => preset.mode === "plan");
  const defaultMask = presets.data.find((preset) => preset.mode === "default");
  if (!planMask || !defaultMask) throw new Error("Plan and Default presets are required.");

  const started = await rpc("thread/start", {
    cwd: workspace,
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    serviceName: "orchestrator-live-plan-test",
    threadSource: "orchestrator",
  });
  const threadId = started.thread.id;
  const model = planMask.model ?? started.model;
  if (!model) throw new Error("App Server did not report a model for Plan mode.");
  const beforePlan = await workspaceSnapshot(workspace);
  const planning = await rpc("turn/start", {
    threadId,
    input: [
      {
        type: "text",
        text: "Plan a focused implementation that adds hello.txt containing hello. Do not implement it yet.",
        text_elements: [],
      },
    ],
    cwd: workspace,
    approvalPolicy: "on-request",
    collaborationMode: {
      mode: "plan",
      settings: {
        model,
        reasoning_effort: planMask.reasoning_effort ?? null,
        developer_instructions: null,
      },
    },
    clientUserMessageId: crypto.randomUUID(),
  });
  const planTurnId = planning.turn.id;
  const completedPlan = await waitForNotification(
    (message) =>
      message.method === "item/completed" &&
      message.params?.turnId === planTurnId &&
      message.params?.item?.type === "plan",
  );
  await waitForNotification(
    (message) =>
      message.method === "turn/completed" && message.params?.turn?.id === planTurnId,
  );
  if (!completedPlan.params.item.text?.trim()) throw new Error("Completed plan was empty.");
  const afterPlan = await workspaceSnapshot(workspace);
  if (JSON.stringify(beforePlan) !== JSON.stringify(afterPlan)) {
    throw new Error("The workspace changed before plan approval.");
  }

  const implementation = await rpc("turn/start", {
    threadId,
    input: [
      { type: "text", text: "Implement the plan.", text_elements: [] },
    ],
    cwd: workspace,
    approvalPolicy: "on-request",
    collaborationMode: {
      mode: "default",
      settings: {
        model: defaultMask.model ?? model,
        reasoning_effort: defaultMask.reasoning_effort ?? null,
        developer_instructions: null,
      },
    },
    clientUserMessageId: crypto.randomUUID(),
  });
  await rpc("turn/interrupt", {
    threadId,
    turnId: implementation.turn.id,
  });
  console.log("Live native Plan workflow passed.");
} finally {
  lines.close();
  child.kill();
  await rm(workspace, { recursive: true, force: true });
}
