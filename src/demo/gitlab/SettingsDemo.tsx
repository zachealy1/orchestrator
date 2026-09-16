import { useRef, useState } from "react";
import { BarChart3, Puzzle, Settings } from "lucide-react";
import { OrchestratorBetaBrand } from "../../components/OrchestratorBetaBrand";
import { SettingsView, type SettingsViewActions, type SettingsViewModel } from "../../features/settings/SettingsView";
import { WorkspaceSidebar, type SidebarMode } from "../../features/workspaces/WorkspaceSidebar";
import { githubConnection, workspace } from "./fixtures";

function initialModel(): SettingsViewModel {
  return {
    usage: {
      accounts: [], selectedAccountId: null,
      state: { status: "unsupported", snapshot: null, refreshing: false, stale: false, error: null },
      reset: { canReset: false, canConfirm: false, retrying: false, retryCredit: null, pending: false, confirmation: null, message: null },
    },
    computerUseEnabled: true,
    browserPreferences: { downloadLocation: null, askWhereToSave: false },
    browserReadiness: { available: true, checking: false, message: null, pluginId: "browser@openai-bundled", pluginInstalled: true, pluginEnabled: true, isolatedProfile: true, profileImportAvailable: false },
    desktopRuntimeStatus: { available: true, message: null, version: "1.0.1000816", serviceCompatible: true, accessibilityTrusted: true, screenRecordingTrusted: true },
    pluginCatalog: {
      marketplaces: [],
      plugins: ["browser", "computer-use"].map(name => ({
        id: `${name}@openai-bundled`, name, displayName: name === "browser" ? "Browser" : "Computer Use", description: null,
        marketplaceName: "openai-bundled", marketplacePath: null, version: "1.0.0", installed: true, enabled: true,
        installPolicy: "AVAILABLE", authPolicy: "ON_INSTALL", mustShowInstallationInterstitial: false, available: true,
        unavailableReason: null, keywords: [], capabilities: [], logoUrl: null, readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
      })),
      featuredPluginIds: [], errors: [], refreshedAt: "2026-09-16T10:00:00Z",
    },
    pluginsLoading: false, alwaysAllowedApplications: [], githubConnection: { ...githubConnection }, githubConnectionPending: false,
    notificationPreferences: { responseCompleted: true, approvalRequired: true, userInputRequired: true, planReady: true, externalAction: true },
    notificationPermission: "allowed", codexConnected: true,
    accounts: [{ id: 1, label: "Alex Morgan", email: "alex@example.com", plan_type: "plus", status: "signed_in", last_error: null, last_used_at: "2026-09-16T10:00:00Z", created_at: "2026-09-16T10:00:00Z", updated_at: "2026-09-16T10:00:00Z", deleted_at: null }],
    selectedAccountId: 1, pendingLoginAccountId: null, pendingLoginId: null, loginState: "idle", activeRunAccountIds: new Set(),
    runIsActive: false, authMessage: "Connected", authError: null, showLogout: true,
  };
}

export function SettingsDemo({ onOpenBoard, onNotice }: { onOpenBoard: () => void; onNotice: (message: string) => void }) {
  const [model, setModel] = useState(initialModel);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("chats");
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const explain = () => onNotice("Sample Settings page. GitLab connection actions are simulated; other system actions are not connected.");
  const actions: SettingsViewActions = {
    usage: { selectAccount: explain, retry: explain, requestReset: explain, cancelReset: explain, confirmReset: async () => explain() },
    setComputerUseEnabled: enabled => setModel(m => ({ ...m, computerUseEnabled: enabled })),
    setBrowserAskWhereToSave: enabled => setModel(m => ({ ...m, browserPreferences: { ...m.browserPreferences, askWhereToSave: enabled } })),
    chooseBrowserDownloadLocation: explain, resetBrowserDownloadLocation: explain, clearBrowserData: async () => explain(),
    importBrowserProfile: explain, openPlugins: explain, refreshComputerUseStatus: explain, refreshBrowserStatus: explain,
    openAccessibilitySettings: explain, openScreenRecordingSettings: explain, revokeAlwaysAllowedApplication: explain,
    connectGithub: () => setModel(m => ({ ...m, githubConnection: { ...githubConnection } })),
    showGithubLogin: explain,
    disconnectGithub: () => setModel(m => ({ ...m, githubConnection: { ...githubConnection, connected: false, status: "disconnected", login: null, displayName: null } })),
    setNotificationPreference: (key, enabled) => setModel(m => ({ ...m, notificationPreferences: { ...m.notificationPreferences, [key]: enabled } })),
    openNotificationSettings: explain, enableNotifications: explain, renameAccount: explain, selectAccount: explain,
    cancelLogin: explain, loginAccount: explain, removeAccount: explain, addAccount: explain, connectAccount: explain, logout: explain,
  };
  return (
    <main className="app-shell demo-settings-shell">
      <aside className="app-rail">
        <div className="app-rail-brand"><OrchestratorBetaBrand /></div>
        <nav className="primary-nav" aria-label="Primary">
          <button type="button" onClick={explain}><BarChart3 size={17} /><span>Analytics</span></button>
          <button type="button" className="active" aria-current="page" onClick={() => document.querySelector(".demo-settings-shell .main")?.scrollTo({ top: 0, behavior: "smooth" })}><Settings size={17} /><span>Settings</span></button>
          <button type="button" onClick={explain}><Puzzle size={17} /><span>Plugins</span></button>
        </nav>
        <WorkspaceSidebar model={{
          mode: sidebarMode, histories: {}, priority: { status: "loaded", chats: [], error: null },
          selectedChatId: null, runningChatActivity: new Map(), unreadChats: {},
          workspaces: [workspace], selectedWorkspaceId: workspace.id, taskViewActive: false, runIsActive: false,
          expandedWorkspaceIds: new Set(), expandedDirectoryPaths: new Set(), directoryStates: {},
          gitStatusByWorkspaceId: new Map(), dirtyDirectoryPathsByWorkspaceId: new Map(), contextMenu: null, contextMenuRef,
        }} actions={{
          setMode: setSidebarMode, selectChat: explain, loadChats: explain, retryPriority: explain, retryDirectory: explain,
          openChatContextMenu: (_chat, event) => { event.preventDefault(); explain(); },
          addWorkspace: explain, toggleWorkspace: onOpenBoard, selectWorkspace: onOpenBoard,
          handleWorkspaceKeyDown: () => undefined, openWorkspaceContextMenu: (_workspace, event) => { event.preventDefault(); explain(); },
          requestWorkspaceDelete: explain, toggleDirectory: explain, startFileDrag: () => undefined,
          updateFileDrag: () => undefined, finishFileDrag: () => undefined, cancelFileDrag: () => undefined,
          shouldSuppressFileClick: () => false, openFile: explain,
        }} />
      </aside>
      <section className="main" aria-label="Settings page">
        <div className="settings-grid"><SettingsView model={model} actions={actions} /></div>
      </section>
    </main>
  );
}
