import { GitBranch, GitBranchPlus } from "lucide-react";
import { ComposerSelect } from "../../components/ComposerSelect";

export type BranchSelectProps = {
  branch: string | null;
  branches: string[];
  disabled?: boolean;
  unavailable?: boolean;
  ariaLabel?: string;
  tooltip?: string;
  onChange: (branch: string) => void;
  onOpen?: () => void;
  onCreateBranch?: () => void;
};

export function BranchSelect({
  branch,
  branches,
  disabled,
  unavailable = false,
  ariaLabel = "Branch",
  tooltip,
  onChange,
  onOpen,
  onCreateBranch,
}: BranchSelectProps) {
  return (
    <ComposerSelect
      ariaLabel={ariaLabel}
      value={branch ?? ""}
      options={[
        ...(unavailable && branch && !branches.includes(branch)
          ? [{ value: branch, label: `${branch} (unavailable)`, disabled: true }]
          : []),
        ...branches.map((candidate) => ({ value: candidate, label: candidate })),
        ...(onCreateBranch
          ? [{
              id: "create-branch",
              value: "",
              label: "Create branch...",
              action: true,
              icon: <GitBranchPlus size={14} />,
            }]
          : []),
      ]}
      placeholder="No branch"
      icon={<GitBranch size={14} />}
      className="workspace-branch-select"
      disabled={disabled}
      tooltip={tooltip}
      onChange={onChange}
      onOpen={onOpen}
      onAction={(id) => {
        if (id === "create-branch") onCreateBranch?.();
      }}
    />
  );
}
