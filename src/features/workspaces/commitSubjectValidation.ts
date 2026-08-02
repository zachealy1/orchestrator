import { basename } from "../../shared/paths";
import type { WorkspaceGitFileStatus } from "./types";

export function cleanGeneratedCommitSubject(subject: string) {
  return subject
    .replace(
      /\s+\((?:\d+\s+(?:modified|added|deleted|untracked|renamed|copied|changed)(?:,\s*)?)+\)$/i,
      "",
    )
    .trim();
}

export function generatedCommitSubjectRejectionReason(
  subject: string,
  files: WorkspaceGitFileStatus[],
) {
  const raw = subject.trim();
  if (!raw) return "Codex returned an empty subject.";
  if (raw.includes("\n") || /[`*#]/.test(raw)) {
    return "Codex returned a malformed or Markdown-formatted subject.";
  }
  if (
    /\s+\((?:\d+\s+(?:modified|added|deleted|untracked|renamed|copied|changed)(?:,\s*)?)+\)$/i.test(raw)
  ) {
    return "Codex returned a subject containing change counts.";
  }
  const cleaned = cleanGeneratedCommitSubject(raw);
  if (cleaned.length > 72) return "Codex returned a subject longer than 72 characters.";
  const normalized = normalizeSubject(cleaned).replace(/[.!?]+$/g, "").trim();
  if (
    new Set([
      "implement plan", "implement the plan", "apply plan", "apply the plan",
      "execute plan", "execute the plan", "follow plan", "follow the plan",
      "complete plan", "complete the plan", "continue plan", "continue the plan",
      "apply requested changes", "apply requested workspace changes",
      "implement requested changes", "make requested changes",
      "address requested changes", "complete task", "finish task",
    ]).has(normalized)
  ) {
    return "Codex returned an orchestration instruction instead of the change intent.";
  }
  if (isDiffDrivenCommitSubject(cleaned, files)) {
    return "Codex returned a file-focused or generic subject.";
  }
  return null;
}

function normalizeSubject(value: string) {
  return value
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDiffDrivenCommitSubject(
  subject: string,
  files: WorkspaceGitFileStatus[],
) {
  const normalized = normalizeSubject(cleanGeneratedCommitSubject(subject));
  if (!normalized) return true;
  const fileStemSubjects = files.flatMap((file) => {
    const fileName = basename(file.relativePath);
    const stem = fileName.replace(/\.[^.]+$/, "").trim();
    return [normalizeSubject(fileName), normalizeSubject(stem)].filter(Boolean);
  });
  const fileOnlyVerbs = ["update", "refine", "improve", "change", "modify"];
  if (
    fileStemSubjects.some((fileName) =>
      fileOnlyVerbs.some((verb) => normalized === `${verb} ${fileName}`),
    )
  ) return true;

  const exactGeneric = new Set([
    "update app css", "refine app css", "improve app css", "update app tsx",
    "refine app tsx", "improve app tsx", "update lib rs", "refine lib rs",
    "improve lib rs", "update app styling", "refine app styling",
    "improve app styling", "update app shell", "refine app shell",
    "improve app shell", "update tauri bridge", "refine tauri bridge",
    "improve tauri bridge", "update tauri backend", "refine tauri backend",
    "improve tauri backend", "update app styling and app shell",
    "refine app styling and app shell", "improve app styling and app shell",
    "update app shell and app styling", "refine app shell and app styling",
    "improve app shell and app styling", "update tauri bridge and app styling",
    "refine tauri bridge and app styling", "improve tauri bridge and app styling",
    "update app styling and tauri bridge", "refine app styling and tauri bridge",
    "improve app styling and tauri bridge", "update react app", "refine react app",
    "improve react app", "update files", "refine files", "improve files",
    "update code", "refine code", "improve code",
  ]);
  if (exactGeneric.has(normalized)) return true;

  const words = normalized.split(" ").filter((word) => word !== "and");
  const [verb, ...rest] = words;
  const broadWords = new Set([
    "app", "application", "backend", "bridge", "code", "desktop", "files",
    "frontend", "integration", "react", "shell", "styling", "tauri", "ui",
    "workflow", "workspace",
  ]);
  return (
    ["update", "refine", "improve"].includes(verb ?? "") &&
    rest.length > 0 && rest.length <= 5 && rest.every((word) => broadWords.has(word))
  );
}
