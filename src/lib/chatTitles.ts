export const GENERATING_CHAT_TITLE = "Generating title...";

const MAX_TITLE_WORDS = 7;
const MAX_TITLE_CHARACTERS = 72;

const GENERIC_TITLES = new Set([
  "new chat",
  "new conversation",
  "help request",
  "user request",
  "general question",
  "question",
  "conversation",
  "coding task",
  "code help",
  "task request",
]);

function removePromptNoise(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/^\s{0,3}(?:#{1,6}|[-+>] |\d+[.)]\s+)/gm, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeTitleDecoration(value: string) {
  return value
    .replace(/^\s*(?:title|chat title|conversation title)\s*:\s*/i, "")
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/["'“”‘’`*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

function limitTitle(value: string) {
  const words = value.split(/\s+/).filter(Boolean).slice(0, MAX_TITLE_WORDS);
  let title = words.join(" ");
  if (title.length > MAX_TITLE_CHARACTERS) {
    title = title.slice(0, MAX_TITLE_CHARACTERS).trimEnd();
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace >= 24) {
      title = title.slice(0, lastSpace);
    }
  }
  return title.replace(/[.!?,;:]+$/g, "").trim();
}

function normalizedTitle(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fallbackChatTitle(initialPrompt: string) {
  const cleaned = removePromptNoise(initialPrompt).replace(
    /\s+\b(?:at|from|via|using)\s*$/i,
    "",
  );
  if (!cleaned) {
    return "Untitled conversation";
  }
  return limitTitle(cleaned) || "Untitled conversation";
}

export function sanitizeGeneratedChatTitle(output: string) {
  const candidate = [...output.split(/\r?\n/)]
    .reverse()
    .map((line) => removeTitleDecoration(line))
    .find(Boolean);
  if (!candidate) {
    return null;
  }

  const title = limitTitle(candidate);
  if (!title || title.split(/\s+/).length < 2) {
    return null;
  }
  if (GENERIC_TITLES.has(normalizedTitle(title))) {
    return null;
  }
  return title;
}
