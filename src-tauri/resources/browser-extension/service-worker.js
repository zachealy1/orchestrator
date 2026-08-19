const HOST_NAME = "com.zachealy.orchestrator.browser";
const GROUP_COLOR = "grey";
const MAX_ACTIVITY_ITEMS = 200;

let nativePort = null;
let reconnectTimer = null;
const controlledTabs = new Map();
const attachedTabs = new Set();
const consoleMessages = new Map();
const networkRequests = new Map();
const approvedOriginsByTab = new Map();

function connectNative() {
  if (nativePort) return;
  try {
    const port = chrome.runtime.connectNative(HOST_NAME);
    nativePort = port;
    port.onMessage.addListener((message) => void handleRequest(message));
    port.onDisconnect.addListener(() => {
      nativePort = null;
      void detachAllSessions();
      scheduleReconnect();
    });
    port.postMessage({ type: "extension-ready", version: 1 });
  } catch {
    nativePort = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 3000);
}

chrome.runtime.onInstalled.addListener(connectNative);
chrome.runtime.onStartup.addListener(connectNative);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "orchestrator-status") {
    sendResponse({ connected: nativePort !== null });
  }
});
connectNative();

function reply(request, payload) {
  nativePort?.postMessage({
    _brokerClientId: request?._brokerClientId,
    id: request?.id,
    ...payload,
  });
}

