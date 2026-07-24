#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runtimeNodeModules = path.join(
  repositoryRoot,
  "scripts",
  "playwright-runtime",
  "node_modules",
);
const { Client } = await import(
  pathToFileURL(
    path.join(runtimeNodeModules, "@modelcontextprotocol/sdk/dist/esm/client/index.js"),
  ).href
);
const { StdioClientTransport } = await import(
  pathToFileURL(
    path.join(
      runtimeNodeModules,
      "@modelcontextprotocol/sdk/dist/esm/client/stdio.js",
    ),
  ).href
);
const { ElicitRequestSchema } = await import(
  pathToFileURL(
    path.join(runtimeNodeModules, "@modelcontextprotocol/sdk/dist/esm/types.js"),
  ).href
);
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const runtimeRoot = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "playwright",
  `darwin-${architecture}`,
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(runtimeRoot, "runtime.json"), "utf8"),
);
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "orchestrator-playwright-smoke-"),
);
const stateFile = path.join(temporaryRoot, "state.json");
const outputDirectory = path.join(temporaryRoot, "output");
const controlSocket = path.join(
  os.tmpdir(),
  `orchestrator-playwright-smoke-${process.pid}.sock`,
);
const sessionToken = "0123456789abcdef0123456789abcdef";

const server = http.createServer((request, response) => {
  if (request.url === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
    <html>
      <body>
        <label>Message <input aria-label="Message" /></label>
        <label>Password <input type="password" aria-label="Password" /></label>
        <button
          aria-label="Run action"
          onclick="document.querySelector('#result').textContent = 'clicked'; console.error('orchestrator-smoke-error')"
        >Run action</button>
        <p id="result">waiting</p>
      </body>
    </html>`);
});

await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not start the Playwright smoke-test server.");
}

const transport = new StdioClientTransport({
  command: path.join(runtimeRoot, manifest.nodeExecutable),
  args: [
    path.join(runtimeRoot, manifest.wrapperScript),
    "--session-token",
    sessionToken,
    "--entry-id",
    "playwright-smoke-entry",
    "--state-file",
    stateFile,
    "--browser-executable",
    path.join(runtimeRoot, manifest.chromiumExecutable),
    "--output-dir",
    outputDirectory,
    "--control-socket",
    controlSocket,
    "--access-mode",
    "ask-for-approval",
  ],
  env: {
    ...process.env,
    TMPDIR: temporaryRoot,
  },
});
const client = new Client({
  name: "orchestrator-playwright-smoke",
  version: "1.0.0",
}, {
  capabilities: {
    elicitation: {
      form: {},
    },
  },
});
const elicitations = [];
client.setRequestHandler(ElicitRequestSchema, async (request) => {
  elicitations.push(request.params);
  return {
    action: "accept",
    content: { decision: "allow" },
  };
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  const requiredTools = [
    "browser_navigate",
    "browser_snapshot",
    "browser_take_screenshot",
    "browser_click",
    "browser_type",
    "browser_console_messages",
    "browser_network_requests",
  ];
  for (const tool of requiredTools) {
    if (!toolNames.has(tool)) {
      throw new Error(`Bundled Playwright MCP is missing ${tool}.`);
    }
  }
  for (const blocked of [
    "browser_close",
    "browser_evaluate",
    "browser_run_code",
    "browser_file_upload",
    "browser_install",
  ]) {
    if (toolNames.has(blocked)) {
      throw new Error(`Restricted browser tool ${blocked} was exposed.`);
    }
  }

  await callTool("browser_navigate", {
    url: `http://127.0.0.1:${address.port}/`,
  });
  const snapshot = await callTool("browser_snapshot", {});
  const snapshotText = readToolText(snapshot);
  const messageRef = readRef(snapshotText, "textbox", "Message");
  const passwordRef = readRef(snapshotText, "textbox", "Password");
  const actionRef = readRef(snapshotText, "button", "Run action");

  await callTool("browser_type", {
    element: "Message",
    target: messageRef,
    text: "browser ready",
  });
  await callTool("browser_fill_form", {
    fields: [
      {
        name: "Password",
        type: "textbox",
        target: passwordRef,
        value: "not-exposed-to-approval",
      },
    ],
  });
  await callTool("browser_click", {
    element: "Run action",
    target: actionRef,
  });
  await callTool("browser_wait_for", { text: "clicked" });
  await callTool("browser_take_screenshot", {
    type: "png",
    filename: "smoke.png",
  });

  const consoleMessages = readToolText(
    await callTool("browser_console_messages", { level: "error" }),
  );
  if (!consoleMessages.includes("orchestrator-smoke-error")) {
    throw new Error("Browser console errors were not available.");
  }
  const networkRequests = readToolText(
    await callTool("browser_network_requests", {
      static: true,
    }),
  );
  if (!networkRequests.includes("127.0.0.1")) {
    throw new Error(
      `Browser network requests were not available: ${networkRequests}`,
    );
  }
  if (!fs.existsSync(path.join(outputDirectory, "smoke.png"))) {
    throw new Error("The browser screenshot was not written to session output.");
  }
  await expectToolFailure("browser_take_screenshot", {
    type: "png",
    filename: "../outside.png",
  });
  await expectToolFailure("browser_evaluate", {
    function: "() => document.title",
  });

  await callTool("browser_navigate", {
    url: `http://0.0.0.0:${address.port}/`,
  });
  const externalSnapshot = readToolText(
    await callTool("browser_snapshot", {}),
  );
  await callTool("browser_click", {
    element: "Run action",
    target: readRef(externalSnapshot, "button", "Run action"),
  });
  if (
    elicitations.length !== 3 ||
    elicitations[0]?._meta?.["orchestrator/browser-approval"]?.kind !==
      "sensitive-action" ||
    elicitations[1]?._meta?.["orchestrator/browser-approval"]?.kind !==
      "origin" ||
    elicitations[2]?._meta?.["orchestrator/browser-approval"]?.kind !==
      "sensitive-action"
  ) {
    throw new Error(
      `Expected origin and sensitive-action approvals, received ${JSON.stringify(elicitations)}.`,
    );
  }
  if (JSON.stringify(elicitations).includes("not-exposed-to-approval")) {
    throw new Error("Browser approval metadata exposed a sensitive field value.");
  }

  process.stdout.write(
    `Playwright runtime smoke test passed with ${tools.tools.length} restricted tools.\n`,
  );
} finally {
  await client.close().catch(() => undefined);
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(controlSocket, { force: true });
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

async function callTool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`${name} failed: ${readToolText(result)}`);
  }
  return result;
}

async function expectToolFailure(name, args) {
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) return;
  } catch {
    return;
  }
  throw new Error(`${name} unexpectedly bypassed the wrapper policy.`);
}

function readToolText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function readRef(snapshot, role, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = snapshot.match(
    new RegExp(`${role} "${escapedName}"[^\\n]*\\[ref=([^\\]]+)\\]`, "u"),
  );
  if (!match) {
    throw new Error(`Could not find ${role} ${name} in browser snapshot.`);
  }
  return match[1];
}
