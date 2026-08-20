export type ToolActivityCategory =
  | "browser"
  | "github"
  | "search"
  | "integration"
  | "collaboration";

export type ToolActivityStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "declined"
  | "interrupted";

export type ToolActivitySafeDetail = {
  label: string;
  value: string;
};

export type ToolActivityPresentation = {
  category: ToolActivityCategory;
  server: string;
  tool: string;
  label: string;
  safeDetails: ToolActivitySafeDetail[];
};

const VERB_FORMS: Record<
  string,
  { progressive: string; past: string }
> = {
  analyse: { progressive: "Analysing", past: "Analysed" },
  analyze: { progressive: "Analyzing", past: "Analyzed" },
  capture: { progressive: "Capturing", past: "Captured" },
  check: { progressive: "Checking", past: "Checked" },
  click: { progressive: "Selecting", past: "Selected" },
  compare: { progressive: "Comparing", past: "Compared" },
  connect: { progressive: "Connecting", past: "Connected" },
  coordinate: { progressive: "Coordinating", past: "Coordinated" },
  create: { progressive: "Creating", past: "Created" },
  enter: { progressive: "Entering", past: "Entered" },
  fetch: { progressive: "Reading", past: "Read" },
  find: { progressive: "Finding", past: "Found" },
  get: { progressive: "Reading", past: "Read" },
  inspect: { progressive: "Inspecting", past: "Inspected" },
  list: { progressive: "Listing", past: "Listed" },
  load: { progressive: "Loading", past: "Loaded" },
  manage: { progressive: "Managing", past: "Managed" },
  navigate: { progressive: "Opening", past: "Opened" },
  open: { progressive: "Opening", past: "Opened" },
  prepare: { progressive: "Preparing", past: "Prepared" },
  read: { progressive: "Reading", past: "Read" },
  run: { progressive: "Running", past: "Ran" },
  search: { progressive: "Searching", past: "Searched" },
  send: { progressive: "Sending", past: "Sent" },
  start: { progressive: "Starting", past: "Started" },
  take: { progressive: "Capturing", past: "Captured" },
  test: { progressive: "Testing", past: "Tested" },
  type: { progressive: "Entering", past: "Entered" },
  update: { progressive: "Updating", past: "Updated" },
  use: { progressive: "Using", past: "Used" },
  verify: { progressive: "Verifying", past: "Verified" },
  view: { progressive: "Viewing", past: "Viewed" },
  wait: { progressive: "Waiting", past: "Waited" },
  capturing: { progressive: "Capturing", past: "Captured" },
  checking: { progressive: "Checking", past: "Checked" },
  comparing: { progressive: "Comparing", past: "Compared" },
  connecting: { progressive: "Connecting", past: "Connected" },
  creating: { progressive: "Creating", past: "Created" },
  entering: { progressive: "Entering", past: "Entered" },
  inspecting: { progressive: "Inspecting", past: "Inspected" },
  loading: { progressive: "Loading", past: "Loaded" },
  opening: { progressive: "Opening", past: "Opened" },
  preparing: { progressive: "Preparing", past: "Prepared" },
  reading: { progressive: "Reading", past: "Read" },
  running: { progressive: "Running", past: "Ran" },
  searching: { progressive: "Searching", past: "Searched" },
  selecting: { progressive: "Selecting", past: "Selected" },
  sending: { progressive: "Sending", past: "Sent" },
  starting: { progressive: "Starting", past: "Started" },
  testing: { progressive: "Testing", past: "Tested" },
  updating: { progressive: "Updating", past: "Updated" },
  using: { progressive: "Using", past: "Used" },
  verifying: { progressive: "Verifying", past: "Verified" },
  viewing: { progressive: "Viewing", past: "Viewed" },
  waiting: { progressive: "Waiting", past: "Waited" },
};

