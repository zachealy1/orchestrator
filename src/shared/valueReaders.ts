export function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function readNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
