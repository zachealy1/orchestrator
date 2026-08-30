import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PluginsViewActions, PluginsViewModel } from "./PluginsView";
import { EMPTY_PLUGIN_CATALOG } from "./types";
import { usePluginsViewBindings } from "./usePluginsViewBindings";

function model(overrides: Partial<PluginsViewModel> = {}): PluginsViewModel {
  return {
    active: true,
    selectedPluginId: null,
    catalog: EMPTY_PLUGIN_CATALOG,
    loading: false,
    error: null,
    notice: null,
    mutation: null,
    detailsLoadingPluginId: null,
    ...overrides,
  };
}

function actions(
  overrides: Partial<PluginsViewActions> = {},
): PluginsViewActions {
  return {
    refresh: vi.fn(),
    openPlugin: vi.fn(),
    backToCatalog: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    setEnabled: vi.fn(),
    dismissNotice: vi.fn(),
    dismissError: vi.fn(),
    ...overrides,
  };
}

describe("usePluginsViewBindings", () => {
  it("ignores unrelated parent renders while retaining the latest actions", () => {
    const firstRefresh = vi.fn();
    const latestRefresh = vi.fn();
    const baseModel = model();
    const { result, rerender } = renderHook(
      ({ currentModel, currentActions, unrelatedRevision }) => ({
        unrelatedRevision,
        bindings: usePluginsViewBindings({
          model: currentModel,
          actions: currentActions,
        }),
      }),
      {
        initialProps: {
          currentModel: baseModel,
          currentActions: actions({ refresh: firstRefresh }),
          unrelatedRevision: 0,
        },
      },
    );
    const initialBindings = result.current.bindings;

    rerender({
      currentModel: { ...baseModel },
      currentActions: actions({ refresh: latestRefresh }),
      unrelatedRevision: 1,
    });

    expect(result.current.bindings).toBe(initialBindings);
    act(() => result.current.bindings.actions.refresh());
    expect(firstRefresh).not.toHaveBeenCalled();
    expect(latestRefresh).toHaveBeenCalledOnce();
  });

  it("updates only when plugin-facing state changes", () => {
    const baseModel = model();
    const { result, rerender } = renderHook(
      ({ currentModel }) =>
        usePluginsViewBindings({
          model: currentModel,
          actions: actions(),
        }),
      { initialProps: { currentModel: baseModel } },
    );
    const initialModel = result.current.model;
    const initialActions = result.current.actions;

    rerender({ currentModel: model({ loading: true }) });

    expect(result.current.model).not.toBe(initialModel);
    expect(result.current.model.loading).toBe(true);
    expect(result.current.actions).toBe(initialActions);
  });
});
