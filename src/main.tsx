import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OrchestratorTooltipLayer } from "./components/OrchestratorTooltipLayer";
import DrawerSyncDiagnostics from "./drawerSyncDiagnostics";
import TranscriptRestoreDiagnostics from "./transcriptRestoreDiagnostics";
import TranscriptScrollDiagnostics from "./transcriptScrollDiagnostics";
import TranscriptWorkspaceReturnDiagnostics from "./transcriptWorkspaceReturnDiagnostics";
import { initializeTheme } from "./lib/theme";
import { AppServices, AppServicesProvider } from "./runtime/AppServices";

initializeTheme();

const services = new AppServices();
let servicesDisposed = false;

function disposeServices() {
  if (servicesDisposed) return;
  servicesDisposed = true;
  services.dispose();
}

window.addEventListener("beforeunload", disposeServices, { once: true });
import.meta.hot?.dispose(disposeServices);

function ApplicationRoot() {
  return (
    <AppServicesProvider services={services}>
      {import.meta.env.VITE_TRANSCRIPT_RESTORE_PROFILE === "1" ? (
        <TranscriptRestoreDiagnostics />
      ) : import.meta.env.VITE_TRANSCRIPT_WORKSPACE_RETURN_PROFILE === "1" ? (
        <TranscriptWorkspaceReturnDiagnostics />
      ) : import.meta.env.VITE_TRANSCRIPT_SCROLL_PROFILE === "1" ? (
        <TranscriptScrollDiagnostics />
      ) : import.meta.env.VITE_DRAWER_SYNC_PROFILE === "1" ? (
        <DrawerSyncDiagnostics />
      ) : (
        <App />
      )}
      <OrchestratorTooltipLayer />
    </AppServicesProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ApplicationRoot />
  </React.StrictMode>,
);
