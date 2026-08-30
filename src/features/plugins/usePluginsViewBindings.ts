import { useMemo } from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import type { PluginsViewActions, PluginsViewModel } from "./PluginsView";

export type PluginsViewBindings = {
  model: PluginsViewModel;
  actions: PluginsViewActions;
};

export function usePluginsViewBindings(input: PluginsViewBindings) {
  const currentModel = input.model;
  const currentActions = input.actions;
  const refresh = useStableEvent(currentActions.refresh);
  const openPlugin = useStableEvent(currentActions.openPlugin);
  const backToCatalog = useStableEvent(currentActions.backToCatalog);
  const install = useStableEvent(currentActions.install);
  const uninstall = useStableEvent(currentActions.uninstall);
  const setEnabled = useStableEvent(currentActions.setEnabled);

  const model = useMemo<PluginsViewModel>(
    () => ({ ...currentModel }),
    [
      currentModel.active,
      currentModel.catalog,
      currentModel.detailsLoadingPluginId,
      currentModel.dragRegion,
      currentModel.loading,
      currentModel.mutation,
      currentModel.selectedPluginId,
    ],
  );
  const actions = useMemo<PluginsViewActions>(
    () => ({
      refresh,
      openPlugin,
      backToCatalog,
      install,
      uninstall,
      setEnabled,
    }),
    [
      backToCatalog,
      install,
      openPlugin,
      refresh,
      setEnabled,
      uninstall,
    ],
  );

  return useMemo(() => ({ model, actions }), [actions, model]);
}
