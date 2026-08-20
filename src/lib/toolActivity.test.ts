import { describe, expect, it } from "vitest";
import {
  describeToolActivity,
  normalizeToolActivityStatus,
} from "./toolActivity";

describe("tool activity presentation", () => {
  it("uses a safe agent title and changes tense with lifecycle state", () => {
    const item = {
      type: "mcpToolCall",
      server: "node_repl",
      tool: "js",
      arguments: { title: "Check available browser connections" },
    };

    expect(describeToolActivity(item, "running")).toMatchObject({
      category: "browser",
      label: "Checking available browser connections",
    });
    expect(describeToolActivity(item, "completed").label).toBe(
      "Checked available browser connections",
    );
    expect(describeToolActivity(item, "failed").label).toBe(
      "Could not check available browser connections",
    );
  });

  it("formats known GitHub and browser tools without protocol names", () => {
    expect(
      describeToolActivity(
        {
          type: "mcpToolCall",
          server: "codex_apps",
          tool: "github.get_pr_info",
          arguments: { repo_full_name: "openai/orchestrator" },
        },
        "completed",
      ),
    ).toMatchObject({
      category: "github",
      label: "Read pull request details",
      safeDetails: [{ label: "Repository", value: "openai/orchestrator" }],
    });

    expect(
      describeToolActivity(
        {
          type: "mcpToolCall",
          server: "playwright",
          tool: "browser_take_screenshot",
        },
        "running",
      ).label,
    ).toBe("Capturing a page screenshot");
  });

  it("redacts sensitive arguments, code, result data, and URL details", () => {
    const presentation = describeToolActivity(
      {
        type: "mcpToolCall",
        server: "playwright",
        tool: "browser_type",
        arguments: {
          title: "Enter password token secret",
          text: "private input",
          code: "console.log('private')",
          url: "https://user:pass@example.com/account?token=private",
          path: "/workspace/src/App.tsx",
          action: "type",
        },
        result: { content: "private result" },
      },
      "running",
    );

    expect(presentation.label).toBe("Entering text in the browser");
    expect(presentation.safeDetails).toEqual([
      { label: "File", value: "App.tsx" },
      { label: "Action", value: "type" },
    ]);
    expect(JSON.stringify(presentation)).not.toMatch(
      /private|password|token|console\.log|user:pass/iu,
    );
  });

  it("normalizes protocol status variants", () => {
    expect(normalizeToolActivityStatus("inProgress", "pending")).toBe("running");
    expect(normalizeToolActivityStatus("error", "running")).toBe("failed");
    expect(normalizeToolActivityStatus("declined", "running")).toBe("declined");
    expect(normalizeToolActivityStatus("cancelled", "running")).toBe(
      "interrupted",
    );
  });

  it("converts progressive titles to completed tense", () => {
    const item = {
      type: "mcpToolCall",
      server: "node_repl",
      tool: "js",
      arguments: { title: "Opening the local app for visual verification" },
    };
    expect(describeToolActivity(item, "running").label).toBe(
      "Opening the local app for visual verification",
    );
    expect(describeToolActivity(item, "completed").label).toBe(
      "Opened the local app for visual verification",
    );
  });

  it("uses an application-owned fallback for opaque dynamic tools", () => {
    expect(
      describeToolActivity(
        { type: "dynamicToolCall", server: "node_repl", tool: "js" },
        "running",
      ),
    ).toMatchObject({
      category: "integration",
      label: "Using an integration",
    });
  });
});
