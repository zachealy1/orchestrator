import { expect, it, vi } from "vitest";
import type { FrontendDatabase } from "../database";
import { createRunRepository } from "./runs";

it("keeps the legacy prompt column compatible using the original request", async () => {
  const execute = vi.fn().mockResolvedValue({ lastInsertId: 1 });
  const database = {
    get: async () => ({ execute }),
    selectOne: vi.fn().mockResolvedValue({ id: 1 }),
  } as unknown as FrontendDatabase;
  const request = "Why am I seeing this error in the orchestrator UI?";
  await createRunRepository(database).createTask({
    workspaceId: 2, originalPrompt: request,
    routeRecommendation: "direct-run", budgetTokens: 30,
  });
  expect(execute).toHaveBeenCalledWith(expect.stringContaining("improved_prompt"), [
    2, null, null, request, request, "direct-run", 30,
  ]);
});
