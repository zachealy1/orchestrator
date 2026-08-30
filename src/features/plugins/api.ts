import {
  codexDefaultProfileRpc,
  listDefaultCodexSkills,
} from "../../codexClient";
import type {
  CodexPluginCatalog,
  CodexPluginMarketplace,
  CodexPluginSummary,
  PluginAuthPolicy,
  PluginInstallPolicy,
  PluginInstallResult,
} from "./types";

export const PLUGIN_CATALOG_CACHE_KEY = "orchestrator.plugin-catalog.v1";
export const PLUGIN_CATALOG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

type PluginCatalogCacheStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export async function listCodexPlugins(input: { forceRefetch?: boolean } = {}) {
  const response = await codexDefaultProfileRpc<unknown>("plugin/list", {
    cwds: [],
    forceRefetch: input.forceRefetch ?? false,
  });
  const catalog = normalizePluginCatalog(response);
  scheduleCachedCodexPlugins(response);
  return catalog;
}

export function readCachedCodexPlugins(
  storage: PluginCatalogCacheStorage | null = defaultCacheStorage(),
  now = Date.now(),
): CodexPluginCatalog | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(PLUGIN_CATALOG_CACHE_KEY);
    if (!serialized) return null;
    const cached = readObject(JSON.parse(serialized));
    const cachedAt =
      typeof cached.cachedAt === "number" ? cached.cachedAt : Number.NaN;
    if (
      !Number.isFinite(cachedAt) ||
      cachedAt <= 0 ||
      now - cachedAt > PLUGIN_CATALOG_CACHE_MAX_AGE_MS
    ) {
      storage.removeItem(PLUGIN_CATALOG_CACHE_KEY);
      return null;
    }
    const catalog = normalizePluginCatalog(cached.payload);
    if (catalog.marketplaces.length === 0) {
      storage.removeItem(PLUGIN_CATALOG_CACHE_KEY);
      return null;
    }
    return {
      ...catalog,
      refreshedAt: new Date(cachedAt).toISOString(),
    };
  } catch {
    try {
      storage.removeItem(PLUGIN_CATALOG_CACHE_KEY);
    } catch {
      // Ignore cache cleanup failures; the live catalog remains authoritative.
    }
    return null;
  }
}

function scheduleCachedCodexPlugins(payload: unknown) {
  const persist = () => persistCachedCodexPlugins(payload);
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(persist, { timeout: 2_000 });
    return;
  }
  setTimeout(persist, 0);
}

function persistCachedCodexPlugins(
  payload: unknown,
  storage: PluginCatalogCacheStorage | null = defaultCacheStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      PLUGIN_CATALOG_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), payload }),
    );
  } catch {
    // Cache writes are best-effort; the live response remains authoritative.
  }
}

function defaultCacheStorage(): PluginCatalogCacheStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export async function installCodexPlugin(plugin: CodexPluginSummary) {
  const response = await codexDefaultProfileRpc<unknown>("plugin/install", {
    marketplacePath: plugin.marketplacePath,
    remoteMarketplaceName: plugin.marketplacePath
      ? null
      : plugin.marketplaceName,
    installAttemptId: createInstallAttemptId(),
    pluginName: plugin.name,
  });
  await refreshCodexSkillCatalog();
  const root = readObject(response);
  const targets = readArray(root.appsNeedingAuth)
    .map((value) => {
      const item = readObject(value);
      return readString(item.displayName) ?? readString(item.name);
    })
    .filter((value): value is string => Boolean(value));
  return {
    authenticationRequired: targets.length > 0,
    authenticationTargets: targets,
  } satisfies PluginInstallResult;
}

export async function readCodexPlugin(plugin: CodexPluginSummary) {
  const response = await codexDefaultProfileRpc<unknown>("plugin/read", {
    marketplacePath: plugin.marketplacePath,
    remoteMarketplaceName: plugin.marketplacePath
      ? null
      : plugin.marketplaceName,
    pluginName: plugin.name,
  });
  const detail = readObject(readObject(response).plugin);
  const normalized = normalizePlugin(
    detail.summary,
    readString(detail.marketplaceName) ?? plugin.marketplaceName,
    readString(detail.marketplacePath) ?? plugin.marketplacePath,
  );
  if (!normalized) return plugin;
  return {
    ...normalized,
    description: readString(detail.description) ?? normalized.description,
    readiness: {
      skills: readArray(detail.skills).length,
      apps: readArray(detail.apps).length,
      mcpServers: readArray(detail.mcpServers).length,
      hooks: readArray(detail.hooks).length,
    },
  } satisfies CodexPluginSummary;
}

