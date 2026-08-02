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
};

export function useComputerUseController(): ComputerUseController {
  const [computerUseEnabled, setComputerUseEnabled] = useState(
    () => readComputerUsePreference().enabled,
  );
  const [browserRuntimeStatus, setBrowserRuntimeStatus] =
    useState<BrowserRuntimeStatus | null>(null);

  useEffect(() => {
    persistComputerUsePreference({ enabled: computerUseEnabled });
  }, [computerUseEnabled]);

  useEffect(() => {
    let disposed = false;
    void readBrowserRuntimeStatus()
      .then((status) => {
        if (!disposed) setBrowserRuntimeStatus(status);
      })
      .catch((error) => {
        if (disposed) return;
        setBrowserRuntimeStatus({
          available: false,
          message:
            error instanceof Error
              ? error.message
              : "The bundled browser runtime is unavailable.",
        });
      });
    return () => {
      disposed = true;
    };
  }, []);

  return { computerUseEnabled, setComputerUseEnabled, browserRuntimeStatus };
}
