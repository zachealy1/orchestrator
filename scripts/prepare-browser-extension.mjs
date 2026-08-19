#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const source = path.join(repositoryRoot, "browser-extension");
const destination = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "browser-extension",
);

if (!fs.existsSync(path.join(source, "manifest.json"))) {
  throw new Error("The Orchestrator Browser Bridge extension source is missing.");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
process.stdout.write(`Browser extension is ready at ${destination}\n`);
