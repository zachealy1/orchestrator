import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readBrowserRuntimeStatus, readDesktopRuntimeStatus } from "../../codexClient";
import {
  persistComputerUsePreference,
  readComputerUsePreference,
} from "../../lib/computerUse";
import type { BrowserRuntimeStatus } from "./types";
import {
  persistInteractionPreferences,
  readInteractionPreferences,
} from "../interaction/preferences";
import type { DesktopRuntimeStatus, InteractionPreferences } from "../interaction/types";

export type ComputerUseController = {
  computerUseEnabled: boolean;
  setComputerUseEnabled: Dispatch<SetStateAction<boolean>>;
  desktopUseEnabled: boolean;
  setDesktopUseEnabled: Dispatch<SetStateAction<boolean>>;
  diagnosticsEnabled: boolean;
  setDiagnosticsEnabled: Dispatch<SetStateAction<boolean>>;
  developerModeEnabled: boolean;
  setDeveloperModeEnabled: Dispatch<SetStateAction<boolean>>;
  browserRuntimeStatus: BrowserRuntimeStatus | null;
  desktopRuntimeStatus: DesktopRuntimeStatus | null;
  refreshBrowserRuntimeStatus: () => Promise<void>;
  refreshDesktopRuntimeStatus: () => Promise<void>;
};

export function useComputerUseController(): ComputerUseController {
  const [preferences, setPreferences] = useState<InteractionPreferences>(() => {
    const current = readInteractionPreferences();
    const legacy = readComputerUsePreference();
    return { ...current, browserEnabled: current.browserEnabled ?? legacy.enabled };
  });
  const computerUseEnabled = preferences.browserEnabled;
  const desktopUseEnabled = preferences.desktopEnabled;
  const diagnosticsEnabled = preferences.diagnosticsEnabled;
  const developerModeEnabled = preferences.developerModeEnabled;
  const setPreference =
    (key: keyof InteractionPreferences): Dispatch<SetStateAction<boolean>> =>
    (value) => {
      setPreferences((current) => ({
        ...current,
        [key]: typeof value === "function" ? value(current[key]) : value,
      }));
    };
  const setComputerUseEnabled = setPreference("browserEnabled");
  const setDesktopUseEnabled = setPreference("desktopEnabled");
  const setDiagnosticsEnabled = setPreference("diagnosticsEnabled");
  const setDeveloperModeEnabled = setPreference("developerModeEnabled");
  const [browserRuntimeStatus, setBrowserRuntimeStatus] =
    useState<BrowserRuntimeStatus | null>(null);
  const [desktopRuntimeStatus, setDesktopRuntimeStatus] =
    useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    persistInteractionPreferences(preferences);
    persistComputerUsePreference({
      enabled: preferences.browserEnabled,
    });
  }, [preferences]);

  async function refreshBrowserRuntimeStatus() {
    try {
      setBrowserRuntimeStatus(await readBrowserRuntimeStatus());
    } catch (error) {
      setBrowserRuntimeStatus({
        available: false,
        defaultBrowser: null,
        browserSkillVersion: null,
        browserServiceCompatible: false,
        message:
          error instanceof Error
            ? error.message
            : "The bundled browser runtime is unavailable.",
      });
    }
  }

  async function refreshDesktopRuntimeStatus() {
    try {
      setDesktopRuntimeStatus(await readDesktopRuntimeStatus());
    } catch (error) {
      setDesktopRuntimeStatus({
        available: false,
        version: null,
        serviceCompatible: false,
        accessibilityTrusted: false,
        message:
          error instanceof Error
            ? error.message
            : "Desktop Computer Use is unavailable.",
      });
    }
  }

  useEffect(() => {
    let disposed = false;
    void readBrowserRuntimeStatus().then(
      (status) => {
        if (!disposed) setBrowserRuntimeStatus(status);
      },
      (error) => {
        if (disposed) return;
        setBrowserRuntimeStatus({
          available: false,
          defaultBrowser: null,
          browserSkillVersion: null,
          browserServiceCompatible: false,
          message:
            error instanceof Error
              ? error.message
              : "The bundled browser runtime is unavailable.",
        });
      },
    );
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void readDesktopRuntimeStatus().then(
      (status) => {
        if (!disposed) setDesktopRuntimeStatus(status);
      },
      (error) => {
        if (disposed) return;
        setDesktopRuntimeStatus({
          available: false,
          version: null,
          serviceCompatible: false,
          accessibilityTrusted: false,
          message:
            error instanceof Error
              ? error.message
              : "Desktop Computer Use is unavailable.",
        });
      },
    );
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshBrowserRuntimeStatus();
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

  return {
    computerUseEnabled,
    setComputerUseEnabled,
    desktopUseEnabled,
    setDesktopUseEnabled,
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    developerModeEnabled,
    setDeveloperModeEnabled,
    browserRuntimeStatus,
    desktopRuntimeStatus,
    refreshBrowserRuntimeStatus,
    refreshDesktopRuntimeStatus,
  };
}
