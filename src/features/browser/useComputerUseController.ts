import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  readDesktopRuntimeStatus,
} from "../../codexClient";
import type { CodexPluginCatalog } from "../plugins/types";
import { findPlugin, pluginIsReady } from "../plugins/types";
import {
  persistInteractionPreferences,
  readInteractionPreferences,
} from "../interaction/preferences";
import type { DesktopRuntimeStatus } from "../interaction/types";
import {
  persistBrowserPreferences,
  readBrowserPreferences,
} from "./preferences";
import type { BrowserPreferences, BrowserReadiness } from "./types";
import type { BrowserRuntimeStatus } from "./runtimeStatus";
import { useBrowserRuntimeStatus } from "./useBrowserRuntimeStatus";

export type ComputerUseController = {
  computerUseEnabled: boolean;
  setComputerUseEnabled: Dispatch<SetStateAction<boolean>>;
  browserPreferences: BrowserPreferences;
  setBrowserDownloadLocation: (path: string | null) => void;
  setBrowserAskWhereToSave: (enabled: boolean) => void;
  browserReadiness: BrowserReadiness;
  desktopRuntimeStatus: DesktopRuntimeStatus | null;
  refreshDesktopRuntimeStatus: () => Promise<void>;
  refreshBrowserRuntimeStatus: () => Promise<void>;
};

export function useComputerUseController(input: {
  pluginCatalog: CodexPluginCatalog;
  browserProfileKey: string;
  loadBrowserRuntimeStatus: () => Promise<BrowserRuntimeStatus>;
}): ComputerUseController {
  const [preferences, setPreferences] = useState(readInteractionPreferences);
  const [browserPreferences, setBrowserPreferences] = useState(
    readBrowserPreferences,
  );
  const [desktopRuntimeStatus, setDesktopRuntimeStatus] =
    useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => persistInteractionPreferences(preferences), [preferences]);
  useEffect(
    () => persistBrowserPreferences(browserPreferences),
    [browserPreferences],
  );

  async function refreshDesktopRuntimeStatus() {
    try {
      setDesktopRuntimeStatus(await readDesktopRuntimeStatus());
    } catch (error) {
      setDesktopRuntimeStatus({
        available: false,
        version: null,
        serviceCompatible: false,
        accessibilityTrusted: null,
        screenRecordingTrusted: null,
        message:
          error instanceof Error
            ? error.message
            : "Computer Use is unavailable.",
      });
    }
  }

  useEffect(() => {
    void refreshDesktopRuntimeStatus();
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDesktopRuntimeStatus();
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const browserPlugin = findPlugin(
    input.pluginCatalog,
    "browser@openai-bundled",
    "browser",
  );
  const browserPluginReady = pluginIsReady(browserPlugin);
  const browserProbeKey = browserPluginReady
    ? `${input.browserProfileKey}:${browserPlugin?.id ?? "browser"}:${input.pluginCatalog.refreshedAt}`
    : null;
  const { value: browserRuntime, refresh: refreshBrowserRuntimeStatus } =
    useBrowserRuntimeStatus(browserProbeKey, input.loadBrowserRuntimeStatus);

  const browserReadiness: BrowserReadiness = {
    available: browserPluginReady && browserRuntime?.status === "available",
    checking: browserPluginReady && browserRuntime === null,
    checkFailed: browserPluginReady && browserRuntime?.status === "unknown",
    message: browserPlugin
      ? browserPluginReady
        ? browserRuntime?.message ?? "Checking this account’s browser runtime."
        : browserPlugin.installed
          ? "Enable the Browser plugin to use the in-app browser."
          : "Install the Browser plugin to use the in-app browser."
      : "Browser plugin is not available from configured marketplaces.",
    pluginId: browserPlugin?.id ?? null,
    pluginInstalled: browserPlugin?.installed ?? false,
    pluginEnabled: browserPlugin?.enabled ?? false,
    isolatedProfile: true,
    profileImportAvailable: false,
  };

  return useMemo(
    () => ({
      computerUseEnabled: preferences.computerUseEnabled,
      setComputerUseEnabled: (value: SetStateAction<boolean>) =>
        setPreferences((current) => ({
          computerUseEnabled:
            typeof value === "function"
              ? value(current.computerUseEnabled)
              : value,
        })),
      browserPreferences,
      setBrowserDownloadLocation: (downloadLocation: string | null) =>
        setBrowserPreferences((current) => ({ ...current, downloadLocation })),
      setBrowserAskWhereToSave: (askWhereToSave: boolean) =>
        setBrowserPreferences((current) => ({ ...current, askWhereToSave })),
      browserReadiness,
      desktopRuntimeStatus,
      refreshDesktopRuntimeStatus,
      refreshBrowserRuntimeStatus,
    }),
    [
      browserPreferences,
      browserReadiness.available,
      browserReadiness.checking,
      browserReadiness.checkFailed,
      browserReadiness.message,
      browserReadiness.pluginEnabled,
      browserReadiness.pluginId,
      browserReadiness.pluginInstalled,
      desktopRuntimeStatus,
      preferences.computerUseEnabled,
      refreshBrowserRuntimeStatus,
    ],
  );
}
