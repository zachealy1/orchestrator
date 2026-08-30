import type { CodexPluginCatalog, CodexPluginSummary } from "./types";
import {
  markPluginPerformance,
  registerPluginLogoSnapshot,
} from "./pluginPerformance";

const INITIAL_EXPLORE_LOGO_COUNT = 12;
const MAX_CONCURRENT_LOGO_LOADS = 4;
const MAX_RETAINED_LOGOS = 160;
const PLUGIN_LOGO_SIZE = 48;

type PreloadImage = {
  decoding: "async" | "auto" | "sync";
  height?: number;
  loading: "eager" | "lazy";
  src: string;
  width?: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decode?: () => Promise<void>;
};

type VisibilitySource = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener: (
    type: "visibilitychange",
    listener: () => void,
  ) => void;
  removeEventListener: (
    type: "visibilitychange",
    listener: () => void,
  ) => void;
};

type LogoPreloaderOptions = {
  createImage?: () => PreloadImage;
  schedule?: (callback: () => void) => void;
  visibilitySource?: VisibilitySource | null;
  maxConcurrent?: number;
  maxRetained?: number;
};

export type PluginLogoPreloaderSnapshot = {
  activeCount: number;
  queuedCount: number;
  retainedCount: number;
  requestedUrls: readonly string[];
  completedUrls: readonly string[];
};

