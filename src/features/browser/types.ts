export type BrowserReadiness = {
  checkFailed?: boolean;
  available: boolean;
  checking: boolean;
  message: string | null;
  pluginId: string | null;
  pluginInstalled: boolean;
  pluginEnabled: boolean;
  isolatedProfile: true;
  profileImportAvailable: boolean;
};

export type BrowserPreferences = {
  downloadLocation: string | null;
  askWhereToSave: boolean;
};
