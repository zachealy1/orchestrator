import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Columns3, GitPullRequest, RotateCcw, Settings2, X } from "lucide-react";
import { SettingsDemo } from "./SettingsDemo";
import { KanbanWorkspace } from "../../features/kanban/KanbanWorkspace";
import { clearKanbanWorkspaceCaches } from "../../features/kanban/workspaceCache";
import { AppServices, AppServicesProvider } from "../../runtime/AppServices";
import { OrchestratorTooltipLayer } from "../../components/OrchestratorTooltipLayer";
import { githubConnection, installDemo, repositories, resetDemo, workspace, type Scenario } from "./fixtures";
import "../../App.css";
import "./demo.css";

installDemo(message => window.dispatchEvent(new CustomEvent("gitlab-demo-notice", { detail: message })));
const services = new AppServices();
window.addEventListener("beforeunload", () => services.dispose(), { once: true });
import.meta.hot?.dispose(() => services.dispose());
const emptyTranscript = async () => [];
const options: { value: Scenario; label: string }[] = [
  { value: "connected", label: "All hosts connected" },
  { value: "offline", label: "Self-managed disconnected" },
  { value: "expired", label: "Expired token" },
  { value: "unavailable", label: "Missing GitLab CLI" },
  { value: "closed", label: "Closed, unmerged request" },
  { value: "merged", label: "All requests merged" },
];

function GitlabDemo() {
  const [view, setView] = useState(location.hash === "#board" ? "board" : "connections");
  const [scenario, setScenario] = useState<Scenario>("connected");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const show = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("gitlab-demo-notice", show);
    return () => window.removeEventListener("gitlab-demo-notice", show);
  }, []);
  const statusNotice = useCallback((value: { title: string }) => setNotice(value.title), []);
  const sampleAction = useCallback(async () => { setNotice("This demo focuses on connections and review workflows. Agent execution is not simulated."); }, []);
  const navigate = (next: string) => { setView(next); location.hash = next; setNotice(null); };
  const reset = (next: Scenario) => {
    resetDemo(next); clearKanbanWorkspaceCaches(); setScenario(next); setRevision(r => r + 1); setNotice(null);
  };
  return (
    <div className="gitlab-demo">
      <header className="demo-header">
        <div className="demo-brand"><GitPullRequest size={22} /><div><strong>Orchestrator</strong><span>GitLab integration</span></div><span className="demo-badge">UI DEMO</span></div>
        <nav aria-label="Demo views">
          <button type="button" aria-pressed={view === "connections"} onClick={() => navigate("connections")}><Settings2 size={16} />Settings page</button>
          <button type="button" aria-pressed={view === "board"} onClick={() => navigate("board")}><Columns3 size={16} />Kanban board</button>
        </nav>
      </header>
      <div className="demo-controls">
        <p>UI demo · Sample accounts · Sign-in is simulated; use sample tokens only</p>
        <label>Scenario<select aria-label="Demo scenario" value={scenario} onChange={e => reset(e.target.value as Scenario)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <button type="button" onClick={() => reset(scenario)}><RotateCcw size={14} />Reset</button>
      </div>
      {view === "connections" ? (
        <SettingsDemo key={revision} onOpenBoard={() => navigate("board")} onNotice={setNotice} />
      ) : (
        <main className="demo-board">
          <div className="demo-board-heading"><div><span className="demo-eyebrow">ATLAS WORKSPACE</span><h1>Review across providers.</h1></div><p>Open the mixed card’s review requests, inspect local changes, or retry a failed publication.<br />Use the archive button to see a completed self-managed merge request.</p></div>
          <KanbanWorkspace key={revision} workspace={workspace} repositories={repositories} accounts={[]} models={[]}
            refreshToken={revision} listChatTranscript={emptyTranscript} onLaunch={sampleAction} onPause={sampleAction} onStop={sampleAction}
            onOpenConversation={sampleAction} githubConnection={githubConnection} githubConnectionPending={false}
            onConnectGithub={() => navigate("connections")} onShowGithubLogin={() => navigate("connections")}
            onStatusNotice={statusNotice} resolvedTheme="dark" />
        </main>
      )}
      {notice ? <div className="demo-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss demo notice" data-tooltip="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div> : null}
      <OrchestratorTooltipLayer />
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<AppServicesProvider services={services}><GitlabDemo /></AppServicesProvider>);
import.meta.hot?.dispose(() => root.unmount());