export async function uninstallCodexPlugin(pluginId: string) {
  await codexDefaultProfileRpc("plugin/uninstall", { pluginId });
  await refreshCodexSkillCatalog();
}

export async function setCodexPluginEnabled(
  pluginId: string,
  enabled: boolean,
) {
  await codexDefaultProfileRpc("config/value/write", {
    keyPath: `plugins.${quoteConfigKey(pluginId)}.enabled`,
    value: enabled,
    mergeStrategy: "upsert",
    filePath: null,
    expectedVersion: null,
  });
  await refreshCodexSkillCatalog();
}

export async function refreshCodexSkillCatalog() {
  await listDefaultCodexSkills({ forceReload: true });
}

export function normalizePluginCatalog(payload: unknown): CodexPluginCatalog {
  const root = readObject(payload);
  const marketplaces = readArray(root.marketplaces)
    .map(normalizeMarketplace)
    .filter((entry): entry is CodexPluginMarketplace => entry !== null);
  const errors = readArray(root.marketplaceLoadErrors)
    .map((value) => {
      const item = readObject(value);
      return (
        readString(item.message) ??
        readString(item.error) ??
        readString(value)
      );
    })
    .filter((value): value is string => Boolean(value));
  return {
    marketplaces,
    plugins: marketplaces.flatMap((marketplace) => marketplace.plugins),
    featuredPluginIds: readArray(root.featuredPluginIds).filter(
      (value): value is string => typeof value === "string",
    ),
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

function normalizeMarketplace(value: unknown): CodexPluginMarketplace | null {
  const source = readObject(value);
  const name = readString(source.name);
  if (!name) return null;
  const marketplacePath = readString(source.path);
  return {
    name,
    path: marketplacePath,
    plugins: readArray(source.plugins)
      .map((plugin) => normalizePlugin(plugin, name, marketplacePath))
      .filter((plugin): plugin is CodexPluginSummary => plugin !== null),
  };
}

function normalizePlugin(
  value: unknown,
  marketplaceName: string,
  marketplacePath: string | null,
): CodexPluginSummary | null {
  const source = readObject(value);
  const name = readString(source.name);
  const id = readString(source.id) ??
    (name ? `${name}@${marketplaceName}` : null);
  if (!id || !name) return null;
  const pluginInterface = readObject(source.interface);
  const availability = readString(source.availability);
  const disabledReason = readString(source.disabledReason);
  const available =
    source.installPolicy !== "NOT_AVAILABLE" &&
    availability !== "DISABLED_BY_ADMIN";
  return {
    id,
    name,
    displayName:
      readString(pluginInterface.displayName) ?? humanizePluginName(name),
    description:
      readString(pluginInterface.shortDescription) ??
      readString(pluginInterface.longDescription),
    marketplaceName,
    marketplacePath,
    version: readString(source.localVersion) ?? readString(source.version),
    installed: source.installed === true,
    enabled: source.enabled === true,
    installPolicy: normalizeInstallPolicy(source.installPolicy),
    authPolicy: normalizeAuthPolicy(source.authPolicy),
    mustShowInstallationInterstitial:
      source.mustShowInstallationInterstitial === true,
    available,
    unavailableReason:
      (disabledReason ? humanizePluginName(disabledReason) : null) ??
      (available ? null : "This plugin is unavailable under the current policy."),
    keywords: readArray(source.keywords).filter(
      (item): item is string => typeof item === "string",
    ),
    capabilities: readArray(pluginInterface.capabilities).filter(
      (item): item is string => typeof item === "string",
    ),
    logoUrl:
      readString(pluginInterface.logoUrl) ??
      readString(pluginInterface.composerIconUrl),
    readiness: {
      skills: readArray(source.skills).length,
      apps: readArray(source.apps).length,
      mcpServers: readArray(source.mcpServers).length,
      hooks: readArray(source.hooks).length,
    },
  };
}

function normalizeInstallPolicy(value: unknown): PluginInstallPolicy {
  return value === "NOT_AVAILABLE" || value === "INSTALLED_BY_DEFAULT"
    ? value
    : "AVAILABLE";
}

function normalizeAuthPolicy(value: unknown): PluginAuthPolicy {
  return value === "ON_USE" ? "ON_USE" : "ON_INSTALL";
}

function humanizePluginName(value: string) {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function quoteConfigKey(value: string) {
  return JSON.stringify(value);
}

function createInstallAttemptId() {
  return globalThis.crypto?.randomUUID?.() ??
    `install-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
