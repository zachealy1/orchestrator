// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";

declare const process: { cwd(): string };

const styleFiles = [
  "plans-and-input.css",
  "tokens-and-primitives.css",
  "shell-and-header.css",
  "transcript.css",
  "drawers-and-previews.css",
  "composer.css",
  "runs-and-settings.css",
] as const;

export function readAppStyles() {
  return styleFiles
    .map((file) => readFileSync(`${process.cwd()}/src/styles/${file}`, "utf8"))
    .join("\n");
}
