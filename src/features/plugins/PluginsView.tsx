import {
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  Circle,
  CircleX,
  GraduationCap,
  LayoutGrid,
  Loader2,
  PackagePlus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Trash2,
  Webhook,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import type {
  CodexPluginCatalog,
  CodexPluginSummary,
  PluginMutationState,
} from "./types";

export type PluginsViewModel = {
  dragRegion?: string;
  selectedPluginId: string | null;
  catalog: CodexPluginCatalog;
  loading: boolean;
  error: string | null;
  notice: string | null;
  mutation: PluginMutationState;
  detailsLoadingPluginId: string | null;
};

export type PluginsViewActions = {
  refresh: () => void;
  openPlugin: (plugin: CodexPluginSummary) => void;
  backToCatalog: () => void;
  install: (plugin: CodexPluginSummary) => void;
  uninstall: (plugin: CodexPluginSummary) => void;
  setEnabled: (plugin: CodexPluginSummary, enabled: boolean) => void;
};

export const PluginsView = memo(function PluginsView({
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
  const [pendingInstall, setPendingInstall] =
    useState<CodexPluginSummary | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const originatingCardRef = useRef<HTMLButtonElement | null>(null);
  const catalogScrollTopRef = useRef(0);
  const previousSelectedPluginIdRef = useRef<string | null>(
    model.selectedPluginId,
  );
  const installPlugin = useStableEvent(actions.install);
  const openPluginAction = useStableEvent(actions.openPlugin);
  const {
    installedCount,
    installedPlugins,
    explorePlugins,
    featuredPlugins,
    exploreCatalogPlugins,
  } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filteredPlugins = model.catalog.plugins.filter((plugin) => {
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
    const featuredPluginIds = new Set(model.catalog.featuredPluginIds);
    const nextFeaturedPlugins =
      normalizedQuery.length === 0
        ? filteredPlugins
            .filter(
              (plugin) =>
                featuredPluginIds.has(plugin.id) ||
                ["browser", "computer-use"].includes(plugin.name),
            )
            .slice(0, 2)
        : [];
    const featuredIds = new Set(
      nextFeaturedPlugins.map((plugin) => plugin.id),
    );
    return {
      installedCount: model.catalog.plugins.reduce(
        (count, plugin) => count + (plugin.installed ? 1 : 0),
        0,
      ),
      installedPlugins: filteredPlugins.filter((plugin) => plugin.installed),
      explorePlugins: filteredPlugins,
      featuredPlugins: nextFeaturedPlugins,
      exploreCatalogPlugins: filteredPlugins.filter(
        (plugin) => !featuredIds.has(plugin.id),
      ),
    };
  }, [
    model.catalog.featuredPluginIds,
    model.catalog.plugins,
    query,
  ]);
  const selectedPlugin =
    model.catalog.plugins.find(
      (plugin) => plugin.id === model.selectedPluginId,
    ) ??
    null;
  const requestInstall = useCallback(
    (plugin: CodexPluginSummary) => {
      if (plugin.mustShowInstallationInterstitial) {
        setPendingInstall(plugin);
      } else {
        installPlugin(plugin);
      }
    },
    [installPlugin],
  );

  const openPlugin = useCallback(
    (plugin: CodexPluginSummary, trigger: HTMLButtonElement) => {
      const scrollContainer = pageRef.current?.closest<HTMLElement>(".main");
      catalogScrollTopRef.current = scrollContainer?.scrollTop ?? 0;
      originatingCardRef.current = trigger;
      openPluginAction(plugin);
    },
    [openPluginAction],
  );

  useEffect(() => {
    const previousSelectedPluginId = previousSelectedPluginIdRef.current;
    previousSelectedPluginIdRef.current = model.selectedPluginId;
    const scrollContainer = pageRef.current?.closest<HTMLElement>(".main");
    let frame: number | null = null;

    if (model.selectedPluginId) {
      if (scrollContainer) scrollContainer.scrollTop = 0;
      frame = window.requestAnimationFrame(() => backButtonRef.current?.focus());
    } else if (previousSelectedPluginId) {
      frame = window.requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = catalogScrollTopRef.current;
        }
        originatingCardRef.current?.focus();
      });
    }

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [model.selectedPluginId]);

  return (
    <div
      ref={pageRef}
      className="plugins-page"
      data-tauri-drag-region={model.dragRegion}
    >
      <div
        className="plugins-catalog-page"
        hidden={model.selectedPluginId !== null}
      >
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
                id="plugins-installed-tab"
                type="button"
                role="tab"
                aria-controls="plugins-installed-panel"
                aria-selected={browseView === "installed"}
                onClick={() => setBrowseView("installed")}
              >
                Installed <span>{installedCount}</span>
              </button>
              <button
                id="plugins-explore-tab"
                type="button"
                role="tab"
                aria-controls="plugins-explore-panel"
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
          ) : (
            <>
              <PluginCatalogPanel
                id="plugins-installed-panel"
                labelledBy="plugins-installed-tab"
                active={browseView === "installed"}
                emptyMessage="No installed plugins match this search."
                sectionTitle="Installed plugins"
                plugins={installedPlugins}
                catalogPlugins={installedPlugins}
                featuredPlugins={[]}
                busyPluginId={model.mutation?.pluginId ?? null}
                onInstall={requestInstall}
                onOpenPlugin={openPlugin}
              />
              <PluginCatalogPanel
                id="plugins-explore-panel"
                labelledBy="plugins-explore-tab"
                active={browseView === "explore"}
                emptyMessage="No plugins match this search."
                sectionTitle="All plugins"
                plugins={explorePlugins}
                catalogPlugins={exploreCatalogPlugins}
                featuredPlugins={featuredPlugins}
                busyPluginId={model.mutation?.pluginId ?? null}
                onInstall={requestInstall}
                onOpenPlugin={openPlugin}
              />
            </>
          )}
        </section>
      </div>

      {model.selectedPluginId ? (
        <PluginOverviewPage
          backButtonRef={backButtonRef}
          pluginId={model.selectedPluginId}
          plugin={selectedPlugin}
          loading={model.detailsLoadingPluginId === model.selectedPluginId}
          error={model.error}
          notice={model.notice}
          mutation={model.mutation}
          onBack={actions.backToCatalog}
          onInstall={requestInstall}
          onUninstall={actions.uninstall}
          onEnabledChange={actions.setEnabled}
        />
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
                  installPlugin(pendingInstall);
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
});

const PluginCatalogPanel = memo(function PluginCatalogPanel({
  id,
  labelledBy,
  active,
  emptyMessage,
  sectionTitle,
  plugins,
  featuredPlugins,
  catalogPlugins,
  busyPluginId,
  onInstall,
  onOpenPlugin,
}: {
  id: string;
  labelledBy: string;
  active: boolean;
  emptyMessage: string;
  sectionTitle: string;
  plugins: CodexPluginSummary[];
  featuredPlugins: CodexPluginSummary[];
  catalogPlugins: CodexPluginSummary[];
  busyPluginId: string | null;
  onInstall: (plugin: CodexPluginSummary) => void;
  onOpenPlugin: (
    plugin: CodexPluginSummary,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  return (
    <div
      id={id}
      className="plugins-catalog-panel"
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={!active}
    >
      {plugins.length === 0 ? (
        <div className="plugins-empty-state">
          <Puzzle size={22} aria-hidden="true" />
          {emptyMessage}
        </div>
      ) : (
        <div className="plugins-catalog">
          {featuredPlugins.length > 0 ? (
            <section
              className="plugins-featured"
              aria-labelledby={`${id}-featured-title`}
            >
              <div className="plugins-section-heading">
                <h2 id={`${id}-featured-title`}>Featured</h2>
                <span>Recommended capabilities</span>
              </div>
              <div className="plugins-featured-grid">
                {featuredPlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    featured
                    busy={busyPluginId === plugin.id}
                    onInstall={onInstall}
                    onOpenPlugin={onOpenPlugin}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {catalogPlugins.length > 0 ? (
            <section
              className="plugins-all"
              aria-labelledby={`${id}-all-title`}
            >
              <div className="plugins-section-heading">
                <h2 id={`${id}-all-title`}>{sectionTitle}</h2>
                <span>{catalogPlugins.length} shown</span>
              </div>
              <div className="plugins-card-grid">
                {catalogPlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    busy={busyPluginId === plugin.id}
                    onInstall={onInstall}
                    onOpenPlugin={onOpenPlugin}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
});

const PluginCard = memo(function PluginCard({
  plugin,
  featured = false,
  busy,
  onInstall,
  onOpenPlugin,
}: {
  plugin: CodexPluginSummary;
  featured?: boolean;
  busy: boolean;
  onInstall: (plugin: CodexPluginSummary) => void;
  onOpenPlugin: (
    plugin: CodexPluginSummary,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const capabilities = [...new Set(plugin.capabilities)];
  const tags = capabilities.slice(0, 2);
  const status = pluginStatus(plugin);
  return (
    <article className={`plugin-card${featured ? " featured" : ""}`}>
      <button
        className="plugin-card-select-target"
        type="button"
        aria-label={`View ${plugin.displayName} details`}
        disabled={busy}
        onClick={(event) => onOpenPlugin(plugin, event.currentTarget)}
      />
      <div className="plugin-card-main">
        <div className="plugin-card-heading">
          <span className="plugin-logo" aria-hidden="true">
            {plugin.logoUrl ? (
              <img
                src={plugin.logoUrl}
                alt=""
                decoding="async"
              />
            ) : (
              <Box size={22} />
            )}
          </span>
          <h3>{plugin.displayName}</h3>
        </div>
        <p className="plugin-card-description">
          {plugin.description ?? "No plugin description is available."}
        </p>
      </div>
      <div className="plugin-card-footer">
        <div className="plugin-card-metadata">
          <span className={`plugin-card-status ${status.toLocaleLowerCase()}`}>
            <PluginCardStatusIcon status={status} />
            {status}
          </span>
          {capabilities.length > 0 ? (
            <>
              <span
                className="plugin-card-metadata-separator"
                aria-hidden="true"
              >
                •
              </span>
              <span className="plugin-card-capability-count">
                {capabilities.length}{" "}
                {capabilities.length === 1 ? "capability" : "capabilities"}
              </span>
            </>
          ) : null}
        </div>
        <div className="plugin-card-actions">
          {tags.length > 0 ? (
            <div className="plugin-card-tags" aria-label="Plugin capabilities">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          {!plugin.installed ? (
            <button
              className="secondary small"
              type="button"
              disabled={busy || !plugin.available}
              onClick={() => onInstall(plugin)}
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
});

function PluginCardStatusIcon({ status }: { status: string }) {
  if (status === "Enabled") {
    return <CheckCircle2 size={15} aria-hidden="true" />;
  }
  if (status === "Unavailable") {
    return <CircleX size={15} aria-hidden="true" />;
  }
  if (status === "Available") {
    return <PackagePlus size={15} aria-hidden="true" />;
  }
  return <Circle size={15} aria-hidden="true" />;
}

function PluginOverviewPage({
  backButtonRef,
  pluginId,
  plugin,
  loading,
  error,
  notice,
  mutation,
  onBack,
  onInstall,
  onUninstall,
  onEnabledChange,
}: {
  backButtonRef: RefObject<HTMLButtonElement | null>;
  pluginId: string;
  plugin: CodexPluginSummary | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  mutation: PluginMutationState;
  onBack: () => void;
  onInstall: (plugin: CodexPluginSummary) => void;
  onUninstall: (plugin: CodexPluginSummary) => void;
  onEnabledChange: (plugin: CodexPluginSummary, enabled: boolean) => void;
}) {
  if (!plugin) {
    return (
      <section
        className="plugin-overview-page"
        aria-labelledby="plugin-overview-missing-title"
      >
        <button
          ref={backButtonRef}
          className="plugin-overview-back"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Plugins
        </button>
        <div className="plugin-overview-missing" role="alert">
          <CircleX size={28} aria-hidden="true" />
          <div>
            <h1 id="plugin-overview-missing-title">
              Plugin no longer available
            </h1>
            <p>
              The plugin “{pluginId}” is no longer present in the current
              marketplace catalog.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const busy = mutation?.pluginId === plugin.id;
  const componentTotal = Object.values(plugin.readiness).reduce(
    (sum, count) => sum + count,
    0,
  );
  const status = pluginStatus(plugin);
  const capabilities = [...new Set(plugin.capabilities)];
  const readinessItems = [
    {
      label: "Skills",
      count: plugin.readiness.skills,
      Icon: GraduationCap,
    },
    { label: "Apps", count: plugin.readiness.apps, Icon: LayoutGrid },
    {
      label: "MCP servers",
      count: plugin.readiness.mcpServers,
      Icon: Server,
    },
    { label: "Hooks", count: plugin.readiness.hooks, Icon: Webhook },
  ];

  return (
    <section
      className="plugin-overview-page"
      aria-labelledby="plugin-overview-title"
      aria-busy={loading}
    >
      <button
        ref={backButtonRef}
        className="plugin-overview-back"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Plugins
      </button>

      <header className="plugin-overview-header">
        <div className="plugin-overview-identity">
          <span className="plugin-logo large" aria-hidden="true">
            {plugin.logoUrl ? (
              <img src={plugin.logoUrl} alt="" />
            ) : (
              <Box size={26} />
            )}
          </span>
          <div className="plugin-overview-title">
            <h1 id="plugin-overview-title">{plugin.displayName}</h1>
            <p>
              <span>{plugin.version ?? "Version unavailable"}</span>
              <span aria-hidden="true">·</span>
              <span>{plugin.marketplaceName}</span>
            </p>
            <div
              className="plugin-overview-capabilities plugin-overview-header-capabilities"
              aria-label="Plugin capabilities"
            >
              {capabilities.length > 0 ? (
                capabilities.map((capability) => (
                  <span key={capability}>{capability}</span>
                ))
              ) : (
                <span>No capabilities listed</span>
              )}
            </div>
          </div>
        </div>
        <span className={`plugin-card-status ${status.toLocaleLowerCase()}`}>
          <PluginCardStatusIcon status={status} />
          {status}
        </span>
      </header>

      {notice ? (
        <p className="plugins-notice plugin-overview-feedback" role="status">
          <Check size={15} aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="plugins-error plugin-overview-feedback" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="plugin-overview-layout">
        <div className="plugin-overview-content">
          <section className="plugin-overview-panel plugin-overview-main">
            <div className="plugin-overview-main-section">
              <h2>Overview</h2>
              <p>
                {plugin.description ?? "No plugin description is available."}
              </p>
            </div>
            <div className="plugin-overview-main-section">
              <div className="plugin-overview-section-heading">
                <div>
                  <h2>Component readiness</h2>
                  <p>
                    Components exposed to Codex when this plugin is enabled.
                  </p>
                </div>
                <strong>{componentTotal} total</strong>
              </div>
              <dl className="plugin-component-summary">
                {readinessItems.map(({ label, count, Icon }) => (
                  <div key={label}>
                    <dt>
                      <Icon size={22} aria-hidden="true" />
                      <span>{label}</span>
                    </dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              <p className="plugin-readiness-copy">
                {componentTotal > 0
                  ? `${componentTotal} component${componentTotal === 1 ? "" : "s"} reported ready.`
                  : "Component readiness is checked when this plugin starts in a new task."}
              </p>
            </div>
          </section>
        </div>

        <aside className="plugin-overview-panel plugin-overview-management">
          <div>
            <h2>Manage plugin</h2>
            <p>Changes to plugin availability apply to new tasks.</p>
          </div>
          {plugin.unavailableReason ? (
            <p className="plugin-overview-policy" role="status">
              <ShieldAlert size={16} aria-hidden="true" />
              {plugin.unavailableReason}
            </p>
          ) : null}
          <div className="plugin-overview-management-actions">
            {plugin.installed ? (
              <>
                <label className="plugin-enabled-control">
                  <span>Enabled</span>
                  <span className="settings-switch">
                    <input
                      type="checkbox"
                      aria-label="Enabled"
                      checked={plugin.enabled}
                      disabled={busy || !plugin.available}
                      onChange={(event) =>
                        onEnabledChange(plugin, event.currentTarget.checked)
                      }
                    />
                    <span aria-hidden="true" />
                  </span>
                </label>
                {plugin.installPolicy !== "INSTALLED_BY_DEFAULT" ? (
                  <button
                    className="danger secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => onUninstall(plugin)}
                  >
                    {busy && mutation?.action === "uninstall" ? (
                      <Loader2 className="spin" size={15} aria-hidden="true" />
                    ) : (
                      <Trash2 size={15} aria-hidden="true" />
                    )}
                    Uninstall plugin
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                disabled={busy || !plugin.available}
                onClick={() => onInstall(plugin)}
              >
                {busy ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <PackagePlus size={15} aria-hidden="true" />
                )}
                Install plugin
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function pluginStatus(plugin: CodexPluginSummary) {
  if (plugin.installed) return plugin.enabled ? "Enabled" : "Disabled";
  return plugin.available ? "Available" : "Unavailable";
}
