import {
  Box,
  Check,
  ChevronRight,
  Loader2,
  PackagePlus,
  Puzzle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  CodexPluginCatalog,
  CodexPluginSummary,
  PluginMutationState,
} from "./types";

export type PluginsViewModel = {
  dragRegion?: string;
  catalog: CodexPluginCatalog;
  loading: boolean;
  error: string | null;
  notice: string | null;
  mutation: PluginMutationState;
  detailsLoadingPluginId: string | null;
};

export type PluginsViewActions = {
  refresh: () => void;
  loadDetails: (plugin: CodexPluginSummary) => void;
  install: (plugin: CodexPluginSummary) => void;
  uninstall: (plugin: CodexPluginSummary) => void;
  setEnabled: (plugin: CodexPluginSummary, enabled: boolean) => void;
};

export function PluginsView({
  model,
  actions,
}: {
  model: PluginsViewModel;
  actions: PluginsViewActions;
}) {
  const [query, setQuery] = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] =
    useState<CodexPluginSummary | null>(null);
  const plugins = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return model.catalog.plugins.filter((plugin) => {
      if (marketplace !== "all" && plugin.marketplaceName !== marketplace) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        plugin.displayName,
        plugin.name,
        plugin.description ?? "",
        plugin.marketplaceName,
        ...plugin.keywords,
        ...plugin.capabilities,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [marketplace, model.catalog.plugins, query]);
  const selectedPlugin =
    model.catalog.plugins.find((plugin) => plugin.id === selectedPluginId) ??
    null;

  function requestInstall(plugin: CodexPluginSummary) {
    if (plugin.mustShowInstallationInterstitial) {
      setPendingInstall(plugin);
    } else {
      actions.install(plugin);
    }
  }

  return (
    <div className="plugins-page" data-tauri-drag-region={model.dragRegion}>
      <header className="plugins-page-header">
        <div>
          <h1>Plugins</h1>
          <p>Install and manage capabilities available to new tasks.</p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={actions.refresh}
          disabled={model.loading}
        >
          <RefreshCw
            size={16}
            className={model.loading ? "spin" : undefined}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      <section className="surface plugins-browser" aria-label="Plugin browser">
        <div className="plugins-browser-toolbar">
          <label className="settings-search plugins-search">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              placeholder="Search plugins"
              aria-label="Search plugins"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <select
            value={marketplace}
            aria-label="Plugin marketplace"
            onChange={(event) => setMarketplace(event.currentTarget.value)}
          >
            <option value="all">All marketplaces</option>
            {model.catalog.marketplaces.map((entry) => (
              <option value={entry.name} key={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        {model.notice ? (
          <p className="plugins-notice" role="status">
            <Check size={15} aria-hidden="true" />
            {model.notice}
          </p>
        ) : null}
        {model.error ? (
          <p className="plugins-error" role="alert">
            <ShieldAlert size={15} aria-hidden="true" />
            {model.error}
          </p>
        ) : null}

        <div className="plugins-layout">
          <div className="plugins-list" aria-label="Available plugins">
            {model.loading && model.catalog.plugins.length === 0 ? (
              <div className="plugins-empty-state" role="status">
                <Loader2 className="spin" size={20} aria-hidden="true" />
                Loading plugins
              </div>
            ) : plugins.length === 0 ? (
              <div className="plugins-empty-state">
                <Puzzle size={22} aria-hidden="true" />
                No plugins match this search.
              </div>
            ) : (
              plugins.map((plugin) => (
                <PluginListRow
                  key={plugin.id}
                  plugin={plugin}
                  selected={selectedPlugin?.id === plugin.id}
                  busy={
                    model.mutation?.pluginId === plugin.id ||
                    model.detailsLoadingPluginId === plugin.id
                  }
                  onSelect={() => {
                    setSelectedPluginId(plugin.id);
                    actions.loadDetails(plugin);
                  }}
                />
              ))
            )}
          </div>

          <PluginDetail
            plugin={selectedPlugin}
            mutation={model.mutation}
            onInstall={requestInstall}
            onUninstall={actions.uninstall}
            onEnabledChange={actions.setEnabled}
          />
        </div>
      </section>

      {pendingInstall ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog-card plugin-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-install-title"
          >
            <PackagePlus size={22} aria-hidden="true" />
            <h2 id="plugin-install-title">Install {pendingInstall.displayName}?</h2>
            <p>
              This plugin can add skills, apps, or MCP servers to Codex. Review
              its details and the service permissions it requests before use.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                type="button"
                onClick={() => setPendingInstall(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  actions.install(pendingInstall);
                  setPendingInstall(null);
                }}
              >
                Install plugin
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PluginListRow({
  plugin,
  selected,
  busy,
  onSelect,
}: {
  plugin: CodexPluginSummary;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`plugin-list-row${selected ? " selected" : ""}`}
      type="button"
      onClick={onSelect}
    >
      <span className="plugin-logo" aria-hidden="true">
        {plugin.logoUrl ? <img src={plugin.logoUrl} alt="" /> : <Box size={20} />}
      </span>
      <span className="plugin-list-copy">
        <strong>{plugin.displayName}</strong>
        <small>
          {plugin.installed ? (plugin.enabled ? "Enabled" : "Disabled") : "Available"}
          {` · ${plugin.marketplaceName}`}
        </small>
      </span>
      {busy ? (
        <Loader2 className="spin" size={16} aria-label="Updating plugin" />
      ) : (
        <ChevronRight size={16} aria-hidden="true" />
      )}
    </button>
  );
}

function PluginDetail({
  plugin,
  mutation,
  onInstall,
  onUninstall,
  onEnabledChange,
}: {
  plugin: CodexPluginSummary | null;
  mutation: PluginMutationState;
  onInstall: (plugin: CodexPluginSummary) => void;
  onUninstall: (plugin: CodexPluginSummary) => void;
  onEnabledChange: (plugin: CodexPluginSummary, enabled: boolean) => void;
}) {
  if (!plugin) {
    return (
      <aside className="plugin-detail plugins-empty-state">
        <Puzzle size={24} aria-hidden="true" />
        Select a plugin to view its details.
      </aside>
    );
  }
  const busy = mutation?.pluginId === plugin.id;
  const componentTotal = Object.values(plugin.readiness).reduce(
    (sum, count) => sum + count,
    0,
  );
  return (
    <aside className="plugin-detail" aria-label={`${plugin.displayName} details`}>
      <div className="plugin-detail-heading">
        <span className="plugin-logo large" aria-hidden="true">
          {plugin.logoUrl ? <img src={plugin.logoUrl} alt="" /> : <Box size={24} />}
        </span>
        <div>
          <h2>{plugin.displayName}</h2>
          <span>{plugin.version ?? plugin.marketplaceName}</span>
        </div>
      </div>
      <p>{plugin.description ?? "No plugin description is available."}</p>
      <dl className="plugin-component-summary">
        <div><dt>Skills</dt><dd>{plugin.readiness.skills}</dd></div>
        <div><dt>Apps</dt><dd>{plugin.readiness.apps}</dd></div>
        <div><dt>MCP servers</dt><dd>{plugin.readiness.mcpServers}</dd></div>
        <div><dt>Hooks</dt><dd>{plugin.readiness.hooks}</dd></div>
      </dl>
      <p className="plugin-readiness-copy">
        {componentTotal > 0
          ? `${componentTotal} component${componentTotal === 1 ? "" : "s"} reported ready.`
          : "Component readiness is checked when this plugin starts in a new task."}
      </p>
      {plugin.unavailableReason ? (
        <p className="plugins-error" role="status">{plugin.unavailableReason}</p>
      ) : null}
      <div className="plugin-detail-actions">
        {plugin.installed ? (
          <>
            <label className="plugin-enabled-control">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={plugin.enabled}
                disabled={busy || !plugin.available}
                onChange={(event) =>
                  onEnabledChange(plugin, event.currentTarget.checked)
                }
              />
            </label>
            {plugin.installPolicy !== "INSTALLED_BY_DEFAULT" ? (
              <button
                className="danger secondary"
                type="button"
                disabled={busy}
                onClick={() => onUninstall(plugin)}
              >
                <Trash2 size={15} aria-hidden="true" />
                Uninstall
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            disabled={busy || !plugin.available}
            onClick={() => onInstall(plugin)}
          >
            <PackagePlus size={16} aria-hidden="true" />
            Install plugin
          </button>
        )}
      </div>
    </aside>
  );
}
