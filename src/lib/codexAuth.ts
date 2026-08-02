import type { CodexAccount, CodexLoginResponse, CodexLoginState, CodexPlanType } from "../features/codex/types";

type AuthMessageInput = {
  connected: boolean;
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
  loginState: CodexLoginState;
  loginUserCode: string | null;
  errorMessage: string | null;
};

export function formatCodexAuthMessage(input: AuthMessageInput) {
  if (input.loginState === "failed" && input.errorMessage) {
    return `Sign-in failed: ${input.errorMessage}`;
  }

  if (input.loginState === "waiting") {
    return input.loginUserCode
      ? `Enter code ${input.loginUserCode} in the browser.`
      : "Waiting for browser sign-in.";
  }

  if (!input.connected) {
    return input.errorMessage ?? "Codex not connected";
  }

  if (input.account?.type === "chatgpt") {
    const email = input.account.email ?? "your ChatGPT account";
    return `Signed in as ${email} (${formatCodexPlanType(input.account.planType)})`;
  }

  if (input.account?.type === "apiKey") {
    return "Signed in with API key";
  }

  if (input.account?.type === "amazonBedrock") {
    const source =
      input.account.credentialSource === "codexManaged" ? "Codex-managed" : "AWS-managed";
    return `Signed in with Amazon Bedrock (${source})`;
  }

  return input.requiresOpenaiAuth ? "Codex requires authentication" : "OpenAI auth not required";
}

export function formatLoginStartStatus(response: CodexLoginResponse) {
  if (response.type === "chatgptDeviceCode") {
    return `Enter code ${response.userCode} in the browser.`;
  }

  if (response.type === "chatgpt") {
    return "Waiting for browser sign-in.";
  }

  if (response.type === "apiKey") {
    return "Orchestrator does not support Codex API key sign-in in-app yet.";
  }

  return "Orchestrator does not support this Codex sign-in flow in-app yet.";
}

export function isCodexSignedIn(account: CodexAccount | null) {
  return account !== null;
}

export function shouldBlockRunForAuth(
  requiresOpenaiAuth: boolean,
  account: CodexAccount | null,
) {
  return requiresOpenaiAuth && !isCodexSignedIn(account);
}

export function getCodexAccountSummary(account: CodexAccount | null) {
  if (account?.type === "chatgpt") {
    const title = account.email ?? "ChatGPT account";
    const firstCharacter = account.email?.trim().charAt(0);
    return {
      title,
      subtitle: formatCodexPlanType(account.planType),
      avatarLabel: firstCharacter ? firstCharacter.toUpperCase() : "C",
    };
  }

  if (account?.type === "apiKey") {
    return {
      title: "API key account",
      subtitle: "OpenAI",
      avatarLabel: "K",
    };
  }

  if (account?.type === "amazonBedrock") {
    return {
      title: "Amazon Bedrock",
      subtitle: account.credentialSource === "codexManaged" ? "Codex-managed" : "AWS-managed",
      avatarLabel: "A",
    };
  }

  return null;
}

export function formatCodexPlanType(planType: CodexPlanType) {
  switch (planType) {
    case "go":
      return "Go";
    case "plus":
      return "Plus";
    case "pro":
      return "Pro";
    case "prolite":
      return "Pro Lite";
    case "team":
      return "Team";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
    case "edu":
      return "Edu";
    case "free":
      return "Free";
    case "self_serve_business_usage_based":
      return "Business Usage-Based";
    case "enterprise_cbp_usage_based":
      return "Enterprise Usage-Based";
    default:
      return "Unknown";
  }
}