const KNOWN_TOOL_ACTIONS: Record<string, string> = {
  browser_click: "Select a page control",
  browser_console_messages: "Inspect browser console messages",
  browser_fill_form: "Enter information in a browser form",
  browser_navigate: "Open the browser page",
  browser_network_requests: "Inspect browser network activity",
  browser_snapshot: "Inspect the current browser page",
  browser_tabs: "Manage browser tabs",
  browser_take_screenshot: "Capture a page screenshot",
  browser_type: "Enter text in the browser",
  "github.compare_commits": "Compare GitHub commits",
  "github.create_commit": "Create a GitHub commit",
  "github.create_tree": "Prepare a GitHub tree",
  "github.fetch": "Read GitHub data",
  "github.fetch_commit": "Read GitHub commit details",
  "github.fetch_commit_workflow_runs": "Check GitHub workflow runs",
  "github.fetch_file": "Read a repository file",
  "github.get_commit_combined_status": "Check GitHub commit status",
  "github.get_pr_diff": "Read pull request changes",
  "github.get_pr_info": "Read pull request details",
  "github.update_ref": "Update a GitHub branch",
  close_agent: "Stop a subagent",
  resume_agent: "Resume a subagent",
  send_input: "Send instructions to a subagent",
  spawn_agent: "Start a subagent",
  wait_agent: "Wait for subagent progress",
  web_search: "Search the web",
};

const SENSITIVE_TEXT =
  /(?:authorization|bearer|cookie|credential|device[ _-]?code|one[ _-]?time|otp|pass(?:word|code)?|secret|token|api[ _-]?key|card[ _-]?number|cvv)/iu;

export function describeToolActivity(
  itemValue: unknown,
  status: ToolActivityStatus,
): ToolActivityPresentation {
  const item = readObject(itemValue);
  const server = sanitizeIdentifier(readString(item.server), "integration");
  const tool = sanitizeIdentifier(readString(item.tool), "tool");
  const argumentsObject = readObject(item.arguments);
  const suppliedTitle = sanitizeActivityTitle(readString(argumentsObject.title));
  const category = toolActivityCategory(item, server, tool, suppliedTitle);
  const action =
    suppliedTitle ??
    knownToolAction(server, tool, category) ??
    fallbackToolAction(tool, category);

  return {
    category,
    server,
    tool,
    label: activityLabel(action, status),
    safeDetails: projectSafeDetails(argumentsObject),
  };
}

export function normalizeToolActivityStatus(
  value: unknown,
  fallback: ToolActivityStatus,
): ToolActivityStatus {
  const status = readString(value)?.toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (status === "declined" || status === "denied") return "declined";
  if (status === "cancelled" || status === "canceled" || status === "interrupted") {
    return "interrupted";
  }
  if (status === "completed" || status === "succeeded" || status === "success") {
    return "completed";
  }
  if (status === "inprogress" || status === "running" || status === "started") {
    return "running";
  }
  if (status === "pending") return "pending";
  return fallback;
}

export function sanitizeHistoricalToolTitle(value: unknown) {
  return sanitizeActivityTitle(readString(value));
}

function knownToolAction(
  server: string,
  tool: string,
  category: ToolActivityCategory,
) {
  const normalizedTool = tool.toLowerCase();
  const normalizedServer = server.toLowerCase();
  return (
    KNOWN_TOOL_ACTIONS[`${normalizedServer}.${normalizedTool}`] ??
    KNOWN_TOOL_ACTIONS[normalizedTool] ??
    (category === "search" ? "Search the web" : null)
  );
}

