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
const iconOnlyClassMarkers = [
  "native-plan-icon-action",
  "settings-icon-action",
  "kanban-icon-button",
  "kanban-toolbar-button",
  "kanban-card-menu-trigger",
  "kanban-drag-handle",
  "icon-only",
  "workspace-tree-chevron",
  "workspace-add",
  "file-preview-close",
  "composer-status-dismiss",
  "prompt-queue-drag-handle",
  "submitted-prompt-edit-button",
  "pending-interaction-nav",
  "send-button",
  "task-chat-jump-latest",
];

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

function jsxAttribute(
  element: ts.JsxOpeningLikeElement,
  name: string,
  source: ts.SourceFile,
) {
  return element.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((attribute) => attribute.name.getText(source) === name);
}

function importedLucideIcons(source: ts.SourceFile) {
  const icons = new Set<string>();
  source.statements.filter(ts.isImportDeclaration).forEach((declaration) => {
    if (declaration.moduleSpecifier.getText(source) !== '"lucide-react"') return;
    const bindings = declaration.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    bindings.elements.forEach((element) => icons.add(element.name.text));
  });
  return icons;
}

function containsVisibleButtonCopy(
  node: ts.Node,
  source: ts.SourceFile,
  lucideIcons: ReadonlySet<string>,
): boolean {
  if (ts.isJsxText(node)) return node.getText(source).trim().length > 0;
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(source);
    const className =
      jsxAttribute(node.openingElement, "className", source)
        ?.initializer?.getText(source) ?? "";
    if (
      tag === "svg" ||
      lucideIcons.has(tag) ||
      tag.endsWith("Icon") ||
      className.includes("sr-only")
    ) {
      return false;
    }
    return true;
  }
  if (ts.isJsxSelfClosingElement(node)) {
    const tag = node.tagName.getText(source);
    return tag !== "svg" && !lucideIcons.has(tag) && !tag.endsWith("Icon");
  }
  if (ts.isJsxExpression(node)) {
    const expression = node.expression;
    if (!expression) return false;
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text.trim().length > 0;
    }
    if (ts.isConditionalExpression(expression)) {
      return (
        containsVisibleButtonCopy(expression.whenTrue, source, lucideIcons) ||
        containsVisibleButtonCopy(expression.whenFalse, source, lucideIcons)
      );
    }
    if (
      ts.isJsxElement(expression) ||
      ts.isJsxSelfClosingElement(expression)
    ) {
      return containsVisibleButtonCopy(expression, source, lucideIcons);
    }
    return true;
  }
  return true;
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

  it("routes every recognized icon-only button through the shared tooltip layer", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles(sourceRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      const visit = (node: ts.Node) => {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(source) === "button"
        ) {
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
          const className = attributes
            .find((attribute) => attribute.name.getText(source) === "className")
            ?.initializer?.getText(source) ?? "";
          const iconOnly = iconOnlyClassMarkers.some((marker) =>
            className.includes(marker),
          );
          const names = new Set(
            attributes.map((attribute) => attribute.name.getText(source)),
          );
          if (iconOnly && (!names.has("data-tooltip") || names.has("title"))) {
            const { line } = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            offenders.push(`${path.slice(sourceRoot.length + 1)}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(offenders).toEqual([]);
  });

  it("gives directly detectable icon-only buttons a shared tooltip source", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles(sourceRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const lucideIcons = importedLucideIcons(source);

      const visit = (node: ts.Node) => {
        if (
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(source) === "button"
        ) {
          const ariaLabel = jsxAttribute(
            node.openingElement,
            "aria-label",
            source,
          );
          const hasVisibleCopy = node.children.some((child) =>
            containsVisibleButtonCopy(child, source, lucideIcons),
          );
          if (ariaLabel && !hasVisibleCopy) {
            const tooltip = jsxAttribute(
              node.openingElement,
              "data-tooltip",
              source,
            );
            const title = jsxAttribute(node.openingElement, "title", source);
            if (!tooltip || title) {
              const { line } = source.getLineAndCharacterOfPosition(
                node.getStart(source),
              );
              offenders.push(
                `${path.slice(sourceRoot.length + 1)}:${line + 1}`,
              );
            }
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(offenders).toEqual([]);
  });
});
