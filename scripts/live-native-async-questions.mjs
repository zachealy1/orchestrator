import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

if (process.env.RUN_CODEX_LIVE_ASYNC_QUESTIONS_TEST !== "1") {
  console.log("Skipped. Set RUN_CODEX_LIVE_ASYNC_QUESTIONS_TEST=1 to run the native async-question test.");
  process.exit(0);
}
let binary = process.env.CODEX_BIN;
if (!binary) {
  const pin = JSON.parse(await readFile(new URL("../src-tauri/resources/codex-engine/release.json", import.meta.url), "utf8"));
  const versions = join(homedir(), "Library/Application Support/com.zachealy.orchestrator/codex-engine/versions");
  const slots = await readdir(versions);
  const slot = slots.find(name => name.startsWith(`${pin.version}-`) && name.split("-").length === 3);
  binary = slot ? join(versions, slot, "codex") : null;
}
assert(binary, "Set CODEX_BIN to the pinned engine executable");
const cwd = await mkdtemp(join(tmpdir(), "orchestrator-async-questions-"));
await writeFile(join(cwd, "fixture.txt"), "independent-work\n");
const child = spawn(binary, ["app-server", "--enable", "default_mode_request_user_input"], { stdio: ["pipe", "pipe", "pipe"] });
const pending = new Map(), messages = [], waiters = new Set();
let nextId = 0;
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject }); send({ id, method, params });
});
const waitFor = (predicate, timeout = 120_000) => new Promise((resolve, reject) => {
  const existing = messages.find(predicate);
  if (existing) return resolve(existing);
  const timer = setTimeout(() => { waiters.delete(check); reject(Error("Timed out waiting for native event")); }, timeout);
  const check = m => { if (predicate(m)) { clearTimeout(timer); waiters.delete(check); resolve(m); } };
  waiters.add(check);
});
createInterface({ input: child.stdout }).on("line", line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id !== undefined && !m.method) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result); return;
  }
  if (m.id !== undefined) send({ id: m.id, error: { code: -32000, message: "No blocking requests expected in this smoke test" } });
  messages.push(m); for (const check of waiters) check(m);
});
let stderr = "";
child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
child.once("exit", code => {
  for (const p of pending.values()) p.reject(Error(`Native engine exited (${code})`));
  pending.clear();
});
const deadline = setTimeout(() => child.kill(), 180_000);
try {
  await rpc("initialize", { clientInfo: { name: "orchestrator_async_question_test", version: "0.1.0" }, capabilities: { experimentalApi: true } });
  send({ method: "initialized" });
  const features = [];
  let cursor;
  do {
    const page = await rpc("experimentalFeature/list", { limit: 100, cursor });
    features.push(...page.data); cursor = page.nextCursor;
  } while (cursor);
  assert(features.some(f => f.name === "default_mode_request_user_input" && f.enabled));
  const start = await rpc("thread/start", { cwd, approvalPolicy: "never", sandbox: "read-only", ephemeral: true });
  const threadId = start.thread.id;
  const turn = await rpc("turn/start", { threadId, input: [{ type: "text", text: "This is an integration test. Use request_user_input_async to ask which color to use, with Blue and Green options. Then, before receiving the answer, use exec_command to read fixture.txt and run sleep 15 in the same command. Continue waiting using short sleep tool calls until my answer arrives. Do not finish before the answer. After receiving my answer, respond with exactly the color I supplied. Do not edit files.", text_elements: [] }] });
  const turnId = turn.turn.id;
  const question = await waitFor(m => m.method === "item/completed" && m.params?.turnId === turnId && m.params?.item?.delivery === "async");
  console.log("Native async question received.");
  const item = question.params.item;
  assert(item.type === "agentMessage"); assert(item.questions?.length);
  await waitFor(m => m.method === "item/started" && m.params?.turnId === turnId && m.params?.item?.type === "commandExecution" && messages.indexOf(m) > messages.indexOf(question));
  assert(!messages.some(m => m.method === "turn/completed" && m.params?.turn?.id === turnId));
  console.log("Independent command started while the question remained unanswered.");
  const reply = [{ questionItemId: JSON.stringify(["request_user_input_async", item.id, 0]), question: item.questions[0].title, answer: "Green" }];
  await rpc("turn/steer", { threadId, expectedTurnId: turnId, clientUserMessageId: crypto.randomUUID(), input: [{ type: "text", text: `<send_user_message_question_reply>\n${JSON.stringify(reply)}\n</send_user_message_question_reply>`, text_elements: [] }] });
  await waitFor(m => m.method === "turn/completed" && m.params?.turn?.id === turnId);
  const answers = messages.filter(m => m.method === "item/completed" && m.params?.item?.type === "agentMessage" && m.params.item.delivery !== "async");
  assert.match(answers.at(-1)?.params.item.text ?? "", /Green/i);
  assert(!messages.some(m => m.method === "item/tool/requestUserInput"));
  console.log("PASS: native question → continued work → steered answer → incorporated answer.");
} catch (error) {
  console.error(stderr); throw error;
} finally {
  clearTimeout(deadline); child.kill(); await rm(cwd, { recursive: true, force: true });
}
