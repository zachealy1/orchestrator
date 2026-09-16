import type { CodexRateLimitResetCredit } from "../analytics/usageLimits";

export function usageResetTitle(credit: CodexRateLimitResetCredit) {
  return credit.title?.trim() || (credit.resetType === "codexRateLimits" ? "Full reset" : "Usage reset");
}

export function usageResetExpiry(credit: CodexRateLimitResetCredit) {
  if (credit.expiresAt === null) return "Expiry not provided";
  const date = new Date(credit.expiresAt * 1_000);
  return `Expires ${date.toLocaleString(undefined, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  })}`;
}
