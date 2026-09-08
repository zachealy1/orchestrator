// Synchronous frontend barrier: no new run can enter setup during the final flush.
let installing = false;
export function assertWorkMayStart() {
  if (installing) throw new Error("An update is being installed. Please wait for Orchestrator to restart.");
}
export function reserveUpdateInstallation() {
  assertWorkMayStart();
  installing = true;
  return () => { installing = false; };
}
