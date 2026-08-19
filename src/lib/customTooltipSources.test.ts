// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readdirSync, readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

const sourceRoot = `${process.cwd()}/src`;

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, {
    withFileTypes: true,
  }) as DirectoryEntry[];
  return entries.flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) {
      return [];
    }
    return [path];
  });
}

describe("custom tooltip sources", () => {
  it("does not combine branded tooltips with native title hints", () => {
    const collisions: string[] = [];

    for (const path of sourceFiles(sourceRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
          const names = new Set(attributes.map((attribute) => attribute.name.getText(source)));
          const className = attributes
            .find((attribute) => attribute.name.getText(source) === "className")
            ?.initializer?.getText(source);
          const hasNativeTitle = names.has("title");
          const mixesTooltipKinds = hasNativeTitle && names.has("data-tooltip");
          const nativePlanUsesNativeTitle =
            hasNativeTitle && className?.includes("native-plan-icon-action");

          if (mixesTooltipKinds || nativePlanUsesNativeTitle) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            collisions.push(`${path.slice(sourceRoot.length + 1)}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(collisions).toEqual([]);
  });
});
