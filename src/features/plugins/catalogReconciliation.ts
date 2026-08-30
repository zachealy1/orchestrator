import type { CodexPluginCatalog, CodexPluginSummary } from "./types";

export function reconcilePluginCatalog(
  current: CodexPluginCatalog,
  next: CodexPluginCatalog,
): CodexPluginCatalog {
  const currentPluginsById = new Map(
    current.plugins.map((plugin) => [plugin.id, plugin]),
  );
  const stablePluginsById = new Map<string, CodexPluginSummary>();
  for (const plugin of next.plugins) {
    const previous = currentPluginsById.get(plugin.id);
    stablePluginsById.set(
      plugin.id,
      previous && pluginSummariesEqual(previous, plugin) ? previous : plugin,
    );
  }

  const currentMarketplacesByKey = new Map(
    current.marketplaces.map((marketplace) => [
      marketplaceKey(marketplace.name, marketplace.path),
      marketplace,
    ]),
  );
  const marketplaces = next.marketplaces.map((marketplace) => {
    const plugins = marketplace.plugins.map(
      (plugin) => stablePluginsById.get(plugin.id) ?? plugin,
    );
    const previous = currentMarketplacesByKey.get(
      marketplaceKey(marketplace.name, marketplace.path),
    );
    if (previous && arraysReferenceEqual(previous.plugins, plugins)) {
      return previous;
    }
    return { ...marketplace, plugins };
  });
  const plugins = next.plugins.map(
    (plugin) => stablePluginsById.get(plugin.id) ?? plugin,
  );
  const featuredPluginIds = arraysValueEqual(
    current.featuredPluginIds,
    next.featuredPluginIds,
  )
    ? current.featuredPluginIds
    : next.featuredPluginIds;
  const errors = arraysValueEqual(current.errors, next.errors)
    ? current.errors
    : next.errors;

  if (
    arraysReferenceEqual(current.marketplaces, marketplaces) &&
    arraysReferenceEqual(current.plugins, plugins) &&
    current.featuredPluginIds === featuredPluginIds &&
    current.errors === errors
  ) {
    return current;
  }

  return {
    ...next,
    marketplaces,
    plugins,
    featuredPluginIds,
    errors,
  };
}

export function replacePluginInCatalog(
  current: CodexPluginCatalog,
  plugin: CodexPluginSummary,
) {
  const previous = current.plugins.find((entry) => entry.id === plugin.id);
  if (!previous || pluginSummariesEqual(previous, plugin)) return current;

  return {
    ...current,
    plugins: current.plugins.map((entry) =>
      entry.id === plugin.id ? plugin : entry,
    ),
    marketplaces: current.marketplaces.map((marketplace) => {
      if (!marketplace.plugins.some((entry) => entry.id === plugin.id)) {
        return marketplace;
      }
      return {
        ...marketplace,
        plugins: marketplace.plugins.map((entry) =>
          entry.id === plugin.id ? plugin : entry,
        ),
      };
    }),
  };
}

export function pluginSummariesEqual(
  left: CodexPluginSummary,
  right: CodexPluginSummary,
) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.displayName === right.displayName &&
    left.description === right.description &&
    left.marketplaceName === right.marketplaceName &&
    left.marketplacePath === right.marketplacePath &&
    left.version === right.version &&
    left.installed === right.installed &&
    left.enabled === right.enabled &&
    left.installPolicy === right.installPolicy &&
    left.authPolicy === right.authPolicy &&
    left.mustShowInstallationInterstitial ===
      right.mustShowInstallationInterstitial &&
    left.available === right.available &&
    left.unavailableReason === right.unavailableReason &&
    left.logoUrl === right.logoUrl &&
    arraysValueEqual(left.keywords, right.keywords) &&
    arraysValueEqual(left.capabilities, right.capabilities) &&
    left.readiness.skills === right.readiness.skills &&
    left.readiness.apps === right.readiness.apps &&
    left.readiness.mcpServers === right.readiness.mcpServers &&
    left.readiness.hooks === right.readiness.hooks
  );
}

function marketplaceKey(name: string, path: string | null) {
  return `${name}\u0000${path ?? ""}`;
}

function arraysReferenceEqual<T>(left: T[], right: T[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function arraysValueEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
