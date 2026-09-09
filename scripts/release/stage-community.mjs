import { mkdir, readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ARCHES, REPOSITORY } from "./lib.mjs";
import { readArtifacts } from "./publish.mjs";
import { confidentialRun } from "./safe-process.mjs";
import { COMMUNITY_NOTICE } from "./distribution.mjs";

export function stagingTarget(env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== "refs/heads/release"
    || !/^[a-f0-9]{40}$/.test(env.RELEASE_SOURCE_SHA ?? "")
    || !/^community-build-\d+-\d+$/.test(env.STAGING_TAG ?? "")) {
    throw new Error("Community staging requires the trusted repository, release-branch workflow and exact source");
  }
  return { tag: env.STAGING_TAG, sourceSha: env.RELEASE_SOURCE_SHA };
}

export function validateStagingRelease(release, { tag, sourceSha }) {
  if (!release?.draft || release.tag_name !== tag || release.target_commitish !== sourceSha
    || !release.body?.startsWith(COMMUNITY_NOTICE)) throw new Error("Unexpected community staging release; refusing to reuse it");
}

// Draft Release assets avoid Actions artifact-storage charges. Only a fixed
// allowlist leaves the runner; source trees, profiles and logs are never uploaded.
export async function stageCommunity(mode, env = process.env, run = confidentialRun) {
  if (!["prepare", "upload", "download"].includes(mode)) throw new Error("Unknown staging operation");
  const target = stagingTarget(env), root = resolve("release-artifacts");
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  const gh = args => run("gh", [...args, "--repo", REPOSITORY], { encoding: "utf8" });
  if (mode === "prepare") {
    gh(["release", "create", target.tag, "--draft", "--prerelease", "--target", target.sourceSha,
      "--title", `Community beta packages ${target.tag}`, "--notes",
      `${COMMUNITY_NOTICE}\n\nPackage staging only; not behaviorally tested. Source: ${target.sourceSha}. Both architectures must finish before publication. No logs or account data belong here.`]);
  }
  // REST's /releases/tags endpoint cannot resolve a draft's pending tag. The CLI
  // performs the separate draft lookup; do not accidentally require publication.
  const view = JSON.parse(gh(["release", "view", target.tag, "--json", "isDraft,tagName,targetCommitish,body,assets"]));
  const release = { draft: view.isDraft, tag_name: view.tagName, target_commitish: view.targetCommitish, body: view.body, assets: view.assets };
  validateStagingRelease(release, target);
  const options = { profile: "community", version, sourceSha: target.sourceSha };
  if (mode === "upload") {
    if (!ARCHES.includes(env.RELEASE_ARCH)) throw new Error("Unsupported staging architecture");
    const files = await readArtifacts(root, { ...options, arches: [env.RELEASE_ARCH] });
    // No --clobber: conflicting/replaced bytes must fail instead of overwriting.
    gh(["release", "upload", target.tag, ...files.map(file => join(root, file.name))]);
  } else if (mode === "download") {
    await mkdir(root, { recursive: true });
    if ((await readdir(root)).length) throw new Error("Download destination must be empty");
    const names = ARCHES.flatMap(arch => [`Orchestrator_${arch}.dmg`, `Orchestrator_${arch}.app.tar.gz`,
      `Orchestrator_${arch}.app.tar.gz.sig`, `verification-${arch}.json`, `SHA256SUMS-${arch}.txt`]);
    if (release.assets.length !== names.length || names.some(name => release.assets.filter(asset => asset.name === name).length !== 1)) {
      throw new Error("Staging must contain exactly both verified architecture packages");
    }
    gh(["release", "download", target.tag, "--dir", root, ...names.flatMap(name => ["--pattern", name])]);
    await readArtifacts(root, options);
  } else if (mode !== "prepare") throw new Error("Unknown staging operation");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await stageCommunity(process.argv[2]);
  console.log("Community staging operation completed; no release or feed was published.");
}
