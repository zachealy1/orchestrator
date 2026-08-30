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
  X,
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
  const [browseView, setBrowseView] = useState<"explore" | "installed">(
    "installed",
  );
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] =
    useState<CodexPluginSummary | null>(null);
  const plugins = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return model.catalog.plugins.filter((plugin) => {
      if (browseView === "installed" && !plugin.installed) return false;
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
  }, [browseView, model.catalog.plugins, query]);
  const selectedPlugin =
    model.catalog.plugins.find((plugin) => plugin.id === selectedPluginId) ??
    null;
  const installedCount = model.catalog.plugins.filter(
    (plugin) => plugin.installed,
  ).length;
  const featuredPluginIds = new Set(model.catalog.featuredPluginIds);
  const featuredPlugins =
    browseView === "explore" && query.trim().length === 0
      ? plugins
          .filter(
            (plugin) =>
              featuredPluginIds.has(plugin.id) ||
              ["browser", "computer-use"].includes(plugin.name),
          )
          .slice(0, 2)
      : [];
  const featuredIds = new Set(featuredPlugins.map((plugin) => plugin.id));
  const catalogPlugins = plugins.filter(
    (plugin) => !featuredIds.has(plugin.id),
  );

  function requestInstall(plugin: CodexPluginSummary) {
    if (plugin.mustShowInstallationInterstitial) {
      setSelectedPluginId(null);
      setPendingInstall(plugin);
    } else {
      actions.install(plugin);
    }
  }

  function openDetails(plugin: CodexPluginSummary) {
    setSelectedPluginId(plugin.id);
    actions.loadDetails(plugin);
  }

  return (
    <div className="plugins-page" data-tauri-drag-region={model.dragRegion}>
      <header className="plugins-page-header">
        <h1>Plugins</h1>
        <button
          className="plugins-refresh-button"
          type="button"
          onClick={actions.refresh}
          disabled={model.loading}
          aria-label="Refresh plugins"
          data-tooltip="Refresh plugins"
        >
          <RefreshCw
            size={16}
            className={model.loading ? "spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </header>

      <section className="plugins-browser" aria-label="Plugin marketplace">
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
          <div
            className="plugins-browse-tabs"
            role="tablist"
            aria-label="Plugin views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={browseView === "installed"}
              onClick={() => setBrowseView("installed")}
            >
              Installed <span>{installedCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={browseView === "explore"}
              onClick={() => setBrowseView("explore")}
            >
              Explore
            </button>
          </div>
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

        {model.loading && model.catalog.plugins.length === 0 ? (
          <div className="plugins-empty-state" role="status">
            <Loader2 className="spin" size={20} aria-hidden="true" />
            Loading plugins
          </div>
        ) : plugins.length === 0 ? (
          <div className="plugins-empty-state">
            <Puzzle size={22} aria-hidden="true" />
            {browseView === "installed"
              ? "No installed plugins match this search."
              : "No plugins match this search."}
          </div>
        ) : (
          <div className="plugins-catalog">
            {featuredPlugins.length > 0 ? (
              <section
                className="plugins-featured"
                aria-labelledby="plugins-featured-title"
              >
                <div className="plugins-section-heading">
                  <h2 id="plugins-featured-title">Featured</h2>
                  <span>Recommended capabilities</span>
                </div>
                <div className="plugins-featured-grid">
                  {featuredPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      featured
                      busy={
                        model.mutation?.pluginId === plugin.id ||
                        model.detailsLoadingPluginId === plugin.id
                      }
                      onInstall={() => requestInstall(plugin)}
                      onOpenDetails={() => openDetails(plugin)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {catalogPlugins.length > 0 ? (
              <section
                className="plugins-all"
                aria-labelledby="plugins-all-title"
              >
                <div className="plugins-section-heading">
                  <h2 id="plugins-all-title">
                    {browseView === "installed"
                      ? "Installed plugins"
                      : "All plugins"}
                  </h2>
                  <span>{catalogPlugins.length} shown</span>
                </div>
                <div className="plugins-card-grid">
                  {catalogPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      busy={
                        model.mutation?.pluginId === plugin.id ||
                        model.detailsLoadingPluginId === plugin.id
                      }
                      onInstall={() => requestInstall(plugin)}
                      onOpenDetails={() => openDetails(plugin)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>

      {selectedPlugin ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelectedPluginId(null);
          }}
        >
          <section
            className="dialog-card plugin-details-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedPlugin.displayName} details`}
          >
            <button
              className="settings-icon-action plugin-details-close"
              type="button"
              aria-label="Close plugin details"
              data-tooltip="Close"
              onClick={() => setSelectedPluginId(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <PluginDetail
              plugin={selectedPlugin}
              mutation={model.mutation}
              onInstall={requestInstall}
              onUninstall={actions.uninstall}
              onEnabledChange={actions.setEnabled}
            />
          </section>
        </div>
      ) : null}

      {pendingInstall ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog-card plugin-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-install-title"
          >
            <PackagePlus size={22} aria-hidden="true" />
            <h2 id="plugin-install-title">
              Install {pendingInstall.displayName}?
            </h2>
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

function PluginCard({
  plugin,
  featured = false,
  busy,
  onInstall,
  onOpenDetails,
}: {
  plugin: CodexPluginSummary;
  featured?: boolean;
  busy: boolean;
  onInstall: () => void;
  onOpenDetails: () => void;
}) {
  const tags = [...new Set([...plugin.capabilities, ...plugin.keywords])].slice(
    0,
    2,
  );
  const status = plugin.installed
    ? plugin.enabled
      ? "Enabled"
      : "Disabled"
    : plugin.available
      ? "Available"
      : "Unavailable";
  return (
    <article className={`plugin-card${featured ? " featured" : ""}`}>
      <div className="plugin-card-main">
        <span
          className={`plugin-logo${featured ? " large" : ""}`}
          aria-hidden="true"
        >
          {plugin.logoUrl ? (
            <img src={plugin.logoUrl} alt="" />
          ) : (
            <Box size={featured ? 24 : 20} />
          )}
        </span>
        <div className="plugin-card-copy">
          <h3>{plugin.displayName}</h3>
          <p>{plugin.description ?? "No plugin description is available."}</p>
          {tags.length > 0 ? (
            <div className="plugin-card-tags" aria-label="Plugin capabilities">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="plugin-card-footer">
        <span className={`plugin-card-status ${status.toLocaleLowerCase()}`}>
          <i aria-hidden="true" />
          {status}
        </span>
        <div className="plugin-card-actions">
          <button
            className="link-button"
            type="button"
            aria-label={`View ${plugin.displayName} details`}
            onClick={onOpenDetails}
          >
            View details
            <ChevronRight size={14} aria-hidden="true" />
          </button>
          {!plugin.installed ? (
            <button
              className="secondary small"
              type="button"
              disabled={busy || !plugin.available}
              onClick={onInstall}
            >
              {busy ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : (
                <PackagePlus size={14} aria-hidden="true" />
              )}
              Install
            </button>
          ) : busy ? (
            <Loader2 className="spin" size={15} aria-label="Updating plugin" />
          ) : null}
        </div>
      </div>
    </article>
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
  if (!plugin) return null;
  const busy = mutation?.pluginId === plugin.id;
  const componentTotal = Object.values(plugin.readiness).reduce(
    (sum, count) => sum + count,
    0,
  );
  return (
    <div className="plugin-detail">
      <div className="plugin-detail-heading">
        <span className="plugin-logo large" aria-hidden="true">
          {plugin.logoUrl ? (
            <img src={plugin.logoUrl} alt="" />
          ) : (
            <Box size={24} />
          )}
        </span>
        <div>
          <h2>{plugin.displayName}</h2>
          <span>{plugin.version ?? plugin.marketplaceName}</span>
        </div>
      </div>
      <p>{plugin.description ?? "No plugin description is available."}</p>
      <dl className="plugin-component-summary">
        <div>
          <dt>Skills</dt>
          <dd>{plugin.readiness.skills}</dd>
        </div>
        <div>
          <dt>Apps</dt>
          <dd>{plugin.readiness.apps}</dd>
        </div>
        <div>
          <dt>MCP servers</dt>
          <dd>{plugin.readiness.mcpServers}</dd>
        </div>
        <div>
          <dt>Hooks</dt>
          <dd>{plugin.readiness.hooks}</dd>
        </div>
      </dl>
      <p className="plugin-readiness-copy">
        {componentTotal > 0
          ? `${componentTotal} component${componentTotal === 1 ? "" : "s"} reported ready.`
          : "Component readiness is checked when this plugin starts in a new task."}
      </p>
      {plugin.unavailableReason ? (
        <p className="plugins-error" role="status">
          {plugin.unavailableReason}
        </p>
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
    </div>
  );
}
