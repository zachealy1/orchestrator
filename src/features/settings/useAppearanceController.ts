import { useEffect } from "react";
import {
  applyThemePreference,
  persistThemePreference,
} from "../../lib/theme";
import type { ResolvedTheme } from "../../shared/types";

export type AppearanceController = {
  resolvedTheme: ResolvedTheme;
};

export function useAppearanceController(): AppearanceController {
  useEffect(() => {
    persistThemePreference("dark");
    applyThemePreference("dark");
  }, []);

  return { resolvedTheme: "dark" };
}
