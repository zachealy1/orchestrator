import { describe, expect, it, vi } from "vitest";
import {
  requestGroupChannel,
  reviewRequestNoun,
  reviewRequestNumber,
  type KanbanPullRequestRecord,
} from "./api";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
describe("provider-aware review labels", () => {
  it("preserves GitHub labels and distinguishes GitLab and mixed requests", () => {
    const github = { number: 12 } as KanbanPullRequestRecord;
    const gitlab = {
      provider: "gitlab",
      number: 12,
    } as KanbanPullRequestRecord;
    expect(reviewRequestNumber(github)).toBe("#12");
    expect(reviewRequestNumber(gitlab)).toBe("!12");
    expect(reviewRequestNoun(requestGroupChannel([github]))).toBe(
      "pull request",
    );
    expect(reviewRequestNoun(requestGroupChannel([gitlab]))).toBe(
      "merge request",
    );
    expect(reviewRequestNoun(requestGroupChannel([github, gitlab]))).toBe(
      "review request",
    );
  });
});
