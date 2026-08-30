import {
  ArrowLeft,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleX,
  Download,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import {
  isPluginPerformanceEnabled,
  markPluginPerformance,
  recordPluginCardRender,
} from "./pluginPerformance";
import { pluginLogoPreloader } from "./pluginLogoPreloader";
import type {
  CodexPluginCatalog,
  CodexPluginSummary,
  PluginMutationState,
} from "./types";

const EXPLORE_PAGE_SIZE = 60;

export type PluginsViewModel = {
  active: boolean;
  dragRegion?: string;
  selectedPluginId: string | null;
  catalog: CodexPluginCatalog;
  loading: boolean;
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
  const [explorePage, setExplorePage] = useState(0);
  const [pendingInstall, setPendingInstall] =
    useState<CodexPluginSummary | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const originatingCardRef = useRef<HTMLElement | null>(null);
  const catalogScrollTopRef = useRef(0);
  const selectedPluginIdRef = useRef(model.selectedPluginId);
  const previousSelectedPluginIdRef = useRef<string | null>(
    model.selectedPluginId,
  );
  selectedPluginIdRef.current = model.selectedPluginId;
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
  const explorePageCount = Math.max(
    1,
    Math.ceil(exploreCatalogPlugins.length / EXPLORE_PAGE_SIZE),
  );
  const activeExplorePage = Math.min(explorePage, explorePageCount - 1);
  const explorePageStart = activeExplorePage * EXPLORE_PAGE_SIZE;
  const explorePagePlugins = useMemo(
    () =>
      exploreCatalogPlugins.slice(
        explorePageStart,
        explorePageStart + EXPLORE_PAGE_SIZE,
      ),
    [exploreCatalogPlugins, explorePageStart],
  );
  const adjacentExplorePagePlugins = useMemo(() => {
    const previousStart = Math.max(0, explorePageStart - EXPLORE_PAGE_SIZE);
    const nextStart = explorePageStart + EXPLORE_PAGE_SIZE;
    return [
      ...(activeExplorePage > 0
        ? exploreCatalogPlugins.slice(previousStart, explorePageStart)
        : []),
      ...(activeExplorePage + 1 < explorePageCount
        ? exploreCatalogPlugins.slice(
            nextStart,
            nextStart + EXPLORE_PAGE_SIZE,
          )
        : []),
    ];
  }, [
    activeExplorePage,
    exploreCatalogPlugins,
    explorePageCount,
    explorePageStart,
  ]);
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
    (plugin: CodexPluginSummary, trigger: HTMLElement) => {
      const scrollContainer = pageRef.current?.closest<HTMLElement>(".main");
      catalogScrollTopRef.current = scrollContainer?.scrollTop ?? 0;
      originatingCardRef.current = trigger;
      openPluginAction(plugin);
    },
    [openPluginAction],
  );

  useLayoutEffect(() => {
    if (!model.active) return;
    const scrollContainer = pageRef.current?.closest<HTMLElement>(".main");
    if (!scrollContainer) return;

    scrollContainer.scrollTop = selectedPluginIdRef.current
      ? 0
      : catalogScrollTopRef.current;
    markPluginPerformance("view-activated", {
      selectedPluginId: selectedPluginIdRef.current,
    });
    return () => {
      if (!selectedPluginIdRef.current) {
        catalogScrollTopRef.current = scrollContainer.scrollTop;
      }
    };
  }, [model.active]);

  useEffect(() => {
    if (!model.active) return;
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
  }, [model.active, model.selectedPluginId]);

  useEffect(() => {
    if (
      !model.active ||
      browseView !== "explore" ||
      model.selectedPluginId
    ) {
      return;
    }
    pluginLogoPreloader.preloadPlugins(
      [...featuredPlugins, ...explorePagePlugins],
      { priority: true },
    );
    pluginLogoPreloader.preloadPlugins(adjacentExplorePagePlugins, {
      priority: false,
      retain: false,
    });
  }, [
    adjacentExplorePagePlugins,
    browseView,
    explorePagePlugins,
    featuredPlugins,
    model.active,
    model.selectedPluginId,
  ]);

  useLayoutEffect(() => {
    if (
      !model.active ||
      browseView !== "explore" ||
      model.selectedPluginId ||
      !isPluginPerformanceEnabled()
    ) {
      return;
    }
    const cardCount = featuredPlugins.length + explorePagePlugins.length;
    markPluginPerformance("explore-commit", { cardCount });
    const frame = window.requestAnimationFrame(() => {
      const cards = pageRef.current?.querySelectorAll<HTMLElement>(
        ".plugin-card",
      );
      cards?.item(cards.length - 1)?.getBoundingClientRect();
      markPluginPerformance("explore-layout", {
        cardCount: cards?.length ?? 0,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    browseView,
    explorePagePlugins.length,
    featuredPlugins.length,
    model.active,
    model.selectedPluginId,
  ]);

  if (!model.active) return null;

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
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setExplorePage(0);
                }}
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
                onClick={() => {
                  markPluginPerformance("explore-request");
                  setBrowseView("explore");
                }}
              >
                Explore
              </button>
            </div>
          </div>

          {model.loading && model.catalog.plugins.length === 0 ? (
            <div className="plugins-empty-state" role="status">
              <Loader2 className="spin" size={20} aria-hidden="true" />
              Loading plugins
            </div>
          ) : (
            <>
              {browseView === "installed" ? (
                <PluginCatalogPanel
                  id="plugins-installed-panel"
                  labelledBy="plugins-installed-tab"
                  emptyMessage="No installed plugins match this search."
                  sectionTitle="Installed plugins"
                  plugins={installedPlugins}
                  catalogPlugins={installedPlugins}
                  catalogPluginCount={installedPlugins.length}
                  featuredPlugins={[]}
                  pagination={null}
                  busyPluginId={model.mutation?.pluginId ?? null}
                  onInstall={requestInstall}
                  onOpenPlugin={openPlugin}
                />
              ) : (
                <PluginCatalogPanel
                  id="plugins-explore-panel"
                  labelledBy="plugins-explore-tab"
                  emptyMessage="No plugins match this search."
                  sectionTitle="All plugins"
                  plugins={explorePlugins}
                  catalogPlugins={explorePagePlugins}
                  catalogPluginCount={exploreCatalogPlugins.length}
                  featuredPlugins={featuredPlugins}
                  pagination={
                    explorePageCount > 1
                      ? {
                          pageIndex: activeExplorePage,
                          pageCount: explorePageCount,
                          onPageChange: setExplorePage,
                        }
                      : null
                  }
                  busyPluginId={model.mutation?.pluginId ?? null}
                  onInstall={requestInstall}
                  onOpenPlugin={openPlugin}
                />
              )}
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
  emptyMessage,
  sectionTitle,
  plugins,
  featuredPlugins,
  catalogPlugins,
  catalogPluginCount,
  busyPluginId,
  pagination,
  onInstall,
  onOpenPlugin,
}: {
  id: string;
  labelledBy: string;
  emptyMessage: string;
  sectionTitle: string;
  plugins: CodexPluginSummary[];
  featuredPlugins: CodexPluginSummary[];
  catalogPlugins: CodexPluginSummary[];
  catalogPluginCount: number;
  busyPluginId: string | null;
  pagination: {
    pageIndex: number;
    pageCount: number;
    onPageChange: (page: number) => void;
  } | null;
  onInstall: (plugin: CodexPluginSummary) => void;
  onOpenPlugin: (
    plugin: CodexPluginSummary,
    trigger: HTMLElement,
  ) => void;
}) {
  return (
    <div
      id={id}
      className="plugins-catalog-panel"
      role="tabpanel"
      aria-labelledby={labelledBy}
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
                {pagination ? (
                  <PluginCatalogPagination
                    pageIndex={pagination.pageIndex}
                    pageCount={pagination.pageCount}
                    pageSize={EXPLORE_PAGE_SIZE}
                    total={catalogPluginCount}
                    onPageChange={pagination.onPageChange}
                  />
                ) : (
                  <span>{catalogPluginCount} shown</span>
                )}
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

function PluginCatalogPagination({
  pageIndex,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);
  return (
    <nav className="plugins-pagination" aria-label="Plugin catalog pages">
      <span>
        {first}–{last} of {total}
      </span>
      <button
        type="button"
        aria-label="Previous plugin page"
        data-tooltip="Previous plugin page"
        disabled={pageIndex === 0}
        onClick={() => onPageChange(pageIndex - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <strong>
        {pageIndex + 1} / {pageCount}
      </strong>
      <button
        type="button"
        aria-label="Next plugin page"
        data-tooltip="Next plugin page"
        disabled={pageIndex + 1 >= pageCount}
        onClick={() => onPageChange(pageIndex + 1)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

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
    trigger: HTMLElement,
  ) => void;
}) {
  recordPluginCardRender(plugin.id);
  const status = pluginStatus(plugin);
  return (
    <article
      className={`plugin-card${featured ? " featured" : ""}`}
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy}
      aria-label={`View ${plugin.displayName} details`}
      onClick={(event) => {
        if (!busy) onOpenPlugin(plugin, event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (
          busy ||
          event.target !== event.currentTarget ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return;
        }
        event.preventDefault();
        onOpenPlugin(plugin, event.currentTarget);
      }}
    >
      <div className="plugin-card-main">
        <div className="plugin-card-heading">
          <span className="plugin-logo" aria-hidden="true">
            <Box className="plugin-logo-fallback" size={22} />
            {plugin.logoUrl ? (
              <img
                src={plugin.logoUrl}
                alt=""
                width={48}
                height={48}
                decoding="async"
                loading="eager"
                onError={hideFailedPluginLogo}
              />
            ) : null}
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
        </div>
        <div className="plugin-card-actions">
          {!plugin.installed ? (
            <button
              className="plugin-card-install-button"
              type="button"
              aria-label={
                busy
                  ? `Installing ${plugin.displayName}`
                  : `Install ${plugin.displayName}`
              }
              aria-busy={busy}
              data-tooltip={
                busy
                  ? `Installing ${plugin.displayName}`
                  : `Install ${plugin.displayName}`
              }
              disabled={busy || !plugin.available}
              onClick={(event) => {
                event.stopPropagation();
                onInstall(plugin);
              }}
            >
              {busy ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
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
            <Box className="plugin-logo-fallback" size={26} />
            {plugin.logoUrl ? (
              <img
                src={plugin.logoUrl}
                alt=""
                width={50}
                height={50}
                decoding="async"
                loading="eager"
                onError={hideFailedPluginLogo}
              />
            ) : null}
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

function hideFailedPluginLogo(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

function pluginStatus(plugin: CodexPluginSummary) {
  if (plugin.installed) return plugin.enabled ? "Enabled" : "Disabled";
  return plugin.available ? "Available" : "Unavailable";
}
