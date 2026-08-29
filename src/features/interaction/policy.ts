import type {
  InteractionAction,
  InteractionPermissionDecision,
  InteractionPolicyDecision,
} from "./types";

const BLOCKED_BUNDLE_IDS = new Set([
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.openai.chat",
  "com.openai.codex",
  "com.apple.systempreferences",
  "com.apple.SystemSettings",
]);

const BLOCKED_ACTION_PATTERN =
  /(?:administrator|security preferences|privacy settings|grant accessibility|terminal command|shell command)/iu;
const TAKEOVER_PATTERN =
  /(?:password|passcode|credential|one[ -]?time|\botp\b|two[ -]?factor|2fa|captcha|payment|card number|cvv|cvc|place order|purchase|wire transfer)/iu;
const CONFIRM_PATTERN =
  /(?:submit|send|publish|post|delete|remove|upload|export|invite|share|book|reserve|subscribe|unsubscribe|change account)/iu;

export type InteractionPolicyContext = {
  origin: string | null;
  bundleId: string | null;
  permission: InteractionPermissionDecision | null;
  developerModeEnabled: boolean;
};

export function evaluateInteractionAction(
  action: InteractionAction,
  context: InteractionPolicyContext,
): InteractionPolicyDecision {
  const description = `${action.kind} ${action.expectedEffect}`;
  if (
    action.consequence === "blocked" ||
    (context.bundleId && BLOCKED_BUNDLE_IDS.has(context.bundleId)) ||
    BLOCKED_ACTION_PATTERN.test(description)
  ) {
    return {
      outcome: "block",
      reason: "This surface or action is reserved for a dedicated, user-approved workflow.",
      confirmationKey: null,
    };
  }
  if (action.kind === "execute-code" && !context.developerModeEnabled) {
    return {
      outcome: "block",
      reason: "Arbitrary browser code requires Developer Mode for this task and site.",
      confirmationKey: null,
    };
  }
  if (TAKEOVER_PATTERN.test(description) || action.consequence === "sensitive") {
    return {
      outcome: "takeover",
      reason: "This action requires manual takeover because it involves authentication, payment, or another sensitive step.",
      confirmationKey: null,
    };
  }
  if (context.permission === "deny") {
    return {
      outcome: "block",
      reason: "Access to this site or application was denied.",
      confirmationKey: null,
    };
  }
  if (context.permission === null) {
    return {
      outcome: "confirm",
      reason: "Access to this site or application has not been granted.",
      confirmationKey: permissionKey(action, context),
    };
  }
  if (
    action.consequence === "external-side-effect" ||
    CONFIRM_PATTERN.test(description)
  ) {
    return {
      outcome: "confirm",
      reason: "This action can transmit data or cause an external side effect.",
      confirmationKey: permissionKey(action, context),
    };
  }
  return { outcome: "allow", reason: "Action is reversible and within granted access.", confirmationKey: null };
}

export function confirmationMatchesAction(
  confirmationKey: string,
  action: InteractionAction,
  context: Pick<InteractionPolicyContext, "origin" | "bundleId">,
) {
  return confirmationKey === permissionKey(action, context);
}

function permissionKey(
  action: InteractionAction,
  context: Pick<InteractionPolicyContext, "origin" | "bundleId">,
) {
  return [
    action.id,
    action.observationId,
    action.generation,
    context.origin ?? context.bundleId ?? "unknown-surface",
    action.expectedEffect,
  ].join(":");
}
