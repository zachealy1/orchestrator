import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const codexBinary = process.env.ORCHESTRATOR_CODEX_BIN || "codex";
const workspace = await mkdtemp(join(tmpdir(), "orchestrator-native-approval-"));
const approvedSentinel = join(workspace, "approved.txt");
const rejectedSentinel = join(workspace, "rejected.txt");
const canceledSentinel = join(workspace, "canceled.txt");
const networkSentinel = join(workspace, "network.txt");
const listenerSentinel = join(workspace, "listener.txt");
const outsideSentinel = join(
  tmpdir(),
  `orchestrator-native-permission-${process.pid}-${Date.now()}.txt`,
);
const codexHome = join(workspace, ".codex-home");
const permissionProfile = "orchestrator_workspace_network_v1";

function responseEvent(id) {
  return { type: "response.created", response: { id } };
}

function completedEvent(id) {
  return {
    type: "response.completed",
    response: {
      id,
      usage: {
        input_tokens: 0,
        input_tokens_details: null,
        output_tokens: 0,
        output_tokens_details: null,
        total_tokens: 0,
      },
    },
  };
}

function functionCallResponse(id, callId, name, args) {
  return toSse([
    responseEvent(id),
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: callId,
        name,
        arguments: JSON.stringify(args),
      },
    },
    completedEvent(id),
  ]);
}

function toolCallResponse(id, callId, command) {
  return functionCallResponse(id, callId, "shell_command", {
    command,
    workdir: workspace,
    timeout_ms: 10_000,
  });
}

function assistantResponse(id, messageId, text) {
  return toSse([
    responseEvent(id),
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        role: "assistant",
        id: messageId,
        content: [{ type: "output_text", text }],
      },
    },
    completedEvent(id),
  ]);
}