export function createPluginLogoPreloader(options: LogoPreloaderOptions = {}) {
  const requestedUrls = new Set<string>();
  const completedUrls = new Set<string>();
  const queuedUrls = new Set<string>();
  const retainedCandidateUrls = new Set<string>();
  const priorityQueue: string[] = [];
  const backgroundQueue: string[] = [];
  const activeImages = new Map<string, PreloadImage>();
  // WKWebView otherwise evicts off-screen decodes and repeats them while scrolling.
  const retainedImages = new Map<string, PreloadImage>();
  const createImage = options.createImage ?? defaultImageFactory;
  const schedule = options.schedule ?? scheduleLogoPreload;
  const visibilitySource =
    options.visibilitySource === undefined
      ? defaultVisibilitySource()
      : options.visibilitySource;
  const maxConcurrent = Math.max(
    1,
    options.maxConcurrent ?? MAX_CONCURRENT_LOGO_LOADS,
  );
  const maxRetained = Math.max(1, options.maxRetained ?? MAX_RETAINED_LOGOS);
  let drainScheduled = false;
  let disposed = false;
  let lastReadyRequestCount = 0;

  function isVisible() {
    return visibilitySource?.visibilityState !== "hidden";
  }

  function complete(url: string, retain: boolean) {
    const image = activeImages.get(url);
    if (!image || !activeImages.delete(url)) return;
    image.onload = null;
    image.onerror = null;
    if (retain && retainedCandidateUrls.has(url)) {
      retainedImages.delete(url);
      retainedImages.set(url, image);
      while (retainedImages.size > maxRetained) {
        const oldestUrl = retainedImages.keys().next().value;
        if (!oldestUrl) break;
        retainedImages.delete(oldestUrl);
        retainedCandidateUrls.delete(oldestUrl);
        requestedUrls.delete(oldestUrl);
        completedUrls.delete(oldestUrl);
      }
      completedUrls.add(url);
    } else if (retain) {
      // A background prefetch warms the network cache but deliberately releases
      // its decoded surface. Allow a later visible page to request a fresh decode.
      requestedUrls.delete(url);
      completedUrls.delete(url);
    } else {
      completedUrls.add(url);
    }
    drain();
    if (
      activeImages.size === 0 &&
      queuedUrls.size === 0 &&
      requestedUrls.size > lastReadyRequestCount
    ) {
      lastReadyRequestCount = requestedUrls.size;
      markPluginPerformance("logos-ready", {
        count: completedUrls.size,
      });
    }
  }

  function request(url: string) {
    if (disposed || requestedUrls.has(url) || !isVisible()) return;
    const image = createImage();
    requestedUrls.add(url);
    queuedUrls.delete(url);
    activeImages.set(url, image);
    image.onerror = () => complete(url, false);
    image.onload = () => {
      const decode = image.decode?.();
      if (decode) {
        void decode.then(
          () => complete(url, true),
          () => complete(url, false),
        );
      } else {
        complete(url, true);
      }
    };
    image.decoding = "async";
    image.height = PLUGIN_LOGO_SIZE;
    image.loading = "eager";
    image.width = PLUGIN_LOGO_SIZE;
    image.src = url;
  }

  function fillFrom(queue: string[]) {
    while (activeImages.size < maxConcurrent && queue.length > 0) {
      const url = queue.shift();
      if (url) request(url);
    }
  }

  function scheduleBackgroundDrain() {
    if (
      disposed ||
      drainScheduled ||
      backgroundQueue.length === 0 ||
      activeImages.size >= maxConcurrent ||
      !isVisible()
    ) {
      return;
    }
    drainScheduled = true;
    schedule(() => {
      drainScheduled = false;
      if (disposed || !isVisible()) return;
      fillFrom(backgroundQueue);
    });
  }

  function drain() {
    if (disposed || !isVisible()) return;
    fillFrom(priorityQueue);
    scheduleBackgroundDrain();
  }

  function enqueuePlugins(
    plugins: readonly CodexPluginSummary[],
    priority: boolean,
    retain: boolean,
  ) {
    if (disposed || !canCreateImages(options.createImage)) return;
    const candidateUrls = uniquePlugins(plugins)
      .map((plugin) => plugin.logoUrl)
      .filter((url): url is string => Boolean(url))
      .filter((url, index, all) => all.indexOf(url) === index);
    if (retain) {
      candidateUrls.forEach((url) => retainedCandidateUrls.add(url));
    }
    if (priority) {
      for (const url of candidateUrls) {
        const backgroundIndex = backgroundQueue.indexOf(url);
        if (backgroundIndex < 0) continue;
        backgroundQueue.splice(backgroundIndex, 1);
        priorityQueue.push(url);
      }
    }
    const urls = candidateUrls
      .filter((url) => !requestedUrls.has(url) && !queuedUrls.has(url));
    for (const url of urls) {
      queuedUrls.add(url);
      (priority ? priorityQueue : backgroundQueue).push(url);
    }
    drain();
  }

  function preload(catalog: CodexPluginCatalog) {
    const featuredIds = new Set(catalog.featuredPluginIds);
    enqueuePlugins(
      [
        ...catalog.plugins.filter((plugin) => plugin.installed),
        ...catalog.plugins.filter((plugin) => featuredIds.has(plugin.id)),
        ...catalog.plugins.slice(0, INITIAL_EXPLORE_LOGO_COUNT),
      ],
      true,
      true,
    );
  }

  function preloadPlugins(
    plugins: readonly CodexPluginSummary[],
    options: { priority?: boolean; retain?: boolean } = {},
  ) {
    enqueuePlugins(
      plugins,
      options.priority ?? true,
      options.retain ?? true,
    );
  }

  function getSnapshot(): PluginLogoPreloaderSnapshot {
    return {
      activeCount: activeImages.size,
      queuedCount: queuedUrls.size,
      retainedCount: retainedImages.size,
      requestedUrls: [...requestedUrls],
      completedUrls: [...completedUrls],
    };
  }

  function handleVisibilityChange() {
    if (isVisible()) drain();
  }

  function dispose() {
    disposed = true;
    priorityQueue.length = 0;
    backgroundQueue.length = 0;
    queuedUrls.clear();
    retainedCandidateUrls.clear();
    activeImages.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    activeImages.clear();
    retainedImages.clear();
    visibilitySource?.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  }

  visibilitySource?.addEventListener("visibilitychange", handleVisibilityChange);

  return { preload, preloadPlugins, getSnapshot, dispose };
}

export const pluginLogoPreloader = createPluginLogoPreloader();
registerPluginLogoSnapshot(() => pluginLogoPreloader.getSnapshot());

function uniquePlugins(plugins: readonly CodexPluginSummary[]) {
  const seen = new Set<string>();
  return plugins.filter((plugin) => {
    if (seen.has(plugin.id)) return false;
    seen.add(plugin.id);
    return true;
  });
}

function canCreateImages(customFactory: LogoPreloaderOptions["createImage"]) {
  return Boolean(customFactory || typeof Image !== "undefined");
}

function defaultImageFactory(): PreloadImage {
  return new Image() as PreloadImage;
}

function defaultVisibilitySource(): VisibilitySource | null {
  return typeof document === "undefined" ? null : document;
}

function scheduleLogoPreload(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1_000 });
    return;
  }
  setTimeout(callback, 16);
}
