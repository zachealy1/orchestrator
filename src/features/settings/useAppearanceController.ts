import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  applyResolvedTheme,
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  watchSystemTheme,
} from "../../lib/theme";
import type { ThemePreference } from "../../shared/types";

export type AppearanceController = {
  themePreference: ThemePreference;
  setThemePreference: Dispatch<SetStateAction<ThemePreference>>;
  resolvedTheme: ReturnType<typeof resolveTheme>;
};

export function useAppearanceController(): AppearanceController {
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    readThemePreference,
  );
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(readThemePreference()),
  );

  useEffect(() => {
    persistThemePreference(themePreference);
    setResolvedTheme(applyThemePreference(themePreference));

    if (themePreference !== "system") return;

    return watchSystemTheme((theme) => {
      applyResolvedTheme(theme);
      setResolvedTheme(theme);
    });
  }, [themePreference]);

  return { themePreference, setThemePreference, resolvedTheme };
}
