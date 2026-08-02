import { listWorkspaceDirectory } from "../../codexClient";
import { basename } from "../../shared/paths";
import type { ComposerContextFile } from "../composer/types";
import type { Workspace, WorkspaceTreeEntry } from "./types";

export async function collectWorkspaceFiles(
  workspace: Workspace,
  directoryPath: string,
): Promise<WorkspaceTreeEntry[]> {
  const entries = await listWorkspaceDirectory(workspace.path, directoryPath);
  const files = entries.filter((entry) => entry.kind === "file");
  const childFiles = await Promise.all(
    entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => collectWorkspaceFiles(workspace, entry.path)),
  );
  return [...files, ...childFiles.flat()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export function searchWorkspaceFiles(
  files: WorkspaceTreeEntry[],
  query: string,
): ComposerContextFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  return files
    .map((file) => ({ file, score: workspaceFileSearchScore(file, normalizedQuery) }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => {
      const scoreDifference = (left.score ?? 0) - (right.score ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      const lengthDifference =
        left.file.relativePath.length - right.file.relativePath.length;
      return lengthDifference || left.file.relativePath.localeCompare(right.file.relativePath);
    })
    .slice(0, 8)
    .map(({ file }) => ({
      path: file.path,
      name: file.name,
      source: "search" as const,
      relativePath: file.relativePath,
      status: "ready" as const,
    }));
}

function workspaceFileSearchScore(
  file: WorkspaceTreeEntry,
  normalizedQuery: string,
) {
  const name = file.name.toLowerCase();
  const relativePath = file.relativePath.toLowerCase();
  if (name.startsWith(normalizedQuery)) return 0;
  if (relativePath.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (relativePath.includes(normalizedQuery)) return 3;
  return null;
}

export function normalizeWorkspacePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathBelongsToWorkspace(path: string, workspacePath: string) {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  return (
    normalizedPath === normalizedWorkspacePath ||
    normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
  );
}

export function joinWorkspacePath(workspacePath: string, relativePath: string) {
  return `${normalizeWorkspacePath(workspacePath)}/${relativePath.replace(/^\/+/, "")}`;
}

export function workspaceFileEntryFromResponseLink(
  href: string,
  workspace: Workspace,
): WorkspaceTreeEntry | null {
  const path = resolveResponseLinkPath(href, workspace.path);
  if (!path || !pathBelongsToWorkspace(path, workspace.path)) return null;
  const normalizedPath = normalizeWorkspacePath(path);
  const workspaceRoot = normalizeWorkspacePath(workspace.path);
  const relativePath = normalizedPath.slice(workspaceRoot.length).replace(/^\/+/, "");
  if (!relativePath) return null;
  return {
    name: basename(relativePath),
    path: normalizedPath,
    relativePath,
    kind: "file",
  };
}

export function resolveResponseLinkPath(href: string, workspacePath: string) {
  const cleanHref = href.trim();
  if (!cleanHref || cleanHref.startsWith("#")) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(cleanHref)) {
    try {
      const url = new URL(cleanHref);
      if (
        url.protocol === "file:" ||
        ((url.protocol === "http:" || url.protocol === "https:") &&
          isLocalhost(url.hostname))
      ) {
        return stripResponseLinkLineReference(
          safeDecodeURIComponent(url.pathname),
          workspacePath,
        );
      }
    } catch {
      return null;
    }
    return null;
  }
  const pathOnly = stripLinkSearchAndHash(cleanHref);
  if (!pathOnly) return null;
  const decodedPath = safeDecodeURIComponent(pathOnly);
  const resolvedPath = decodedPath.startsWith("/")
    ? decodedPath
    : joinWorkspacePath(workspacePath, decodedPath);
  return stripResponseLinkLineReference(resolvedPath, workspacePath);
}

function stripResponseLinkLineReference(path: string, workspacePath: string) {
  const normalizedPath = normalizeWorkspacePath(path);
  if (!pathBelongsToWorkspace(normalizedPath, workspacePath)) return normalizedPath;
  const match = normalizedPath.match(/^(.*):\d+(?::\d+)?$/);
  return !match?.[1] || match[1].endsWith("/") ? normalizedPath : match[1];
}

function stripLinkSearchAndHash(href: string) {
  const [withoutHash] = href.split("#", 1);
  const [withoutSearch] = withoutHash.split("?", 1);
  return withoutSearch;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
