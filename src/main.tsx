import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DrawerSyncDiagnostics from "./drawerSyncDiagnostics";
import TranscriptRestoreDiagnostics from "./transcriptRestoreDiagnostics";
import TranscriptScrollDiagnostics from "./transcriptScrollDiagnostics";
import { initializeTheme } from "./lib/theme";

initializeTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {import.meta.env.VITE_TRANSCRIPT_RESTORE_PROFILE === "1" ? (
      <TranscriptRestoreDiagnostics />
    ) : import.meta.env.VITE_TRANSCRIPT_SCROLL_PROFILE === "1" ? (
      <TranscriptScrollDiagnostics />
    ) : import.meta.env.VITE_DRAWER_SYNC_PROFILE === "1" ? (
      <DrawerSyncDiagnostics />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
