import { execFileSync } from "node:child_process";
// Never forward credentials in argv, environment, output or the original process
// error to public Actions logs. Reproduce failures locally using dedicated accounts.
export function confidentialRun(bin, args, options = {}) {
  try { return execFileSync(bin, args, { ...options, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 }); }
  catch { throw new Error("Protected release operation failed. Reproduce locally with the dedicated credentials; output was withheld."); }
}
export function parseDedicatedAuth(value) {
  try {
    const result = JSON.parse(value);
    if (!result || typeof result !== "object" || (!result.tokens && !result.OPENAI_API_KEY)) throw new Error();
    return result;
  } catch { throw new Error("Dedicated test credentials are invalid; their contents were withheld."); }
}
