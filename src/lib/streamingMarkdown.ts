type MarkdownScanResult = {
  markdown: string;
  openFence: { marker: string; length: number } | null;
  openInlineCodeLength: number;
};

export function prepareStreamingMarkdown(markdown: string) {
  if (!markdown) return markdown;

  const scan = scanStreamingMarkdown(markdown);
  if (scan.openFence) {
    const separator = scan.markdown.endsWith("\n") ? "" : "\n";
    return `${scan.markdown}${separator}${scan.openFence.marker.repeat(
      scan.openFence.length,
    )}`;
  }

  if (scan.openInlineCodeLength > 0) {
    return `${scan.markdown}${"`".repeat(scan.openInlineCodeLength)}`;
  }

  return closeUnmatchedEmphasis(scan.markdown);
}

function scanStreamingMarkdown(markdown: string): MarkdownScanResult {
  let result = "";
  let index = 0;
  let openFence: MarkdownScanResult["openFence"] = null;
  let openInlineCodeLength = 0;

  while (index < markdown.length) {
    const character = markdown[index]!;

    if (openFence) {
      const fenceLength = countRun(markdown, index, openFence.marker);
      if (
        fenceLength >= openFence.length &&
        isFenceBoundary(markdown, index)
      ) {
        result += markdown.slice(index, index + fenceLength);
        index += fenceLength;
        openFence = null;
        continue;
      }
      result += character;
      index += 1;
      continue;
    }

    if (openInlineCodeLength > 0) {
      if (character === "`") {
        const tickLength = countRun(markdown, index, "`");
        result += markdown.slice(index, index + tickLength);
        index += tickLength;
        if (tickLength === openInlineCodeLength) {
          openInlineCodeLength = 0;
        }
        continue;
      }
      result += character;
      index += 1;
      continue;
    }

    if ((character === "`" || character === "~") && isFenceBoundary(markdown, index)) {
      const markerLength = countRun(markdown, index, character);
      if (markerLength >= 3) {
        result += markdown.slice(index, index + markerLength);
        index += markerLength;
        openFence = { marker: character, length: markerLength };
        continue;
      }
    }

    if (character === "`") {
      const tickLength = countRun(markdown, index, "`");
      result += markdown.slice(index, index + tickLength);
      index += tickLength;
      openInlineCodeLength = tickLength;
      continue;
    }

    if (character === "[") {
      const incompleteLink = readIncompleteLink(markdown, index);
      if (incompleteLink) {
        result += incompleteLink.label;
        index = incompleteLink.end;
        continue;
      }
    }

    result += character;
    index += 1;
  }

  return { markdown: result, openFence, openInlineCodeLength };
}

function readIncompleteLink(markdown: string, start: number) {
  const labelEnd = findUnescaped(markdown, "]", start + 1);
  if (labelEnd < 0 || markdown[labelEnd + 1] !== "(") return null;

  let depth = 1;
  let index = labelEnd + 2;
  while (index < markdown.length && markdown[index] !== "\n") {
    if (markdown[index] === "\\") {
      index += 2;
      continue;
    }
    if (markdown[index] === "(") depth += 1;
    if (markdown[index] === ")") depth -= 1;
    if (depth === 0) return null;
    index += 1;
  }

  return {
    label: markdown.slice(start + 1, labelEnd),
    end: index,
  };
}

function findUnescaped(value: string, target: string, start: number) {
  for (let index = start; index < value.length && value[index] !== "\n"; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === target) return index;
  }
  return -1;
}

function countRun(value: string, start: number, character: string) {
  let index = start;
  while (value[index] === character) index += 1;
  return index - start;
}

function isFenceBoundary(markdown: string, index: number) {
  const lineStart = markdown.lastIndexOf("\n", index - 1) + 1;
  const prefix = markdown.slice(lineStart, index);
  return prefix.length <= 3 && /^\s*$/u.test(prefix);
}

function closeUnmatchedEmphasis(markdown: string) {
  const trailingLine = markdown.slice(markdown.lastIndexOf("\n") + 1);
  const stack: string[] = [];
  const markerPattern = /(\*\*|__|~~|\*|_)/gu;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(trailingLine))) {
    const marker = match[0];
    const start = match.index;
    const before = trailingLine[start - 1] ?? "";
    const after = trailingLine[start + marker.length] ?? "";
    const insideWord = marker.includes("_") && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after);
    if (insideWord) continue;

    const canOpen = after.length > 0 && !/\s/u.test(after);
    const canClose = before.length > 0 && !/\s/u.test(before);
    if (canClose && stack[stack.length - 1] === marker) {
      stack.pop();
    } else if (canOpen) {
      stack.push(marker);
    }
  }

  return stack.length > 0
    ? `${markdown}${stack.reverse().join("")}`
    : markdown;
}
