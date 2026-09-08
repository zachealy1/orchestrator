import { github, REPOSITORY, requireEnvironment } from "./lib.mjs";
requireEnvironment(["GH_TOKEN", "GITHUB_RUN_ID", "GITHUB_SERVER_URL"]);
const title = "Automatic Codex upgrade needs attention";
const issues = await github(`repos/${REPOSITORY}/issues?state=open&per_page=100`);
const issue = issues.find((item) => item.title === title && !item.pull_request);
const body = `The automatic upgrade or publication failed. Users remain on the previous manifest unless final publication completed.\n\n[Public workflow status](${process.env.GITHUB_SERVER_URL}/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}).\n\nCheck candidate scope, protocol compatibility, dedicated credentials, security checks, signing, notarization and both architecture artifacts. Never automatically weaken checks or rewrite app behavior. Pause using CODEX_AUTO_RELEASES_ENABLED=false.`;
await github(`repos/${REPOSITORY}/issues${issue ? `/${issue.number}` : ""}`, { method: issue ? "PATCH" : "POST", body: { title, body } });