function fallbackToolAction(tool: string, category: ToolActivityCategory) {
  if (tool === "tool" || /^(?:call|execute|js)$/iu.test(tool)) {
    return category === "collaboration"
      ? "Coordinate with a subagent"
      : "Use an integration";
  }
  const humanized = tool
    .replace(/^(?:browser|github)[_.:/-]+/iu, "")
    .replace(/[_.:/-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!humanized) return "Use an integration";
  return `${category === "github" ? "Use GitHub to " : ""}${humanized}`;
}

function activityLabel(actionValue: string, status: ToolActivityStatus) {
  const action = sentenceCase(actionValue);
  const match = /^([A-Za-z]+)(.*)$/u.exec(action);
  const verb = match?.[1]?.toLowerCase() ?? "";
  const rest = match?.[2] ?? "";
  const forms = VERB_FORMS[verb];

  if (status === "failed") {
    return `Could not ${lowercaseFirst(action)}`;
  }
  if (status === "declined") {
    return `Skipped ${lowercaseFirst(action)}`;
  }
  if (status === "interrupted") {
    return forms
      ? `Stopped while ${lowercaseFirst(`${forms.progressive}${rest}`)}`
      : `Stopped ${lowercaseFirst(action)}`;
  }
  if (status === "pending") {
    return `Preparing to ${lowercaseFirst(action)}`;
  }
  if (!forms) {
    return action;
  }
  return `${status === "completed" ? forms.past : forms.progressive}${rest}`;
}

function toolActivityCategory(
  item: Record<string, unknown>,
  server: string,
  tool: string,
  title: string | null,
): ToolActivityCategory {
  const itemType = readString(item.type)?.toLowerCase() ?? "";
  const combined = `${server} ${tool}`.toLowerCase();
  if (
    itemType.includes("collab") ||
    itemType.includes("subagent") ||
    /(?:^|\W)(?:agent|subagent)(?:\W|$)/u.test(combined)
  ) {
    return "collaboration";
  }
  if (/github|pull.request|workflow|commit|repository/u.test(combined)) {
    return "github";
  }
  if (
    /browser|playwright/u.test(combined) ||
    (/node_repl/u.test(combined) &&
      /browser|page|visual verification|local (?:app|game)/iu.test(title ?? ""))
  ) {
    return "browser";
  }
  if (itemType === "websearch" || /(?:web.)?search/u.test(combined)) {
    return "search";
  }
  return "integration";
}

function projectSafeDetails(argumentsObject: Record<string, unknown>) {
  const details: ToolActivitySafeDetail[] = [];
  const repository = firstSafeString(argumentsObject, [
    "repo_full_name",
    "repository",
    "repo",
  ]);
  if (repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    details.push({ label: "Repository", value: repository });
  }

  const path = firstSafeString(argumentsObject, ["file_path", "path", "filename"]);
  const filename = path ? basename(path) : null;
  if (filename && filename.length <= 160 && !SENSITIVE_TEXT.test(filename)) {
    details.push({ label: "File", value: filename });
  }

  const url = firstSafeString(argumentsObject, ["url", "uri"]);
  const origin = safeHttpOrigin(url);
  if (origin) details.push({ label: "Origin", value: origin });

  const action = firstSafeString(argumentsObject, ["action", "operation"]);
  if (
    action &&
    action.length <= 80 &&
    /^[A-Za-z0-9 ._-]+$/u.test(action) &&
    !SENSITIVE_TEXT.test(action)
  ) {
    details.push({ label: "Action", value: action });
  }

  return details.slice(0, 4);
}

function sanitizeActivityTitle(value: string | null) {
  if (!value) return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/https?:\/\/[^\s)\]}]+/giu, (candidate) => safeHttpOrigin(candidate) ?? "website")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized || normalized.length > 180 || SENSITIVE_TEXT.test(normalized)) {
    return null;
  }
  return normalized;
}

function sanitizeIdentifier(value: string | null, fallback: string) {
  if (!value || !/^[A-Za-z0-9_.:/-]{1,160}$/u.test(value)) return fallback;
  return value;
}

function firstSafeString(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readString(object[key]);
    if (value) return value;
  }
  return null;
}

function safeHttpOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function basename(value: string) {
  return value.replace(/\\/gu, "/").split("/").filter(Boolean).pop() ?? "";
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}` : "Use an integration";
}

function lowercaseFirst(value: string) {
  return value ? `${value[0]!.toLowerCase()}${value.slice(1)}` : value;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
