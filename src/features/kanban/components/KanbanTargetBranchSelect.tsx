import { useCallback, useEffect, useRef, useState } from "react";
import { listGitBranches } from "../../../codexClient";
import { BranchSelect } from "../../workspaces/BranchSelect";
import type { GitBranchList } from "../../workspaces/types";
import type { KanbanTargetBranch } from "../boardPreferences";

type Props = {
  active: boolean;
  workspacePath: string;
  repositoryPath: string;
  target?: KanbanTargetBranch;
  disabled: boolean;
  onSave: (target: KanbanTargetBranch, initialize?: boolean) => Promise<void>;
  onError: (message: string) => void;
  onRecovered: (message: string) => void;
};

export function KanbanTargetBranchSelect({
  active,
  workspacePath,
  repositoryPath,
  target,
  disabled,
  onSave,
  onError,
  onRecovered,
}: Props) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failedRequest, setFailedRequest] = useState<number | null>(null);
  const reportedLoadError = useRef<string | null>(null);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const callbacks = useRef({ onSave, onError, onRecovered, target });
  callbacks.current = { onSave, onError, onRecovered, target };
  const branch = target?.repositoryPath === repositoryPath ? target.branch : null;

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setFailedRequest(null);
    let result: GitBranchList;
    try {
      result = await listGitBranches(workspacePath, repositoryPath);
    } catch (error) {
      if (request !== sequence.current) return;
      const message = `Kanban target branches could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
      setLoaded(false);
      setFailedRequest(request);
      if (reportedLoadError.current !== message) callbacks.current.onError(message);
      reportedLoadError.current = message;
      return;
    }
    if (request !== sequence.current) return;
    setBranches(result.branches);
    setLoaded(true);
    if (reportedLoadError.current) {
      callbacks.current.onRecovered(reportedLoadError.current);
      reportedLoadError.current = null;
    }
    const saved = callbacks.current.target;
    if (
      (!saved || saved.repositoryPath !== repositoryPath) &&
      !initialized.current && result.currentBranch
    ) {
      initialized.current = true;
      try {
        await callbacks.current.onSave(
          { repositoryPath, branch: result.currentBranch },
          true,
        );
      } catch (error) {
        if (request !== sequence.current) return;
        initialized.current = false;
        callbacks.current.onError(`Kanban target branch could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }, [workspacePath, repositoryPath]);

  useEffect(() => {
    if (active) void refresh();
    return () => {
      sequence.current += 1;
    };
  }, [active, refresh]);

  useEffect(() => {
    if (!active || failedRequest === null) return;
    // Schedule after a failed response so slow Git probes cannot overlap or
    // continuously invalidate one another. Keep recovery available while disabled.
    const timer = window.setTimeout(() => void refresh(), 5_000);
    return () => window.clearTimeout(timer);
  }, [active, failedRequest, refresh]);

  return (
    <BranchSelect
      ariaLabel="Target branch"
      branch={branch}
      branches={!loaded && branch && !branches.includes(branch) ? [branch, ...branches] : branches}
      unavailable={loaded && branch !== null && !branches.includes(branch)}
      disabled={disabled || !loaded}
      tooltip="Base branch for new card branches and their pull requests. Existing card branches keep their target."
      onOpen={() => {
        void refresh();
      }}
      onChange={(value) => {
        void onSave({ repositoryPath, branch: value }).catch((error: unknown) => {
          callbacks.current.onError(`Kanban target branch could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        });
      }}
    />
  );
}
