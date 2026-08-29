export type CodexProfileKey = `account:${number}` | "default";

export type CodexConnectResult = {
  pid: number | null;
  alreadyConnected: boolean;
  initialize: unknown;
};

export type CodexPlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_usage_based"
  | "business"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "unknown";

export type CodexAuthMode =
  | "apikey"
  | "chatgpt"
  | "chatgptAuthTokens"
  | "agentIdentity"
  | "personalAccessToken"
  | "bedrockApiKey";

export type CodexAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string | null; planType: CodexPlanType }
  | {
      type: "amazonBedrock";
      credentialSource: "codexManaged" | "awsManaged";
    };

export type CodexAccountResponse = {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
};

export type CodexLoginResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | {
      type: "chatgptDeviceCode";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    }
  | { type: "chatgptAuthTokens" };

export type CodexLoginState = "idle" | "starting" | "waiting" | "failed";

export type ActiveCodexLogin = {
  accountId: number;
  loginId: string | null;
  authUrl: string | null;
  connectionGeneration: number;
  startedAtMs: number;
  expiresAtMs: number;
  state: "starting" | "waiting";
};

export type AccountLoginCompletedNotification = {
  success: boolean;
  error: string | null;
  loginId: string | null;
};

export type AccountUpdatedNotification = {
  authMode?: CodexAuthMode | null;
  planType?: CodexPlanType | null;
};

export type CodexMessage = {
  method?: string;
  id?: string | number;
  requestToken?: string | null;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

export type CodexMessageEvent = {
  accountId: number;
  profileKey: CodexProfileKey;
  message: CodexMessage;
  requestToken?: string | null;
};

export type CodexProcessEvent = {
  accountId: number;
  profileKey: CodexProfileKey;
  status: string;
  message: string;
};

export type CodexAccessMode = "ask-for-approval" | "full-access";

export type RunInteractionMode = "chat" | "plan" | "goal" | "goal-plan";

export type ReasoningEffortOption = {
  reasoningEffort: string;
  description: string;
};

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  contextWindow?: number | null;
  contextWindowTokens?: number | null;
  modelContextWindow?: number | null;
  supportedReasoningEfforts: ReasoningEffortOption[];
  defaultReasoningEffort: string;
  isDefault: boolean;
};

export type ModelListResponse = {
  data: CodexModel[];
  nextCursor: string | null;
};
