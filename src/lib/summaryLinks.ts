export function isPreviewableSummaryLink(href: string) {
  const value = href.trim();
  if (!value || value.startsWith("#")) {
    return false;
  }

  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "file:" ||
      ((url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "::1"))
    );
  } catch {
    return !/^[a-z][a-z\d+.-]*:/i.test(value);
  }
}