function toSse(events) {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

let toolResponseBodies = [];
const assistantResponseBodies = new Map([
  [
    "call-approved",
    assistantResponse(
      "response-approved-done",
      "message-approved",
      "Approved command handled.",
    ),
  ],
  [
    "call-rejected",
    assistantResponse(
      "response-rejected-done",
      "message-rejected",
      "Rejected command handled.",
    ),
  ],
  [
    "call-canceled",
    assistantResponse(
      "response-canceled-done",
      "message-canceled",
      "Canceled command handled.",
    ),
  ],
  [
    "call-safe",
    assistantResponse(
      "response-safe-done",
      "message-safe",
      "Safe command handled.",
    ),
  ],
  [
    "call-network",
    assistantResponse(
      "response-network-done",
      "message-network",
      "Approved network command handled.",
    ),
  ],
  [
    "call-listener",
    assistantResponse(
      "response-listener-done",
      "message-listener",
      "Approved TCP listener command handled.",
    ),
  ],
  [
    "call-permission-approved",
    toolCallResponse(
      "response-outside-write-call",
      "call-outside-write",
      `/bin/sh -c 'printf outside-approved > "${outsideSentinel}"'`,
    ),
  ],
  [
    "call-outside-write",
    assistantResponse(
      "response-outside-write-done",
      "message-outside-write",
      "Approved outside-workspace write handled.",
    ),
  ],
  [
    "call-permission-repeated",
    assistantResponse(
      "response-outside-denied-done",
      "message-outside-denied",
      "Repeated outside-workspace permission was denied.",
    ),
  ],
]);
let toolResponseIndex = 0;
const mockResponsesServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/network-smoke") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("network-ok");
    return;
  }
  if (request.method !== "POST" || !request.url?.endsWith("/responses")) {
    response.writeHead(404).end();
    return;
  }
  let requestBody = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    requestBody += chunk;
  });
  request.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(requestBody);
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: `Invalid request JSON: ${error.message}` } }),
      );
      return;
    }
    const lastInput = Array.isArray(payload.input) ? payload.input.at(-1) : null;
    const isToolOutput =
      lastInput?.type === "function_call_output" ||
      lastInput?.type === "custom_tool_call_output";
    const body = isToolOutput
      ? assistantResponseBodies.get(lastInput.call_id)
      : toolResponseBodies[toolResponseIndex++];
    if (!body) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message: `Unexpected model request after input ${JSON.stringify(lastInput)}`,
          },
        }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(body);
  });
});
await new Promise((resolve, reject) => {
  mockResponsesServer.once("error", reject);
  mockResponsesServer.listen(0, "127.0.0.1", resolve);
});
const mockAddress = mockResponsesServer.address();
if (!mockAddress || typeof mockAddress === "string") {
  throw new Error("Could not determine the local Responses endpoint");
}
toolResponseBodies = [
  toolCallResponse(
    "response-approved-call",
    "call-approved",
    `/bin/sh -c 'printf approved > "${approvedSentinel}"'`,
  ),
  toolCallResponse(
    "response-rejected-call",
    "call-rejected",
    `/bin/sh -c 'printf rejected > "${rejectedSentinel}"'`,
  ),
  toolCallResponse(
    "response-canceled-call",
    "call-canceled",
    `/bin/sh -c 'printf canceled > "${canceledSentinel}"'`,
  ),
  toolCallResponse(
    "response-network-call",
    "call-network",
    `python3 -c 'import pathlib, urllib.request; pathlib.Path("${networkSentinel}").write_text(urllib.request.urlopen("http://127.0.0.1:${mockAddress.port}/network-smoke").read().decode())'`,
  ),
  toolCallResponse(
    "response-listener-call",
    "call-listener",
    `python3 -c 'import pathlib, socket; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); pathlib.Path("${listenerSentinel}").write_text(str(sock.getsockname()[1])); sock.close()'`,
  ),
  functionCallResponse(
    "response-permission-approved-call",
    "call-permission-approved",
    "request_permissions",
    {
      permissions: {
        file_system: {
          entries: [
            {
              access: "write",
              path: { type: "path", path: outsideSentinel },
            },
          ],
        },
      },
      reason: "Write a controlled native approval test file outside the workspace.",
    },
  ),
  functionCallResponse(
    "response-permission-repeated-call",
    "call-permission-repeated",
    "request_permissions",
    {
      permissions: {
        file_system: {
          entries: [
            {
              access: "write",
              path: { type: "path", path: outsideSentinel },
            },
          ],
        },
      },
      reason: "Verify the earlier turn-scoped permission did not persist.",
    },
  ),
  toolCallResponse("response-safe-call", "call-safe", "pwd"),
];
await mkdir(codexHome, { recursive: true });
await writeFile(
  join(codexHome, "config.toml"),
  [
    'model = "mock-model"',
    'model_provider = "orchestrator_native_approval_test"',
    'approval_policy = "untrusted"',
    `default_permissions = "${permissionProfile}"`,
    "",
    `[permissions.${permissionProfile}]`,
    'description = "Workspace access with internet and TCP listeners for Orchestrator Ask for approval"',
    'extends = ":workspace"',
    "",
    `[permissions.${permissionProfile}.network]`,
    "enabled = true",
    'mode = "full"',
    "",
    "[model_providers.orchestrator_native_approval_test]",
    'name = "Orchestrator native approval test"',
    `base_url = "http://127.0.0.1:${mockAddress.port}/v1"`,
    'wire_api = "responses"',
    "request_max_retries = 0",
    "stream_max_retries = 0",
    "supports_websockets = false",
    "",
  ].join("\n"),
);
const child = spawn(
  codexBinary,
  ["app-server", "--enable", "request_permissions_tool", "--stdio"],
  {
    cwd: workspace,
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const stderr = [];
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => stderr.push(chunk));

let nextId = 1;
const pendingResponses = new Map();
const messages = [];
const messageWaiters = new Set();

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params, timeoutMs = 120_000) {
  const id = nextId++;
  send({ id, method, params });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    pendingResponses.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

function publish(message) {
  for (const waiter of messageWaiters) {
    if (!waiter.predicate(message)) continue;
    messageWaiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
    return;
  }
  messages.push(message);
}

function waitForMessage(predicate, label, timeoutMs = 120_000) {
  const existingIndex = messages.findIndex(predicate);
  if (existingIndex >= 0) {
    return Promise.resolve(messages.splice(existingIndex, 1)[0]);
  }
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      messageWaiters.delete(waiter);
      const observed = messages
        .slice(-20)
        .map((message) => message.method ?? `response:${message.id}`)
        .join(", ");
      reject(
        new Error(
          `Timed out waiting for ${label}. Recent messages: ${observed || "none"}`,
        ),
      );
    }, timeoutMs);
    messageWaiters.add(waiter);
  });
}

createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    throw new Error(`Codex emitted invalid JSONL: ${error.message}\n${line}`);
  }
  if (message.id !== undefined && message.method === undefined) {
    const pending = pendingResponses.get(message.id);
    if (pending) {
      pendingResponses.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
  }
  publish(message);
});

child.on("exit", (code, signal) => {
  const error = new Error(
    `Codex app-server exited early (code=${code}, signal=${signal}).\n${stderr.join("")}`,
  );
  for (const pending of pendingResponses.values()) pending.reject(error);
  pendingResponses.clear();
  for (const waiter of messageWaiters) waiter.reject(error);
  messageWaiters.clear();
});

function isApprovalRequest(message) {
  return (
    message.id !== undefined &&
    (message.method === "item/commandExecution/requestApproval" ||
      message.method === "item/fileChange/requestApproval" ||
      message.method === "item/permissions/requestApproval")
  );
}

function selectOfferedCommandDecision(message, preferredDecisions) {
  if (message.method !== "item/commandExecution/requestApproval") {
    throw new Error(
      `Expected a command approval request, received ${message.method}`,
    );
  }
  const availableDecisions = message.params?.availableDecisions;
  if (!Array.isArray(availableDecisions)) {
    throw new Error(
      `The native command approval omitted availableDecisions: ${JSON.stringify(message)}`,
    );
  }
  const selected = preferredDecisions.find((decision) =>
    availableDecisions.some((available) => available === decision),
  );
  if (!selected) {
    throw new Error(
      `None of ${JSON.stringify(preferredDecisions)} was offered by the runtime: ${JSON.stringify(availableDecisions)}`,
    );
  }
  return selected;
}

function isTurnCompleted(turnId) {
  return (message) =>
    message.method === "turn/completed" && message.params?.turn?.id === turnId;
}

async function waitForApproval(turnId, label) {
  const message = await waitForMessage(
    (candidate) =>
      isApprovalRequest(candidate) ||
      candidate.method === "error" ||
      isTurnCompleted(turnId)(candidate),
    label,
  );
  if (!isApprovalRequest(message)) {
    throw new Error(
      `The turn ended before Codex requested approval: ${JSON.stringify(message)}`,
    );
  }
  return message;
}

