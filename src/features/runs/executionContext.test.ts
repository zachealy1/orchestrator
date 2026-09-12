import { describe, expect, it, vi } from "vitest";
import type { ComposerContextFile } from "../composer/types";
import { resolveExecutionContext, readExecutionFileContext } from "./executionContext";

const bindings = [{ sourceRepositoryPath: "/source/repo", worktreePath: "/cards/1/repo" }];
const file = (path = "/source/repo/README.md"): ComposerContextFile => ({
  path, name: path.split("/").pop()!, source: "search", status: "ready",
});

describe("isolated execution context", () => {
  it("resolves the screenshot README mention and reads worktree content without changing saved input", async () => {
    const original = file();
    const prompt = "Add search examples to [README.md](/source/repo/README.md:1)";
    const resolved = resolveExecutionContext(prompt, [original], bindings);
    expect(resolved.prompt).toBe("Add search examples to [README.md](/cards/1/repo/README.md:1)");
    const content = "Worktree content, including literal /source/repo/README.md";
    const readFile = vi.fn().mockResolvedValue(content);
    const result = await readExecutionFileContext(resolved.attachments, {
      readFile, prepareImage: vi.fn(),
    });
    expect(readFile).toHaveBeenCalledExactlyOnceWith("/cards/1/repo/README.md");
    expect(result.additionalContext).toEqual({
      "file:/cards/1/repo/README.md": {
        kind: "untrusted", value: `File: /cards/1/repo/README.md\n\n${content}`,
      },
    });
    expect(original).toEqual(file());
    expect(resolved.attachments[0].original).toBe(original);
  });

  it("uses the longest repository root and distinguishes identical filenames", () => {
    const resolved = resolveExecutionContext(
      "[app](/source/repo/README.md:8) [nested](/source/repo/docs/README.md:9) [other](/other/README.md:10)",
      [file(), file("/source/repo/docs/README.md"), file("/other/README.md")],
      [...bindings,
        { sourceRepositoryPath: "/other", worktreePath: "/cards/1/other" },
        { sourceRepositoryPath: "/source/repo/docs", worktreePath: "/cards/1/docs" }],
    );
    expect(resolved.attachments.map(({ file }) => file.path)).toEqual([
      "/cards/1/repo/README.md", "/cards/1/docs/README.md", "/cards/1/other/README.md",
    ]);
    expect(resolved.prompt).toBe("[app](/cards/1/repo/README.md:8) [nested](/cards/1/docs/README.md:9) [other](/cards/1/other/README.md:10)");
  });

  it.each(["/source/repository/README.md", "/source/repo/../../external.md", "/external/README.md"])(
    "does not map an external or prefix-colliding path: %s", (path) => {
      const original = file(path);
      const prompt = `[reference](${path}:1)`;
      const resolved = resolveExecutionContext(prompt, [original], bindings);
      expect(resolved.prompt).toBe(prompt);
      expect(resolved.attachments[0]).toEqual({ original, file: original, worktree: false });
    },
  );

  it("normalizes separators, trailing slashes and dot segments before matching", () => {
    const resolved = resolveExecutionContext("", [file("/source/repo/docs/../README.md")], [
      { sourceRepositoryPath: "/source/repo/", worktreePath: "/cards/1/repo/" },
    ]);
    expect(resolved.attachments[0].file.path).toBe("/cards/1/repo/README.md");
  });

  it("preserves labels, titles, encoded spaces and line/column numbers", () => {
    const prompt = '[**Read me**](/source/repo/My%20File%20%28v1%29.md:12:3 "Title")';
    expect(resolveExecutionContext(prompt, [], bindings).prompt).toBe(
      '[**Read me**](/cards/1/repo/My%20File%20%28v1%29.md:12:3 "Title")',
    );
    expect(resolveExecutionContext('[a](</source/repo/My File.md:5>)', [], bindings).prompt)
      .toBe('[a](</cards/1/repo/My%20File.md:5>)');
  });

  it("does not rewrite prose, code, external links or malformed URLs", () => {
    const prompt = [
      "Change /source/repo/README.md. README.md",
      "`[example](/source/repo/README.md:1)`",
      "```md\n[example](/source/repo/README.md:1)\n```",
      "[site](https://example.com/source/repo/README.md)",
      "[bad](/source/repo/bad%XX.md)",
    ].join("\n\n");
    expect(resolveExecutionContext(prompt, [file()], bindings).prompt).toBe(prompt);
  });

  it("leaves already mapped paths unchanged even when a worktree is nested in a source repository", () => {
    const nested = [{ sourceRepositoryPath: "/source/repo", worktreePath: "/source/repo/.cards/1" }];
    const path = "/source/repo/.cards/1/README.md";
    const prompt = `[README](${path}:7)`;
    const resolved = resolveExecutionContext(prompt, [file(path)], nested);
    expect(resolved.prompt).toBe(prompt);
    expect(resolved.attachments[0].file.path).toBe(path);
    expect(resolved.attachments[0].worktree).toBe(true);
  });

  it("uses the attachment's canonical source identity when its visible path is an alias", () => {
    const original = { ...file("/alias/README.md"), canonicalPath: "/source/repo/README.md" };
    const resolved = resolveExecutionContext("[README](/alias/README.md:3)", [original], bindings);
    expect(resolved.prompt).toBe("[README](/cards/1/repo/README.md:3)");
    expect(resolved.attachments[0].file).toMatchObject({ path: "/cards/1/repo/README.md", canonicalPath: undefined });
    expect(original.canonicalPath).toBe("/source/repo/README.md");
  });

  it("uses current bindings each time the original prompt is retried or queued", () => {
    const original = file();
    const prompt = "[README](/source/repo/README.md:1)";
    resolveExecutionContext(prompt, [original], bindings);
    const retried = resolveExecutionContext(prompt, [original], [
      { ...bindings[0], worktreePath: "/cards/recreated/repo" },
    ]);
    expect(retried.prompt).toBe("[README](/cards/recreated/repo/README.md:1)");
    expect(original.path).toBe("/source/repo/README.md");
  });

  it("leaves ordinary chat inputs unchanged without isolated bindings", () => {
    const original = { ...file(), canonicalPath: "/canonical/README.md" };
    const prompt = "[README](/source/repo/README.md:1)";
    const resolved = resolveExecutionContext(prompt, [original], []);
    expect(resolved.prompt).toBe(prompt);
    expect(resolved.attachments[0].file).toEqual(original);
  });

  it.each(["/source/repo/README.md", "/cards/1/repo/README.md"])(
    "fails with original identity when a required worktree attachment is unavailable: %s", async (path) => {
      const readFile = vi.fn().mockRejectedValue(new Error("File not found"));
      const resolved = resolveExecutionContext("", [file(path)], bindings);
      const result = await readExecutionFileContext(resolved.attachments, { readFile, prepareImage: vi.fn() });
      expect(result.attachmentError?.message).toContain(`Attachment README.md (${path}) is unavailable in the isolated worktree at /cards/1/repo/README.md`);
      expect(result.errors.has(path)).toBe(true);
      expect(readFile).toHaveBeenCalledExactlyOnceWith("/cards/1/repo/README.md");
    },
  );

  it("preserves optional external attachment read failures", async () => {
    const result = await readExecutionFileContext(
      resolveExecutionContext("", [file("/external/doc.md")], bindings).attachments,
      { readFile: vi.fn().mockRejectedValue(new Error("Unreadable")), prepareImage: vi.fn() },
    );
    expect(result.attachmentError).toBeNull();
    expect(result.skippedFiles).toEqual(["doc.md"]);
    expect(result.errors.get("/external/doc.md")).toBe("Unreadable");
  });

  it("prepares repository images from the worktree and fails on missing images", async () => {
    const original = { ...file("/source/repo/screenshot.png"), canonicalPath: "/source/repo/screenshot.png" };
    const context = resolveExecutionContext("", [original], bindings);
    const prepareImage = vi.fn(async (image: ComposerContextFile) => ({ ...image, canonicalPath: image.path }));
    const result = await readExecutionFileContext(context.attachments, { readFile: vi.fn(), prepareImage });
    expect(result.files[0].canonicalPath).toBe("/cards/1/repo/screenshot.png");
    expect(original.canonicalPath).toBe("/source/repo/screenshot.png");
    prepareImage.mockRejectedValue(new Error("Image missing"));
    const missing = await readExecutionFileContext(context.attachments, { readFile: vi.fn(), prepareImage });
    expect(missing.attachmentError?.message).toContain("is unavailable in the isolated worktree");
  });
});