async function handleRequest(request) {
  if (!request || typeof request !== "object" || typeof request.action !== "string") {
    return;
  }
  try {
    const result = await dispatch(request);
    reply(request, { ok: true, result });
  } catch (error) {
    reply(request, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function dispatch(request) {
  switch (request.action) {
    case "ping":
      return {
        version: 1,
        capabilities: ["tabs", "tabGroups", "debugger", "scripting"],
      };
    case "ensure-group":
      return ensureGroup(request.groupKey, request.groupTitle, request.sessionToken);
    case "focus-group":
      return focusGroup(request.groupKey);
    case "rename-group":
      return renameGroup(request.groupKey, request.groupTitle);
    case "list-tabs":
      return listTabs(request.groupKey);
    case "attach-tab":
      return attachTab(request.groupKey, request.groupTitle, request.sessionToken, request.tabId);
    case "detach-session":
      return detachSession(request.sessionToken);
    case "inspect-action":
      return inspectAction(request);
    case "tool":
      return runTool(request);
    default:
      throw new Error("Unsupported browser bridge action.");
  }
}

async function detachAllSessions() {
  const sessions = [...controlledTabs.keys()];
  await Promise.all(sessions.map((token) => detachSession(token)));
}

async function storedGroups() {
  const value = await chrome.storage.local.get("orchestratorGroups");
  return value.orchestratorGroups ?? {};
}

async function saveGroups(groups) {
  await chrome.storage.local.set({ orchestratorGroups: groups });
}

async function readGroup(groupId) {
  if (!Number.isInteger(groupId)) return null;
  try {
    return await chrome.tabGroups.get(groupId);
  } catch {
    return null;
  }
}

async function ensureGroup(groupKey, title, sessionToken) {
  if (typeof groupKey !== "string" || !groupKey || typeof sessionToken !== "string") {
    throw new Error("The browser group identity is invalid.");
  }
  const groups = await storedGroups();
  let groupId = groups[groupKey]?.groupId;
  let group = await readGroup(groupId);
  if (!group) {
    const created = await chrome.tabs.create({ url: "about:blank", active: true });
    groupId = await chrome.tabs.group({ tabIds: [created.id] });
    group = await chrome.tabGroups.get(groupId);
  }
  await chrome.tabGroups.update(group.id, {
    title: safeGroupTitle(title),
    color: GROUP_COLOR,
    collapsed: false,
  });
  groups[groupKey] = { groupId: group.id, title: safeGroupTitle(title) };
  await saveGroups(groups);
  const tabs = await chrome.tabs.query({ groupId: group.id });
  let controlled = tabs.find((tab) => tab.active) ?? tabs.at(-1);
  if (!controlled) {
    controlled = await chrome.tabs.create({
      active: true,
      url: "about:blank",
      windowId: group.windowId,
    });
    await chrome.tabs.group({ groupId: group.id, tabIds: [controlled.id] });
  }
  await setControlledTab(sessionToken, controlled.id);
  return { groupId: group.id, tabId: controlled.id, windowId: group.windowId };
}

function safeGroupTitle(value) {
  const title = typeof value === "string" ? value.trim() : "Orchestrator";
  return title.slice(0, 80) || "Orchestrator";
}

async function groupForKey(groupKey) {
  const groups = await storedGroups();
  const group = await readGroup(groups[groupKey]?.groupId);
  if (!group) throw new Error("The browser tab group is unavailable.");
  return group;
}

async function focusGroup(groupKey) {
  const group = await groupForKey(groupKey);
  const tabs = await chrome.tabs.query({ groupId: group.id });
  const tab = tabs.find((candidate) => candidate.active) ?? tabs[0];
  if (!tab?.id) throw new Error("The browser tab group is empty.");
  await chrome.windows.update(group.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  return { groupId: group.id, tabId: tab.id, windowId: group.windowId };
}

function originForUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : url.protocol;
  } catch {
    return "unknown";
  }
}

async function listTabs(groupKey) {
  const groups = await storedGroups();
  const currentGroupId = groups[groupKey]?.groupId ?? -1;
  const tabs = await chrome.tabs.query({ windowType: "normal" });
  return tabs
    .filter((tab) => Number.isInteger(tab.id) && !tab.incognito)
    .map((tab) => ({
      id: tab.id,
      title: String(tab.title ?? "Untitled tab").slice(0, 160),
      origin: originForUrl(tab.url ?? tab.pendingUrl ?? ""),
      active: Boolean(tab.active),
      inCurrentGroup: tab.groupId === currentGroupId,
    }));
}

async function attachTab(groupKey, title, sessionToken, tabId) {
  if (!Number.isInteger(tabId)) throw new Error("Select a valid browser tab.");
  const tab = await chrome.tabs.get(tabId);
  if (tab.incognito) throw new Error("Private browser tabs cannot be attached.");
  const groups = await storedGroups();
  let groupId = groups[groupKey]?.groupId;
  let group = await readGroup(groupId);
  if (!group) {
    groupId = await chrome.tabs.group({ tabIds: [tabId] });
    group = await chrome.tabGroups.get(groupId);
  } else {
    await chrome.tabs.group({ groupId: group.id, tabIds: [tabId] });
  }
  await chrome.tabGroups.update(group.id, {
    title: safeGroupTitle(title),
    color: GROUP_COLOR,
    collapsed: false,
  });
  groups[groupKey] = { groupId: group.id, title: safeGroupTitle(title) };
  await saveGroups(groups);
  await setControlledTab(sessionToken, tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { groupId: group.id, tabId, windowId: tab.windowId };
}

async function renameGroup(groupKey, title) {
  if (typeof groupKey !== "string" || !groupKey || typeof title !== "string" || !title) {
    throw new Error("The browser group identity is invalid.");
  }
  const groups = await storedGroups();
  const groupId = groups[groupKey]?.groupId;
  const group = await readGroup(groupId);
  if (!group) return { renamed: false };
  await chrome.tabGroups.update(groupId, { title: title.slice(0, 80) });
  return { renamed: true, groupId };
}

async function detachSession(sessionToken) {
  const tabId = controlledTabs.get(sessionToken);
  controlledTabs.delete(sessionToken);
  if (Number.isInteger(tabId) && attachedTabs.has(tabId)) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    attachedTabs.delete(tabId);
  }
  if (Number.isInteger(tabId)) approvedOriginsByTab.delete(tabId);
  return { detached: true };
}

async function setControlledTab(sessionToken, tabId) {
  const previousTabId = controlledTabs.get(sessionToken);
  if (
    Number.isInteger(previousTabId) &&
    previousTabId !== tabId &&
    attachedTabs.has(previousTabId)
  ) {
    await chrome.debugger.detach({ tabId: previousTabId }).catch(() => undefined);
    attachedTabs.delete(previousTabId);
    approvedOriginsByTab.delete(previousTabId);
  }
  controlledTabs.set(sessionToken, tabId);
}

async function ensureControlledTab(request) {
  await ensureGroup(request.groupKey, request.groupTitle, request.sessionToken);
  const tabId = controlledTabs.get(request.sessionToken);
  if (!Number.isInteger(tabId)) throw new Error("The controlled browser tab is unavailable.");
  await ensureDebugger(tabId);
  return tabId;
}

async function ensureDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  attachedTabs.add(tabId);
  consoleMessages.set(tabId, []);
  networkRequests.set(tabId, []);
  await sendCdp(tabId, "Runtime.enable");
  await sendCdp(tabId, "Network.enable");
  await sendCdp(tabId, "Page.enable");
  await sendCdp(tabId, "Fetch.enable", {
    patterns: [{ urlPattern: "http://*/*" }, { urlPattern: "https://*/*" }],
  });
  await sendCdp(tabId, "Browser.setDownloadBehavior", {
    behavior: "deny",
    browserContextId: undefined,
  }).catch(() => undefined);
}

async function inspectAction(request) {
  const tabId = await ensureControlledTab(request);
  const references = Array.isArray(request.references)
    ? request.references.slice(0, 20)
    : [];
  const descriptors = [];
  for (const reference of references) {
    const backendNodeId = Number(String(reference).replace(/^ax-/u, ""));
    if (!Number.isInteger(backendNodeId)) continue;
    const [dom, ax] = await Promise.all([
      sendCdp(tabId, "DOM.describeNode", { backendNodeId, depth: 0 }).catch(() => null),
      sendCdp(tabId, "Accessibility.getPartialAXTree", {
        backendNodeId,
        fetchRelatives: false,
      }).catch(() => null),
    ]);
    const attributes = attributeMap(dom?.node?.attributes);
    const axNode = ax?.nodes?.[0];
    descriptors.push([
      dom?.node?.localName,
      attributes.type,
      attributes.name,
      attributes.autocomplete,
      attributes["aria-label"],
      attributes.placeholder,
      axNode?.role?.value,
      axNode?.name?.value,
    ].filter((value) => typeof value === "string").join(" "));
  }
  const descriptor = descriptors.join(" ").replace(/\s+/gu, " ").trim().slice(0, 240);
  const kind = sensitiveKind(descriptor);
  return {
    sensitive: kind !== null,
    kind,
    label: descriptor.slice(0, 120) || "the selected page control",
  };
}

function attributeMap(values) {
  const result = {};
  if (!Array.isArray(values)) return result;
  for (let index = 0; index + 1 < values.length; index += 2) {
    result[String(values[index]).toLowerCase()] = String(values[index + 1]);
  }
  return result;
}

function sensitiveKind(descriptor) {
  const value = String(descriptor).toLowerCase();
  if (/password|passcode|credential|sign[ -]?in|log[ -]?in|otp|one[ -]?time|verification code/u.test(value)) return "credentials";
  if (/payment|card number|credit card|debit card|cvv|cvc|purchase|checkout|buy now|place order/u.test(value)) return "payment";
  if (/type[ ="]*file|upload|choose file|attach file/u.test(value)) return "upload";
  if (/download|export|save file/u.test(value)) return "download";
  if (/allow|permission|camera|microphone|location|notifications/u.test(value)) return "browser-permission";
  return null;
}

chrome.debugger.onDetach.addListener(({ tabId }) => attachedTabs.delete(tabId));
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  approvedOriginsByTab.delete(tabId);
  consoleMessages.delete(tabId);
  networkRequests.delete(tabId);
  for (const [sessionToken, controlledTabId] of controlledTabs) {
    if (controlledTabId === tabId) controlledTabs.delete(sessionToken);
  }
});
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!Number.isInteger(tabId)) return;
  if (method === "Runtime.consoleAPICalled" || method === "Runtime.exceptionThrown") {
    pushBounded(consoleMessages, tabId, summarizeConsole(method, params));
  }
  if (method === "Network.requestWillBeSent" || method === "Network.loadingFailed") {
    pushBounded(networkRequests, tabId, summarizeNetwork(method, params));
  }
  if (method === "Fetch.requestPaused") {
    void authorizePausedRequest(tabId, params);
  }
});

