export type BrowserReadiness = {
  available: boolean;
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
