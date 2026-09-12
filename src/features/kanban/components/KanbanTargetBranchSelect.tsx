import { useCallback, useEffect, useRef, useState } from "react";
import { listGitBranches } from "../../../codexClient";
import { BranchSelect } from "../../workspaces/BranchSelect";
import type { KanbanTargetBranch } from "../boardPreferences";

type Props = {
  active: boolean;
  workspacePath: string;
  repositoryPath: string;
  target?: KanbanTargetBranch;
  disabled: boolean;
  onSave: (target: KanbanTargetBranch, initialize?: boolean) => Promise<void>;
  onError: (message: string) => void;
};

export function KanbanTargetBranchSelect({
  active,
  workspacePath,
  repositoryPath,
  target,
  disabled,
  onSave,
  onError,
}: Props) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const callbacks = useRef({ onSave, onError, target });
  callbacks.current = { onSave, onError, target };
  const branch = target?.repositoryPath === repositoryPath ? target.branch : null;

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await listGitBranches(workspacePath, repositoryPath);
      if (request !== sequence.current) return;
      setBranches(result.branches);
      setLoaded(true);
      const saved = callbacks.current.target;
      if (
        (!saved || saved.repositoryPath !== repositoryPath) &&
        !initialized.current && result.currentBranch
      ) {
        initialized.current = true;
        await callbacks.current.onSave(
          { repositoryPath, branch: result.currentBranch },
          true,
        );
      }
    } catch (error) {
      if (request !== sequence.current) return;
      callbacks.current.onError(`Kanban target branch could not be loaded or saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [workspacePath, repositoryPath]);

  useEffect(() => {
    if (active) void refresh();
    return () => {
      sequence.current += 1;
    };
  }, [active, refresh]);

  return (
    <BranchSelect
      ariaLabel="Target branch"
      branch={branch}
      branches={branches}
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
