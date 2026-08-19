import { describe, expect, it } from "vitest";
import {
  profileKeyForAccountId,
  readActiveCodexTurnId,
} from "./runtimeHelpers";

describe("Codex runtime helpers", () => {
  it("maps the synthetic shared account to the default profile", () => {
    expect(profileKeyForAccountId(0)).toBe("default");
    expect(profileKeyForAccountId(null)).toBe("default");
    expect(profileKeyForAccountId(7)).toBe("account:7");
  });

  it("returns only the latest nonterminal native turn", () => {
    expect(
      readActiveCodexTurnId({
        turns: [
          { id: "turn-complete", status: "completed" },
          { id: "turn-active", status: "inProgress" },
        ],
      }),
    ).toBe("turn-active");
    expect(
      readActiveCodexTurnId({
        turns: [
          { id: "turn-failed", status: "failed" },
          { id: "turn-cancelled", status: "cancelled" },
        ],
      }),
    ).toBeNull();
  });
});
