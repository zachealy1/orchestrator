import { describe, expect, it } from "vitest";
import { redactInteractionRunEvent } from "./runEventRedaction";

describe("interaction run-event redaction", () => {
  it("persists generated-image lifecycle data without duplicating saved image bytes", () => {
    const projected = redactInteractionRunEvent(
      {
        method: "item/completed",
        params: {
          threadId: "thread-images",
          turnId: "turn-images",
          item: {
            id: "image-1",
            type: "imageGeneration",
            status: "completed",
            savedPath:
              "/Users/test/.codex/generated_images/thread-images/image-1.png",
            result: "very-large-base64-result",
          },
        },
      },
      { browserEnabled: false, desktopEnabled: false },
    );

    expect(projected).toEqual({
      method: "item/completed",
      params: {
        threadId: "thread-images",
        turnId: "turn-images",
        item: {
          id: "image-1",
          type: "imageGeneration",
          status: "completed",
          savedPath:
            "/Users/test/.codex/generated_images/thread-images/image-1.png",
        },
      },
    });
    expect(JSON.stringify(projected)).not.toContain("very-large-base64-result");
  });

  it("retains result fallbacks and structured image-generation failures", () => {
    const resultOnly = redactInteractionRunEvent(
      {
        method: "item/completed",
        params: {
          threadId: "thread-images",
          item: {
            id: "image-result",
            type: "imageGeneration",
            status: "completed",
            result: "cHJldmlldw==",
          },
        },
      },
      { browserEnabled: false, desktopEnabled: false },
    );
    const failure = redactInteractionRunEvent(
      {
        method: "item/completed",
        params: {
          threadId: "thread-images",
          item: {
            id: "image-failed",
            type: "imageGeneration",
            status: "failed",
            result: "",
            failure: {
              type: "usageLimitExceeded",
              limitId: "image_gen",
              resetsAt: 1_788_000_000,
            },
          },
        },
      },
      { browserEnabled: true, desktopEnabled: true },
    );

    expect(resultOnly).toMatchObject({
      params: { item: { result: "cHJldmlldw==" } },
    });
    expect(failure).toMatchObject({
      params: {
        item: {
          failure: {
            type: "usageLimitExceeded",
            limitId: "image_gen",
            resetsAt: 1_788_000_000,
          },
        },
      },
    });
  });

  it("removes browser arguments and results from persisted MCP events", () => {
    const projected = redactInteractionRunEvent(
      {
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "tool-1",
            type: "mcpToolCall",
            server: "playwright",
            tool: "browser_type",
            status: "completed",
            durationMs: 42,
            arguments: {
              text: "my-password",
              url: "https://bank.example/?token=private",
            },
            result: { content: "private page text" },
          },
        },
      },
      { browserEnabled: true, desktopEnabled: false },
    );

    expect(projected).toEqual({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "tool-1",
          type: "mcpToolCall",
          server: "playwright",
          tool: "browser-type",
          status: "completed",
          durationMs: 42,
        },
        redacted: true,
      },
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /my-password|bank\.example|private page text/iu,
    );
  });

  it("removes generated desktop control code", () => {
    const projected = redactInteractionRunEvent(
      {
        method: "item/started",
        params: {
          item: {
            id: "tool-2",
            type: "mcpToolCall",
            server: "node_repl",
            tool: "js",
            arguments: {
              code: "await computer.type({text: 'secret'})",
              title: "Enter a password",
            },
          },
        },
      },
      { browserEnabled: false, desktopEnabled: true },
    );

    expect(JSON.stringify(projected)).not.toMatch(
      /secret|password|computer\.type/iu,
    );
    expect(projected).toMatchObject({ params: { redacted: true } });
  });

  it("does not change ordinary events outside an interaction session", () => {
    const payload = {
      method: "item/completed",
      params: { item: { type: "agentMessage", text: "Visible answer" } },
    };
    expect(
      redactInteractionRunEvent(payload, {
        browserEnabled: false,
        desktopEnabled: false,
      }),
    ).toBe(payload);
  });

  it("redacts approval payloads and process output during an interaction", () => {
    const approval = redactInteractionRunEvent(
      {
        method: "mcpServer/elicitation/request",
        id: 8,
        params: {
          threadId: "thread-1",
          message: "Send account 123 to bank.example?",
          requestedSchema: { password: "secret" },
        },
      },
      {
        browserEnabled: true,
        desktopEnabled: false,
        eventType: "server-request",
      },
    );
    const process = redactInteractionRunEvent(
      { status: "stderr", message: "page contained secret account text" },
      {
        browserEnabled: true,
        desktopEnabled: false,
        eventType: "process",
      },
    );
    expect(approval).toMatchObject({
      method: "mcpServer/elicitation/request",
      id: 8,
      params: { threadId: "thread-1", redacted: true },
    });
    expect(process).toEqual({ status: "stderr", redacted: true });
    expect(JSON.stringify({ approval, process })).not.toMatch(
      /bank\.example|password|secret account/iu,
    );
  });
});