async function authorizePausedRequest(tabId, params) {
  const requestId = params?.requestId;
  if (!requestId) return;
  const classification = classifyUrl(params?.request?.url);
  const approved = approvedOriginsByTab.get(tabId) ?? new Set();
  if (classification.kind === "local" || approved.has(classification.origin)) {
    await sendCdp(tabId, "Fetch.continueRequest", { requestId }).catch(() => undefined);
  } else {
    await sendCdp(tabId, "Fetch.failRequest", {
      requestId,
      errorReason: "BlockedByClient",
    }).catch(() => undefined);
  }
}

function classifyUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    const loopback =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      /^127(?:\.\d{1,3}){3}$/u.test(hostname);
    return { kind: loopback ? "local" : "external", origin: url.origin };
  } catch {
    return { kind: "blocked", origin: null };
  }
}

function pushBounded(store, key, item) {
  const values = store.get(key) ?? [];
  values.push(item);
  if (values.length > MAX_ACTIVITY_ITEMS) values.splice(0, values.length - MAX_ACTIVITY_ITEMS);
  store.set(key, values);
}

function summarizeConsole(method, params) {
  if (method === "Runtime.exceptionThrown") {
    return `error: ${String(params?.exceptionDetails?.text ?? "Uncaught exception").slice(0, 500)}`;
  }
  const text = (params?.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
  return `${params?.type ?? "log"}: ${String(text).slice(0, 500)}`;
}

function summarizeNetwork(method, params) {
  if (method === "Network.loadingFailed") {
    return `failed ${String(params?.errorText ?? "request failed").slice(0, 240)}`;
  }
  const request = params?.request ?? {};
  return `${request.method ?? "GET"} ${String(request.url ?? "").slice(0, 500)}`;
}

function sendCdp(tabId, method, commandParams = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, commandParams);
}