async function waitForPermissionApproval(turnId, label) {
  const message = await waitForApproval(turnId, label);
  if (message.method !== "item/permissions/requestApproval") {
    throw new Error(
      `Expected a filesystem permission approval request, received ${message.method}`,
    );
  }
  return message;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

try {
  await request("initialize", {
    clientInfo: {
      name: "orchestrator-native-approval-smoke",
      title: "Orchestrator native approval smoke test",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
    },
  });
  send({ method: "notifications/initialized" });

  const featureList = await request("experimentalFeature/list", { limit: 100 });
  const permissionFeature = featureList.data?.find(
    (feature) => feature.name === "request_permissions_tool",
  );
  if (!permissionFeature?.enabled) {
    throw new Error(
      `request_permissions_tool was not enabled: ${JSON.stringify(permissionFeature)}`,
    );
  }

  const started = await request("thread/start", {
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    serviceName: "orchestrator-native-approval-smoke",
    threadSource: "orchestrator",
  });
  if (started.approvalPolicy !== "untrusted") {
    throw new Error(`Unexpected active approval policy: ${started.approvalPolicy}`);
  }
  if (started.activePermissionProfile?.id !== permissionProfile) {
    throw new Error(
      `Unexpected active permission profile: ${JSON.stringify(started.activePermissionProfile)}`,
    );
  }
  const threadId = started.thread.id;

  const approvedTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: `Run exactly this command and do nothing else: /bin/sh -c 'printf approved > "${approvedSentinel}"'`,
        text_elements: [],
      },
    ],
  });
  const approval = await waitForApproval(
    approvedTurn.turn.id,
    "an approval-required command",
  );
  await delay(750);
  if (await exists(approvedSentinel)) {
    throw new Error("The command ran before its native approval was answered");
  }
  const acceptedDecision = selectOfferedCommandDecision(approval, ["accept"]);
  send({ id: approval.id, result: { decision: acceptedDecision } });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === approval.id,
    "serverRequest/resolved after approval",
  );
  await waitForMessage(
    isTurnCompleted(approvedTurn.turn.id),
    "the approved turn to complete",
  );
  if ((await readFile(approvedSentinel, "utf8")) !== "approved") {
    throw new Error("The approved command did not produce the expected output");
  }

  const rejectedTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: `Run exactly this command once. If permission is denied, do not retry or use another tool: /bin/sh -c 'printf rejected > "${rejectedSentinel}"'`,
        text_elements: [],
      },
    ],
  });
  const rejection = await waitForApproval(
    rejectedTurn.turn.id,
    "the command that will be rejected",
  );
  if (await exists(rejectedSentinel)) {
    throw new Error("The second command ran before its native approval was answered");
  }
  const rejectedDecision = selectOfferedCommandDecision(rejection, [
    "decline",
    "cancel",
  ]);
  send({ id: rejection.id, result: { decision: rejectedDecision } });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === rejection.id,
    "serverRequest/resolved after rejection",
  );
  await waitForMessage(
    isTurnCompleted(rejectedTurn.turn.id),
    "the rejected turn to complete",
  );
  if (await exists(rejectedSentinel)) {
    throw new Error(
      `The rejected command ran after Codex received ${rejectedDecision}`,
    );
  }

  const canceledTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Exercise native cancel handling.",
        text_elements: [],
      },
    ],
  });
  const cancellation = await waitForApproval(
    canceledTurn.turn.id,
    "the command that will be canceled",
  );
  await delay(250);
  if (await exists(canceledSentinel)) {
    throw new Error("The third command ran before its native approval was answered");
  }
  const canceledDecision = selectOfferedCommandDecision(cancellation, ["cancel"]);
  send({ id: cancellation.id, result: { decision: canceledDecision } });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === cancellation.id,
    "serverRequest/resolved after cancellation",
  );
  await waitForMessage(
    isTurnCompleted(canceledTurn.turn.id),
    "the canceled operation's turn to complete",
  );
  if (await exists(canceledSentinel)) {
    throw new Error("The canceled command ran after Codex received a cancel decision");
  }

  const networkTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Run the supplied HTTP connectivity command exactly once.",
        text_elements: [],
      },
    ],
  });
  const networkApproval = await waitForApproval(
    networkTurn.turn.id,
    "the HTTP connectivity command approval",
  );
  await delay(250);
  if (await exists(networkSentinel)) {
    throw new Error("The network command ran before its approval was answered");
  }
  send({
    id: networkApproval.id,
    result: {
      decision: selectOfferedCommandDecision(networkApproval, ["accept"]),
    },
  });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === networkApproval.id,
    "serverRequest/resolved after network approval",
  );
  await waitForMessage(
    isTurnCompleted(networkTurn.turn.id),
    "the approved network turn to complete",
  );
  if ((await readFile(networkSentinel, "utf8")) !== "network-ok") {
    throw new Error("The approved command could not reach the test HTTP endpoint");
  }

  const listenerTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Run the supplied TCP listener command exactly once.",
        text_elements: [],
      },
    ],
  });
  const listenerApproval = await waitForApproval(
    listenerTurn.turn.id,
    "the TCP listener command approval",
  );
  await delay(250);
  if (await exists(listenerSentinel)) {
    throw new Error("The listener command ran before its approval was answered");
  }
  send({
    id: listenerApproval.id,
    result: {
      decision: selectOfferedCommandDecision(listenerApproval, ["accept"]),
    },
  });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === listenerApproval.id,
    "serverRequest/resolved after listener approval",
  );
  await waitForMessage(
    isTurnCompleted(listenerTurn.turn.id),
    "the approved listener turn to complete",
  );
  const listenerPort = Number.parseInt(
    await readFile(listenerSentinel, "utf8"),
    10,
  );
  if (!Number.isInteger(listenerPort) || listenerPort <= 0) {
    throw new Error("The approved command did not bind a TCP listener");
  }

  const outsideWriteTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Request the supplied exact outside-workspace permission, then run the supplied write command.",
        text_elements: [],
      },
    ],
  });
  const outsidePermission = await waitForPermissionApproval(
    outsideWriteTurn.turn.id,
    "the outside-workspace filesystem permission request",
  );
  await delay(250);
  if (await exists(outsideSentinel)) {
    throw new Error(
      "The outside-workspace file was created before path access was approved",
    );
  }
  send({
    id: outsidePermission.id,
    result: {
      permissions: outsidePermission.params.permissions,
      scope: "turn",
    },
  });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === outsidePermission.id,
    "serverRequest/resolved after outside path approval",
  );
  const outsideCommandApproval = await waitForApproval(
    outsideWriteTurn.turn.id,
    "the separately approval-gated outside write command",
  );
  if (outsideCommandApproval.method !== "item/commandExecution/requestApproval") {
    throw new Error(
      `Expected a separate command approval after granting the path, received ${outsideCommandApproval.method}`,
    );
  }
  if (await exists(outsideSentinel)) {
    throw new Error(
      "Approving the path unexpectedly approved the write command as well",
    );
  }
  send({
    id: outsideCommandApproval.id,
    result: {
      decision: selectOfferedCommandDecision(outsideCommandApproval, ["accept"]),
    },
  });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === outsideCommandApproval.id,
    "serverRequest/resolved after outside write command approval",
  );
  await waitForMessage(
    isTurnCompleted(outsideWriteTurn.turn.id),
    "the approved outside-workspace write turn to complete",
  );
  if ((await readFile(outsideSentinel, "utf8")) !== "outside-approved") {
    throw new Error(
      "The turn-scoped exact path grant did not permit the approved outside write",
    );
  }
  await rm(outsideSentinel, { force: true });

  const repeatedPermissionTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Request the same supplied outside-workspace permission again.",
        text_elements: [],
      },
    ],
  });
  const repeatedPermission = await waitForPermissionApproval(
    repeatedPermissionTurn.turn.id,
    "the repeated outside-workspace filesystem permission request",
  );
  send({
    id: repeatedPermission.id,
    result: { permissions: {}, scope: "turn" },
  });
  await waitForMessage(
    (message) =>
      message.method === "serverRequest/resolved" &&
      message.params?.requestId === repeatedPermission.id,
    "serverRequest/resolved after repeated path denial",
  );
  await waitForMessage(
    isTurnCompleted(repeatedPermissionTurn.turn.id),
    "the denied repeated permission turn to complete",
  );
  if (await exists(outsideSentinel)) {
    throw new Error(
      "The earlier turn-scoped grant remained active in a later turn",
    );
  }

  const safeTurn = await request("turn/start", {
    threadId,
    cwd: workspace,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    permissions: permissionProfile,
    input: [
      {
        type: "text",
        text: "Exercise a known-safe read-only command.",
        text_elements: [],
      },
    ],
  });
  const safeOutcome = await waitForMessage(
    (message) =>
      isApprovalRequest(message) ||
      message.method === "error" ||
      isTurnCompleted(safeTurn.turn.id)(message),
    "the known-safe command turn",
  );
  if (isApprovalRequest(safeOutcome)) {
    throw new Error(
      `The known-safe pwd command unexpectedly requested approval: ${JSON.stringify(safeOutcome)}`,
    );
  }
  if (safeOutcome.method === "error") {
    throw new Error(`The known-safe command failed: ${JSON.stringify(safeOutcome)}`);
  }

  process.stdout.write(
    [
      "Native Codex approval smoke test passed.",
      `Thread: ${threadId}`,
      `Approval method: ${approval.method}`,
      `Runtime-offered decisions exercised: ${acceptedDecision}, ${rejectedDecision}, ${canceledDecision}`,
      `Approved listener port: ${listenerPort}`,
      "Verified: unanswered commands stayed blocked; approved commands wrote workspace files, reached HTTP, and bound TCP; exact outside-workspace writes required turn-scoped path approval plus separate command approval; the path required approval again on the next turn; rejected and canceled commands did not run; a safe read-only command completed without prompting.",
    ].join("\n") + "\n",
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2_000),
    ]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  await rm(outsideSentinel, { force: true });
  await new Promise((resolve) => mockResponsesServer.close(resolve));
  await rm(workspace, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
