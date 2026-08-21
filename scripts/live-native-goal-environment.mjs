import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

if (process.env.RUN_CODEX_LIVE_GOAL_ENVIRONMENT_TEST !== "1") {
  console.log(
    "Skipped. Set RUN_CODEX_LIVE_GOAL_ENVIRONMENT_TEST=1 to run the live Goal environment test.",
  );
  process.exit(0);
}

const execFileAsync = promisify(execFile);
const codexBin =
  process.env.CODEX_BIN ?? "/Applications/ChatGPT.app/Contents/Resources/codex";
const fixtureRoot = await mkdtemp(join(tmpdir(), "orchestrator-live-goal-env-"));
const sourceWorkspace = join(fixtureRoot, "source");
const executionRoot = join(fixtureRoot, "card");
const worktree = join(executionRoot, "repository");
let child = null;
let lines = null;

async function git(args, cwd) {
  await execFileAsync("git", args, { cwd });
}

try {
  await mkdir(sourceWorkspace, { recursive: true });
  await mkdir(executionRoot, { recursive: true });
  await git(["init", "-b", "main"], sourceWorkspace);
  await writeFile(join(sourceWorkspace, "README.md"), "# Goal environment fixture\n");
  await git(["add", "README.md"], sourceWorkspace);
  await git(
    [
      "-c",
      "user.name=Orchestrator Test",
      "-c",
      "user.email=orchestrator@example.invalid",
      "commit",
      "-m",
      "Create fixture",
    ],
    sourceWorkspace,
  );
  await git(
    ["worktree", "add", "-b", "codex/goal-environment-probe", worktree],
    sourceWorkspace,
  );

  child = spawn(
    codexBin,
    [
      "app-server",
      "--enable",
      "request_permissions_tool",
      "--listen",
      "stdio://",
      "-c",
      'default_permissions="orchestrator_workspace_network_v1"',
      "-c",
      'permissions.orchestrator_workspace_network_v1.description="Goal environment test"',
      "-c",
      'permissions.orchestrator_workspace_network_v1.extends=":workspace"',
      "-c",
      "permissions.orchestrator_workspace_network_v1.network.enabled=true",
      "-c",
      'permissions.orchestrator_workspace_network_v1.network.mode="full"',
    ],
    { stdio: ["pipe", "pipe", "inherit"], env: process.env },
  );
  lines = createInterface({ input: child.stdout });
  const pending = new Map();
  const notifications = [];
  const notificationWaiters = new Set();
  let nextId = 1;

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const rpc = (method, params = {}) => {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(String(id), { resolve, reject });
    });
  };
  const waitForNotification = (predicate, timeoutMs = 10_000) => {
    const existing = notifications.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        notificationWaiters.delete(onMessage);
        reject(new Error("Timed out waiting for the shell environment probe."));
      }, timeoutMs);
      const onMessage = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        notificationWaiters.delete(onMessage);
        resolve(message);
      };
      notificationWaiters.add(onMessage);
    });
  };

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
    notifications.push(message);
    for (const waiter of notificationWaiters) waiter(message);
    if (message.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: `Unexpected request: ${message.method}` },
      });
    }
  });

  await rpc("initialize", {
    clientInfo: {
      name: "orchestrator-live-goal-environment-test",
      title: "Orchestrator live Goal environment test",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true, requestAttestation: false },
  });
  send({ jsonrpc: "2.0", method: "initialized", params: {} });

  const roots = [executionRoot, worktree];
  const started = await rpc("thread/start", {
    cwd: sourceWorkspace,
    runtimeWorkspaceRoots: roots,
    environments: [
      {
        environmentId: "local",
        cwd: executionRoot,
        runtimeWorkspaceRoots: roots,
      },
    ],
    permissions: "orchestrator_workspace_network_v1",
    approvalPolicy: "on-request",
    serviceName: "orchestrator-live-goal-environment-test",
    threadSource: "orchestrator",
    ephemeral: true,
  });
  if (
    started.thread?.cwd !== sourceWorkspace ||
    started.cwd !== sourceWorkspace
  ) {
    throw new Error("The thread did not retain the source workspace identity.");
  }
  if (JSON.stringify(started.runtimeWorkspaceRoots) !== JSON.stringify(roots)) {
    throw new Error("The thread returned unexpected runtime workspace roots.");
  }

  const completed = waitForNotification(
    (message) =>
      message.method === "item/completed" &&
      message.params?.threadId === started.thread.id &&
      message.params?.item?.type === "commandExecution" &&
      message.params?.item?.source === "userShell",
  );
  await rpc("thread/shellCommand", {
    threadId: started.thread.id,
    command: "/bin/pwd",
  });
  const shellItem = (await completed).params.item;
  if (shellItem.status !== "completed" || shellItem.exitCode !== 0) {
    throw new Error("The sticky environment shell probe failed.");
  }
  if (shellItem.cwd !== executionRoot) {
    throw new Error(
      `The sticky environment used ${shellItem.cwd ?? "no cwd"} instead of ${executionRoot}.`,
    );
  }

  console.log("Live native Goal environment workflow passed.");
} finally {
  lines?.close();
  child?.kill();
  await rm(fixtureRoot, { recursive: true, force: true });
}
