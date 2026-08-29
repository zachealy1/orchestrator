export type PluginInstallPolicy =
  | "NOT_AVAILABLE"
  | "AVAILABLE"
  | "INSTALLED_BY_DEFAULT";

export type PluginAuthPolicy = "ON_INSTALL" | "ON_USE";

export type PluginComponentReadiness = {
  skills: number;
  apps: number;
  mcpServers: number;
  hooks: number;
};

export type CodexPluginSummary = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  marketplaceName: string;
  marketplacePath: string | null;
  version: string | null;
  installed: boolean;
  enabled: boolean;
  installPolicy: PluginInstallPolicy;
  authPolicy: PluginAuthPolicy;
  mustShowInstallationInterstitial: boolean;
  available: boolean;
  unavailableReason: string | null;
  keywords: string[];
  capabilities: string[];
  logoUrl: string | null;
  readiness: PluginComponentReadiness;
};

export type CodexPluginMarketplace = {
  name: string;
  path: string | null;
  plugins: CodexPluginSummary[];
};

export type CodexPluginCatalog = {
  marketplaces: CodexPluginMarketplace[];
  plugins: CodexPluginSummary[];
  featuredPluginIds: string[];
  errors: string[];
  refreshedAt: string;
};

export type PluginMutationState = {
  pluginId: string;
  action: "install" | "uninstall" | "enable" | "disable";
} | null;

export type PluginInstallResult = {
  authenticationRequired: boolean;
  authenticationTargets: string[];
};

export const EMPTY_PLUGIN_CATALOG: CodexPluginCatalog = {
  marketplaces: [],
  plugins: [],
  featuredPluginIds: [],
  errors: [],
  refreshedAt: "",
};

export function findPlugin(
  catalog: CodexPluginCatalog,
  ...identities: string[]
) {
  const wanted = identities.map(normalizePluginIdentity);
  return (
    catalog.plugins.find((plugin) => {
      const candidates = [plugin.id, plugin.name, plugin.displayName].map(
        normalizePluginIdentity,
      );
      return wanted.some((identity) => candidates.includes(identity));
    }) ?? null
  );
}

export function pluginIsReady(plugin: CodexPluginSummary | null) {
  return Boolean(plugin?.installed && plugin.enabled && plugin.available);
}

function normalizePluginIdentity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
}
