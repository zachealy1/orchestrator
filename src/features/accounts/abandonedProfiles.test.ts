import { describe, expect, it, vi } from "vitest";
import type { CodexAccountProfile } from "./types";
import {
  cleanupAbandonedCodexProfiles,
  isAbandonedCodexProfile,
} from "./abandonedProfiles";

const abandonedProfile: CodexAccountProfile = {
  id: 10,
  label: "New Codex account",
  email: null,
  plan_type: null,
  status: "signed_out",
  last_error: null,
  last_used_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  deleted_at: null,
};

describe("abandoned Codex profiles", () => {
  it("recognizes only inactive generic profiles without an identity", () => {
    expect(isAbandonedCodexProfile(abandonedProfile, null)).toBe(true);
    expect(isAbandonedCodexProfile(abandonedProfile, 10)).toBe(false);
    expect(
      isAbandonedCodexProfile(
        { ...abandonedProfile, status: "error" },
        null,
      ),
    ).toBe(false);
    expect(
      isAbandonedCodexProfile(
        { ...abandonedProfile, label: "Personal Codex" },
        null,
      ),
    ).toBe(false);
    expect(
      isAbandonedCodexProfile(
        { ...abandonedProfile, email: "user@example.com" },
        null,
      ),
    ).toBe(false);
  });

  it("soft-deletes abandoned rows and removes their local profiles", async () => {
    const retained = {
      ...abandonedProfile,
      id: 3,
      label: "user@example.com",
      email: "user@example.com",
      plan_type: "plus" as const,
      status: "signed_in" as const,
    };
    const softDelete = vi.fn().mockResolvedValue(undefined);
    const deleteProfile = vi.fn().mockResolvedValue(undefined);

    const result = await cleanupAbandonedCodexProfiles(
      [abandonedProfile, retained],
      null,
      softDelete,
      deleteProfile,
    );

    expect(result.accounts).toEqual([retained]);
    expect(result.warnings).toEqual([]);
    expect(softDelete).toHaveBeenCalledWith(10);
    expect(deleteProfile).toHaveBeenCalledWith(10);
  });

  it("keeps a soft-deleted row hidden when filesystem cleanup fails", async () => {
    const result = await cleanupAbandonedCodexProfiles(
      [abandonedProfile],
      null,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockRejectedValue(new Error("Profile directory is busy")),
    );

    expect(result.accounts).toEqual([]);
    expect(result.warnings).toEqual(["Profile directory is busy"]);
  });
});
