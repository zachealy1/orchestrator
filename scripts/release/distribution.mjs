import { requireEnvironment, versionParts } from "./lib.mjs";

export function distribution(value = "notarized") {
  if (!["notarized", "community"].includes(value)) throw new Error("Unknown release distribution; refusing to relax signing requirements");
  return value;
}

export const COMMUNITY_NOTICE = "Community beta — not notarized by Apple. macOS may block first launch; review the installation instructions before deciding whether to open it. Update signatures verify the publisher's update key, not Apple approval.";

export function validateDistributionVersion(profile, version) {
  distribution(profile);
  const parts = versionParts(version);
  if (profile === "community" && !Number.isFinite(parts[3])) throw new Error("Non-notarized community releases must be labelled beta");
}

export function requireSigning(profile, env = process.env) {
  distribution(profile);
  requireEnvironment(["ORCHESTRATOR_UPDATER_PUBLIC_KEY", "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"], env);
  if (profile === "notarized") {
    requireEnvironment(["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"], env);
    if (!env.APPLE_SIGNING_IDENTITY.startsWith("Developer ID Application:")) throw new Error("A Developer ID Application signing identity is required");
  }
}

export function packagingConfig(profile, env = process.env) {
  requireSigning(profile, env);
  return {
    // Tauri also needs this key when validating the generated updater artifact.
    // The native service independently embeds the same public environment value.
    plugins: { updater: { pubkey: env.ORCHESTRATOR_UPDATER_PUBLIC_KEY.trim() } },
    bundle: { createUpdaterArtifacts: true, macOS: {
      signingIdentity: profile === "community" ? "-" : env.APPLE_SIGNING_IDENTITY,
      hardenedRuntime: true,
    } },
  };
}

export function requirePublicationApproval(profile, sourceSha, env = process.env) {
  distribution(profile);
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) throw new Error("An exact source SHA is required");
  // Community publication is authorized by manual workflow dispatch and the
  // existing GitHub environment controls; it makes no claim of behavioral testing.
  if (profile === "notarized" && env.BETA_REHEARSAL_APPROVED !== "true") {
    throw new Error("Clean-Mac notarized beta rehearsal has not been approved. Publication is blocked.");
  }
}

export function distributionNotes(profile, notes) {
  distribution(profile);
  return profile === "community" ? `${COMMUNITY_NOTICE}\n\nBuilt with package integrity checks; not behaviorally tested.\n\n${notes}` : `Developer ID signed and notarized macOS distribution.\n\n${notes}`;
}

export function validateAppSignature(profile, signature) {
  distribution(profile);
  if (!/flags=.*\bruntime\b/.test(signature)) throw new Error("The packaged app must retain hardened runtime");
  if (profile === "community" ? !/^Signature=adhoc$/m.test(signature) : !/^Authority=Developer ID Application:/m.test(signature)) {
    throw new Error("Packaged app signing identity differs from the selected distribution");
  }
}

// Receipts bind both architectures to the same source, profile and verified bytes.
export function validatePackageReceipt(receipt, { profile, version, sourceSha, arch, assets }) {
  validateDistributionVersion(profile, version);
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "") || receipt?.schemaVersion !== 1 || receipt.sourceSha !== sourceSha
    || receipt.version !== version || receipt.architecture !== arch || receipt.distribution !== profile
    || receipt.notarized !== (profile === "notarized") || receipt.updaterSignatureVerified !== true
    || (profile === "community" && receipt.behavioralTesting !== "not-performed")
    || !receipt.artifacts || Object.keys(receipt.artifacts).length !== assets.length
    || assets.some(asset => receipt.artifacts[asset.name] !== asset.digest)) {
    throw new Error("Package verification receipt differs from the source, distribution or artifact hashes");
  }
}
