import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readBrowserRuntimeStatus } from "../../codexClient";
import {
  persistComputerUsePreference,
  readComputerUsePreference,
} from "../../lib/computerUse";
import type { BrowserRuntimeStatus } from "./types";

export type ComputerUseController = {
  computerUseEnabled: boolean;
  setComputerUseEnabled: Dispatch<SetStateAction<boolean>>;
  browserRuntimeStatus: BrowserRuntimeStatus | null;
  refreshBrowserRuntimeStatus: () => Promise<void>;
};

export function useComputerUseController(): ComputerUseController {
  const [computerUseEnabled, setComputerUseEnabled] = useState(
    () => readComputerUsePreference().enabled,
  );
  const [browserRuntimeStatus, setBrowserRuntimeStatus] =
    useState<BrowserRuntimeStatus | null>(null);

  useEffect(() => {
    persistComputerUsePreference({
      enabled: computerUseEnabled,
    });
  }, [computerUseEnabled]);

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
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshBrowserRuntimeStatus();
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
    browserRuntimeStatus,
    refreshBrowserRuntimeStatus,
  };
}
