import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "../../generated/tauri";
import * as api from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it("only exposes engine status and provisioning", async () => {
  const status = { source: "managed", installedVersion: "0.153.4", message: null };
  vi.mocked(invoke).mockResolvedValue(status);
  expect(Object.keys(api)).toEqual(["readEngineStatus"]);
  expect(await api.readEngineStatus()).toEqual(status);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("codex_engine_status");
});

it("does not register native update actions", () => {
  expect(commands).not.toHaveProperty("codexEngineCheck");
  expect(commands).not.toHaveProperty("codexEnginePrepareUpdate");
});