async function runTool(request) {
  const tabId = await ensureControlledTab(request);
  approvedOriginsByTab.set(
    tabId,
    new Set(Array.isArray(request.approvedOrigins) ? request.approvedOrigins : []),
  );
  const args = request.arguments && typeof request.arguments === "object" ? request.arguments : {};
  switch (request.tool) {
    case "browser_navigate":
      await sendCdp(tabId, "Page.navigate", { url: requiredString(args.url, "URL") });
      return textResult(`Navigated to ${args.url}`);
    case "browser_navigate_back": {
      const history = await sendCdp(tabId, "Page.getNavigationHistory");
      const entry = history.entries?.find((candidate) => candidate.id === history.currentIndex - 1);
      if (entry) await sendCdp(tabId, "Page.navigateToHistoryEntry", { entryId: entry.id });
      return textResult("Navigated back");
    }
    case "browser_snapshot":
      return textResult(await accessibilitySnapshot(tabId));
    case "browser_take_screenshot": {
      const capture = await sendCdp(tabId, "Page.captureScreenshot", { format: "png" });
      return { content: [{ type: "image", data: capture.data, mimeType: "image/png" }] };
    }
    case "browser_click":
      await clickReference(tabId, requiredString(args.ref, "element reference"));
      return textResult("Clicked the requested element");
    case "browser_type":
      await clickReference(tabId, requiredString(args.ref, "element reference"));
      await sendCdp(tabId, "Input.insertText", { text: requiredString(args.text, "text") });
      return textResult("Typed into the requested element");
    case "browser_fill_form":
      for (const field of Array.isArray(args.fields) ? args.fields : []) {
        await clickReference(tabId, requiredString(field.ref, "field reference"));
        await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "a", modifiers: 4 });
        await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "a", modifiers: 4 });
        await sendCdp(tabId, "Input.insertText", { text: String(field.value ?? "") });
      }
      return textResult("Filled the requested fields");
    case "browser_press_key":
      await pressKey(tabId, requiredString(args.key, "key"));
      return textResult(`Pressed ${args.key}`);
    case "browser_console_messages":
      return textResult((consoleMessages.get(tabId) ?? []).join("\n") || "No console messages.");
    case "browser_network_requests":
      return textResult((networkRequests.get(tabId) ?? []).join("\n") || "No network requests.");
    case "browser_wait_for":
      await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, Math.max(0, Number(args.time ?? 1) * 1000))));
      return textResult("Wait complete");
    case "browser_resize": {
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, {
        width: Math.max(320, Number(args.width) || 1280),
        height: Math.max(240, Number(args.height) || 800),
      });
      return textResult("Resized the browser window");
    }
    case "browser_tabs":
      return browserTabsTool(request, args, tabId);
    default:
      throw new Error("This browser capability is not available in Orchestrator.");
  }
}

