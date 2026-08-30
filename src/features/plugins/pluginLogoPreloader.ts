import type { CodexPluginCatalog, CodexPluginSummary } from "./types";

const IMMEDIATE_LOGO_COUNT = 18;
const BACKGROUND_BATCH_SIZE = 8;

type PreloadImage = {
  decoding: "async" | "auto" | "sync";
  loading: "eager" | "lazy";
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decode?: () => Promise<void>;
};

type LogoPreloaderOptions = {
  createImage?: () => PreloadImage;
  schedule?: (callback: () => void) => void;
};

export function createPluginLogoPreloader(options: LogoPreloaderOptions = {}) {
  const requestedUrls = new Set<string>();
  const queuedUrls = new Set<string>();
  const backgroundQueue: string[] = [];
  const activeImages = new Map<string, PreloadImage>();
  let drainScheduled = false;

  const createImage = options.createImage ?? defaultImageFactory;
  const schedule = options.schedule ?? scheduleLogoPreload;

  function request(url: string) {
    if (requestedUrls.has(url)) return;
    const image = createImage();
    requestedUrls.add(url);
    queuedUrls.delete(url);
    activeImages.set(url, image);
    const release = () => activeImages.delete(url);
    image.onload = release;
    image.onerror = release;
    image.decoding = "async";
    image.loading = "eager";
    image.src = url;
    void image.decode?.().then(release, release);
  }

  function scheduleDrain() {
    if (drainScheduled || backgroundQueue.length === 0) return;
    drainScheduled = true;
    schedule(() => {
      drainScheduled = false;
      backgroundQueue.splice(0, BACKGROUND_BATCH_SIZE).forEach(request);
      scheduleDrain();
    });
  }

  return function preload(catalog: CodexPluginCatalog) {
    if (!canCreateImages(options.createImage)) return;
    const featuredIds = new Set(catalog.featuredPluginIds);
    const urls = [...catalog.plugins]
      .sort(
        (left, right) =>
          logoPriority(left, featuredIds) - logoPriority(right, featuredIds),
      )
      .map((plugin) => plugin.logoUrl)
      .filter((url): url is string => Boolean(url))
      .filter((url, index, all) => all.indexOf(url) === index)
      .filter((url) => !requestedUrls.has(url) && !queuedUrls.has(url));

    urls.slice(0, IMMEDIATE_LOGO_COUNT).forEach(request);
    for (const url of urls.slice(IMMEDIATE_LOGO_COUNT)) {
      queuedUrls.add(url);
      backgroundQueue.push(url);
    }
    scheduleDrain();
  };
}

export const preloadPluginLogos = createPluginLogoPreloader();

function logoPriority(
  plugin: CodexPluginSummary,
  featuredIds: ReadonlySet<string>,
) {
  if (plugin.installed) return 0;
  if (featuredIds.has(plugin.id)) return 1;
  return 2;
}

function canCreateImages(customFactory: LogoPreloaderOptions["createImage"]) {
  return Boolean(customFactory || typeof Image !== "undefined");
}

function defaultImageFactory(): PreloadImage {
  return new Image() as PreloadImage;
}

function scheduleLogoPreload(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1_000 });
    return;
  }
  setTimeout(callback, 16);
}
