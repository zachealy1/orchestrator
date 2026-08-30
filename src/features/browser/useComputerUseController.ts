import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  listDefaultCodexSkills,
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

export type ComputerUseController = {
  computerUseEnabled: boolean;
  setComputerUseEnabled: Dispatch<SetStateAction<boolean>>;
  browserPreferences: BrowserPreferences;
  setBrowserDownloadLocation: (path: string | null) => void;
  setBrowserAskWhereToSave: (enabled: boolean) => void;
  browserReadiness: BrowserReadiness;
  desktopRuntimeStatus: DesktopRuntimeStatus | null;
  refreshDesktopRuntimeStatus: () => Promise<void>;
};

export function useComputerUseController(input: {
  pluginCatalog: CodexPluginCatalog;
}): ComputerUseController {
  const [preferences, setPreferences] = useState(readInteractionPreferences);
  const [browserPreferences, setBrowserPreferences] = useState(
    readBrowserPreferences,
  );
  const [desktopRuntimeStatus, setDesktopRuntimeStatus] =
    useState<DesktopRuntimeStatus | null>(null);
  const [browserSkillProbe, setBrowserSkillProbe] = useState<{
    key: string;
    available: boolean;
  } | null>(null);

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
  const browserSkillProbeKey = browserPluginReady
    ? `${browserPlugin?.id ?? "browser"}:${input.pluginCatalog.refreshedAt}`
    : null;
  const browserSkillAvailable =
    browserSkillProbeKey !== null &&
    browserSkillProbe?.key === browserSkillProbeKey
      ? browserSkillProbe.available
      : null;

  useEffect(() => {
    if (!browserPluginReady || browserSkillProbeKey === null) {
      setBrowserSkillProbe(null);
      return;
    }

    let cancelled = false;
    void listDefaultCodexSkills()
      .then((skills) => {
        if (cancelled) return;
        setBrowserSkillProbe({
          key: browserSkillProbeKey,
          available: skills.some((skill) =>
            `${skill.id} ${skill.name}`
              .toLocaleLowerCase()
              .includes("control-in-app-browser"),
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBrowserSkillProbe({
            key: browserSkillProbeKey,
            available: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [browserPluginReady, browserSkillProbeKey]);

  const browserReadiness: BrowserReadiness = {
    available: browserPluginReady && browserSkillAvailable === true,
    checking: browserPluginReady && browserSkillAvailable === null,
    message: browserPlugin
      ? browserPluginReady
        ? browserSkillAvailable === true
          ? "Browser plugin ready with an isolated in-app profile."
          : browserSkillAvailable === null
            ? "Checking whether this Codex host supports the in-app browser."
            : "The Browser plugin is installed, but this Codex host does not report in-app browser support."
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
    }),
    [
      browserPreferences,
      browserReadiness.available,
      browserReadiness.checking,
      browserReadiness.message,
      browserReadiness.pluginEnabled,
      browserReadiness.pluginId,
      browserReadiness.pluginInstalled,
      desktopRuntimeStatus,
      preferences.computerUseEnabled,
    ],
  );
}
