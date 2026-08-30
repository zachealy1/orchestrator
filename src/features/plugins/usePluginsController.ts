import { useCallback, useEffect, useMemo, useState } from "react";
import {
  installCodexPlugin,
  listCodexPlugins,
  readCachedCodexPlugins,
  readCodexPlugin,
  setCodexPluginEnabled,
  uninstallCodexPlugin,
} from "./api";
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

  const refresh = useCallback(async (forceRefetch = false) => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await listCodexPlugins({ forceRefetch }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (plugin: CodexPluginSummary) => {
    setDetailsLoadingPluginId(plugin.id);
    setError(null);
    try {
      const detailed = await readCodexPlugin(plugin);
      setCatalog((current) => ({
        ...current,
        plugins: current.plugins.map((entry) =>
          entry.id === detailed.id ? detailed : entry,
        ),
        marketplaces: current.marketplaces.map((marketplace) => ({
          ...marketplace,
          plugins: marketplace.plugins.map((entry) =>
            entry.id === detailed.id ? detailed : entry,
          ),
        })),
      }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDetailsLoadingPluginId(null);
    }
  }, []);

  useEffect(() => {
    if (input.enabled) void refresh(false);
  }, [input.enabled, refresh]);

  const mutate = useCallback(
    async (
      plugin: CodexPluginSummary,
      action: NonNullable<PluginMutationState>["action"],
    ) => {
      setMutation({ pluginId: plugin.id, action });
      setError(null);
      setNotice(null);
      try {
        if (action === "install") {
          const result = await installCodexPlugin(plugin);
          setNotice(
            result.authenticationRequired
              ? `Installed ${plugin.displayName}. Connect ${result.authenticationTargets.join(", ")} before using it.`
              : `Installed ${plugin.displayName}. It will be available to new tasks.`,
          );
        } else if (action === "uninstall") {
          await uninstallCodexPlugin(plugin.id);
          setNotice(`Uninstalled ${plugin.displayName}.`);
        } else {
          const enabled = action === "enable";
          await setCodexPluginEnabled(plugin.id, enabled);
          setNotice(
            `${enabled ? "Enabled" : "Disabled"} ${plugin.displayName}. The change applies to new tasks.`,
          );
        }
        await refresh(true);
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
      install: (plugin: CodexPluginSummary) => mutate(plugin, "install"),
      uninstall: (plugin: CodexPluginSummary) => mutate(plugin, "uninstall"),
      setEnabled: (plugin: CodexPluginSummary, enabled: boolean) =>
        mutate(plugin, enabled ? "enable" : "disable"),
    }),
    [
      catalog,
      detailsLoadingPluginId,
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
