export type UnifiedDiffFilePatch = {
  oldPath: string | null;
  newPath: string | null;
  content: string;
};

const DIFF_HEADER = /^diff --git /gm;

/**
 * Splits a repository-level Git diff into file patches while preserving each
 * patch byte-for-byte. Paths are normalized to the repository-relative form
 * returned by `git status`.
 */
export function extractUnifiedDiffFilePatches(
  content: string,
): UnifiedDiffFilePatch[] {
  const starts = Array.from(content.matchAll(DIFF_HEADER), (match) => match.index);

  return starts.map((start, index) => {
    const patchContent = content.slice(start, starts[index + 1] ?? content.length);
    const paths = readPatchPaths(patchContent);
    return { ...paths, content: patchContent };
  });
}

function readPatchPaths(content: string) {
  const lines = content.split(/\r?\n/);
  const headerPaths = parseDiffHeader(lines[0] ?? "");
  let oldPath = headerPaths.oldPath;
  let newPath = headerPaths.newPath;

  for (const line of lines.slice(1)) {
    if (line.startsWith("--- ")) {
      oldPath = parsePathField(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      newPath = parsePathField(line.slice(4));
    } else if (line.startsWith("rename from ")) {
      oldPath = parsePathField(line.slice("rename from ".length), false);
    } else if (line.startsWith("rename to ")) {
      newPath = parsePathField(line.slice("rename to ".length), false);
    }
  }

  return { oldPath, newPath };
}

function parseDiffHeader(line: string) {
  const fields = parseGitFields(line.slice("diff --git ".length));
  return {
    oldPath: normalizeRepositoryPath(fields[0] ?? null),
    newPath: normalizeRepositoryPath(fields[1] ?? null),
  };
}

function parsePathField(field: string, stripPrefix = true) {
  const value = field.startsWith('"')
    ? parseGitFields(field)[0] ?? null
    : field;
  return normalizeRepositoryPath(value, stripPrefix);
}

function normalizeRepositoryPath(
  path: string | null,
  stripPrefix = true,
): string | null {
  if (!path || path === "/dev/null") return null;
  return stripPrefix ? path.replace(/^[ab]\//, "") : path;
}

function parseGitFields(value: string) {
  const fields: string[] = [];
  let index = 0;

  while (index < value.length) {
    while (value[index] === " ") index += 1;
    if (index >= value.length) break;

    if (value[index] === '"') {
      const parsed = parseQuotedGitField(value, index + 1);
      fields.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }

    const nextSeparator = value.indexOf(" ", index);
    if (nextSeparator === -1) {
      fields.push(value.slice(index));
      break;
    }
    fields.push(value.slice(index, nextSeparator));
    index = nextSeparator + 1;
  }

  if (fields.length > 2) {
    // Unquoted paths can contain spaces. Git's two diff header paths have the
    // same a/ and b/ prefixes, so use the last b/ marker as their separator.
    const separator = value.lastIndexOf(" b/");
    if (separator > 0) {
      return [value.slice(0, separator), value.slice(separator + 1)];
    }
  }

  return fields;
}

function parseQuotedGitField(value: string, start: number) {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  let index = start;

  const appendText = (text: string) => bytes.push(...encoder.encode(text));

  while (index < value.length) {
    const character = value[index];
    if (character === '"') {
      return {
        value: new TextDecoder().decode(Uint8Array.from(bytes)),
        nextIndex: index + 1,
      };
    }
    if (character !== "\\") {
      appendText(character);
      index += 1;
      continue;
    }

    const escape = value[index + 1];
    if (escape && /[0-7]/.test(escape)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? escape;
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length + 1;
      continue;
    }

    const escapes: Record<string, string> = {
      a: "\u0007",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\u000b",
      "\\": "\\",
      '"': '"',
    };
    appendText(escapes[escape] ?? escape ?? "\\");
    index += escape ? 2 : 1;
  }

  return {
    value: new TextDecoder().decode(Uint8Array.from(bytes)),
    nextIndex: index,
  };
}
