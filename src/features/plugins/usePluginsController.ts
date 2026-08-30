import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  installCodexPlugin,
  listCodexPlugins,
  readCachedCodexPlugins,
  readCodexPlugin,
  setCodexPluginEnabled,
  uninstallCodexPlugin,
} from "./api";
import {
  reconcilePluginCatalog,
  replacePluginInCatalog,
} from "./catalogReconciliation";
import { pluginLogoPreloader } from "./pluginLogoPreloader";
import { markPluginPerformance } from "./pluginPerformance";
import {
  EMPTY_PLUGIN_CATALOG,
  type CodexPluginCatalog,
  type CodexPluginSummary,
  type PluginMutationState,
} from "./types";

export function usePluginsController(input: { enabled: boolean }) {
  const [catalog, setCatalog] = useState<CodexPluginCatalog>(
    () => readCachedCodexPlugins() ?? EMPTY_PLUGIN_CATALOG,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<PluginMutationState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsLoadingPluginId, setDetailsLoadingPluginId] = useState<
    string | null
  >(null);

  const refresh = useCallback(async (
    forceRefetch = false,
    foreground = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const nextCatalog = await listCodexPlugins({ forceRefetch });
      markPluginPerformance("catalog-live-ready", {
        count: nextCatalog.plugins.length,
      });
      const applyCatalog = () => {
        setCatalog((current) => reconcilePluginCatalog(current, nextCatalog));
      };
      if (foreground) {
        applyCatalog();
      } else {
        startTransition(applyCatalog);
      }
      return nextCatalog;
    } catch (reason) {
      setError(errorMessage(reason));
      if (foreground) throw reason;
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (plugin: CodexPluginSummary) => {
    setDetailsLoadingPluginId(plugin.id);
    setError(null);
    try {
      const detailed = await readCodexPlugin(plugin);
      startTransition(() => {
        setCatalog((current) => replacePluginInCatalog(current, detailed));
      });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDetailsLoadingPluginId(null);
    }
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (input.enabled) void refresh(false);
  }, [input.enabled, refresh]);

  useEffect(() => {
    if (catalog.plugins.length > 0) {
      markPluginPerformance("catalog-available", {
        count: catalog.plugins.length,
      });
    }
    pluginLogoPreloader.preload(catalog);
  }, [catalog]);

  const mutate = useCallback(
    async (
      plugin: CodexPluginSummary,
      action: NonNullable<PluginMutationState>["action"],
    ) => {
      setMutation({ pluginId: plugin.id, action });
      setError(null);
      setNotice(null);
      try {
        let successNotice: string;
        if (action === "install") {
          const result = await installCodexPlugin(plugin);
          successNotice =
            result.authenticationRequired
              ? `Installed ${plugin.displayName}. Connect ${result.authenticationTargets.join(", ")} before using it.`
              : `Installed ${plugin.displayName}. It will be available to new tasks.`;
        } else if (action === "uninstall") {
          await uninstallCodexPlugin(plugin.id);
          successNotice = `Uninstalled ${plugin.displayName}.`;
        } else {
          const enabled = action === "enable";
          await setCodexPluginEnabled(plugin.id, enabled);
          successNotice = `${enabled ? "Enabled" : "Disabled"} ${plugin.displayName}. The change applies to new tasks.`;
        }
        const refreshedCatalog = await refresh(true, true);
        if (
          !refreshedCatalog ||
          !pluginMutationConfirmed(refreshedCatalog, plugin.id, action)
        ) {
          throw new Error(
            `Couldn’t verify the updated state for ${plugin.displayName}. Refresh Plugins and try again.`,
          );
        }
        setNotice(successNotice);
      } catch (reason) {
        setError(errorMessage(reason));
      } finally {
        setMutation(null);
      }
    },
    [refresh],
  );

  return useMemo(
    () => ({
      catalog,
      loading,
      error,
      mutation,
      notice,
      detailsLoadingPluginId,
      refresh,
      loadDetails,
      dismissNotice,
      dismissError,
      install: (plugin: CodexPluginSummary) => mutate(plugin, "install"),
      uninstall: (plugin: CodexPluginSummary) => mutate(plugin, "uninstall"),
      setEnabled: (plugin: CodexPluginSummary, enabled: boolean) =>
        mutate(plugin, enabled ? "enable" : "disable"),
    }),
    [
      catalog,
      detailsLoadingPluginId,
      dismissError,
      dismissNotice,
      error,
      loadDetails,
      loading,
      mutate,
      mutation,
      notice,
      refresh,
    ],
  );
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

function pluginMutationConfirmed(
  catalog: CodexPluginCatalog,
  pluginId: string,
  action: NonNullable<PluginMutationState>["action"],
) {
  const plugin = catalog.plugins.find((candidate) => candidate.id === pluginId);
  if (action === "uninstall") return !plugin?.installed;
  if (!plugin?.installed) return false;
  if (action === "enable") return plugin.enabled;
  if (action === "disable") return !plugin.enabled;
  return true;
}