function textResult(text) {
  return { content: [{ type: "text", text: String(text).slice(0, 60_000) }] };
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`A valid ${name} is required.`);
  return value;
}

async function accessibilitySnapshot(tabId) {
  await sendCdp(tabId, "Accessibility.enable");
  const tree = await sendCdp(tabId, "Accessibility.getFullAXTree", { depth: 12 });
  const lines = [];
  for (const node of tree.nodes ?? []) {
    if (node.ignored || !node.backendDOMNodeId) continue;
    const role = node.role?.value ?? "node";
    const name = String(node.name?.value ?? "").replace(/\s+/g, " ").trim();
    if (!name && !["textbox", "button", "link", "checkbox", "radio"].includes(role)) continue;
    lines.push(`[ax-${node.backendDOMNodeId}] ${role}${name ? ` "${name.slice(0, 240)}"` : ""}`);
    if (lines.length >= 1200) break;
  }
  return lines.join("\n") || "The page has no accessible content.";
}

async function clickReference(tabId, reference) {
  const backendNodeId = Number(reference.replace(/^ax-/u, ""));
  if (!Number.isInteger(backendNodeId)) throw new Error("The element reference is stale or invalid.");
  const model = await sendCdp(tabId, "DOM.getBoxModel", { backendNodeId });
  const quad = model.model?.content;
  if (!Array.isArray(quad) || quad.length < 8) throw new Error("The element is not currently visible.");
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function pressKey(tabId, key) {
  const parts = key.split("+");
  const actual = parts.at(-1);
  let modifiers = 0;
  if (parts.some((part) => /^(meta|cmd|command)$/iu.test(part))) modifiers |= 4;
  if (parts.some((part) => /^shift$/iu.test(part))) modifiers |= 8;
  if (parts.some((part) => /^(control|ctrl)$/iu.test(part))) modifiers |= 2;
  if (parts.some((part) => /^(alt|option)$/iu.test(part))) modifiers |= 1;
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: actual, modifiers });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: actual, modifiers });
}

async function browserTabsTool(request, args, currentTabId) {
  const action = args.action ?? "list";
  if (action === "list") {
    const group = await groupForKey(request.groupKey);
    const tabs = await chrome.tabs.query({ groupId: group.id });
    return textResult(tabs.map((tab) => `${tab.id === currentTabId ? "*" : "-"} ${tab.id}: ${tab.title ?? tab.url ?? "Untitled"}`).join("\n"));
  }
  if (action === "new") {
    const group = await groupForKey(request.groupKey);
    const tab = await chrome.tabs.create({ windowId: group.windowId, active: true, url: "about:blank" });
    await chrome.tabs.group({ groupId: group.id, tabIds: [tab.id] });
    await setControlledTab(request.sessionToken, tab.id);
    return textResult(`Opened tab ${tab.id}`);
  }
  const index = Number(args.index);
  const group = await groupForKey(request.groupKey);
  const tabs = await chrome.tabs.query({ groupId: group.id });
  const tab = tabs[index];
  if (!tab?.id) throw new Error("The requested tab is unavailable.");
  if (action === "select") {
    await setControlledTab(request.sessionToken, tab.id);
    await chrome.tabs.update(tab.id, { active: true });
    return textResult(`Selected tab ${index}`);
  }
  if (action === "close") {
    await chrome.tabs.remove(tab.id);
    return textResult(`Closed tab ${index}`);
  }
  throw new Error("Unsupported tab action.");
}
