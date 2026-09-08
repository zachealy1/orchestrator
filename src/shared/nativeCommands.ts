// The generated binding transport is the only production owner of raw IPC.
import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { assertWorkMayStart } from "./updateInterlock";
const pending = new Set<Promise<unknown>>();
const flushCommands = new Set(["append_run_events_transaction"]);

export function applicationInvoke<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  const send = () => options !== undefined ? invoke<T>(command, args, options)
    : args !== undefined ? invoke<T>(command, args) : invoke<T>(command);
  if (command.startsWith("app_update_")) return send();
  if (!flushCommands.has(command)) {
    try { assertWorkMayStart(); } catch (error) { return Promise.reject(error); }
  }
  const request = send();
  pending.add(request);
  void request.then(() => pending.delete(request), () => pending.delete(request));
  return request;
}
export async function flushNativeCommands() {
  while (pending.size > 0) await Promise.all([...pending]);
}
