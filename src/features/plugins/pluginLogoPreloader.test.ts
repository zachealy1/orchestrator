import { describe, expect, it, vi } from "vitest";
import type { CodexPluginCatalog, CodexPluginSummary } from "./types";
import { createPluginLogoPreloader } from "./pluginLogoPreloader";

function plugin(index: number, installed = false): CodexPluginSummary {
  return {
    id: `plugin-${index}`,
    name: `plugin-${index}`,
    displayName: `Plugin ${index}`,
    description: null,
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: null,
    installed,
    enabled: installed,
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    mustShowInstallationInterstitial: false,
    available: true,
    unavailableReason: null,
    keywords: [],
    capabilities: [],
    logoUrl: `https://example.com/plugin-${index}.png`,
    readiness: { skills: 0, apps: 0, mcpServers: 0, hooks: 0 },
  };
}

function catalog(plugins: CodexPluginSummary[]): CodexPluginCatalog {
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins }],
    plugins,
    featuredPluginIds: ["plugin-20"],
    errors: [],
    refreshedAt: "now",
  };
}

type TestImage = {
  decoding: "async" | "auto" | "sync";
  loading: "eager" | "lazy";
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

describe("plugin logo preloader", () => {
  it("preloads only startup-priority logos with at most four active", () => {
    const requested: string[] = [];
    const images: TestImage[] = [];
    const scheduled: Array<() => void> = [];
    const preloader = createPluginLogoPreloader({
      createImage: () => {
        let source = "";
        const image: TestImage = {
          decoding: "auto",
          loading: "lazy",
          get src() {
            return source;
          },
          set src(value: string) {
            source = value;
            requested.push(value);
          },
          onload: null,
          onerror: null,
        };
        images.push(image);
        return image;
      },
      schedule: (callback) => scheduled.push(callback),
      visibilitySource: null,
    });
    const plugins = Array.from({ length: 30 }, (_, index) =>
      plugin(index, index === 25),
    );

    preloader.preload(catalog(plugins));
    expect(requested).toHaveLength(4);
    expect(requested[0]).toContain("plugin-25.png");
    expect(requested[1]).toContain("plugin-20.png");
    expect(images[0]).toMatchObject({
      decoding: "async",
      height: 48,
      loading: "eager",
      width: 48,
    });
    expect(preloader.getSnapshot().activeCount).toBe(4);

    let completedImageIndex = 0;
    while (preloader.getSnapshot().completedUrls.length < 14) {
      expect(preloader.getSnapshot().activeCount).toBeLessThanOrEqual(4);
      const completedImage = images[completedImageIndex];
      completedImage?.onload?.();
      expect(completedImage).toMatchObject({ onerror: null, onload: null });
      completedImageIndex += 1;
      while (scheduled.length > 0) scheduled.shift()?.();
    }

    expect(requested).toHaveLength(14);
    expect(new Set(requested)).toHaveLength(14);
    expect(preloader.getSnapshot()).toMatchObject({
      activeCount: 0,
      queuedCount: 0,
      retainedCount: 14,
    });
    preloader.dispose();
  });

  it("loads visible pages before adjacent pages and bounds retained decodes", () => {
    const requested: string[] = [];
    const images: TestImage[] = [];
    const scheduled: Array<() => void> = [];
    const preloader = createPluginLogoPreloader({
      createImage: () => {
        let source = "";
        const image: TestImage = {
          decoding: "auto",
          loading: "lazy",
          get src() {
            return source;
          },
          set src(value: string) {
            source = value;
            requested.push(value);
          },
          onload: null,
          onerror: null,
        };
        images.push(image);
        return image;
      },
      schedule: (callback) => scheduled.push(callback),
      visibilitySource: null,
      maxConcurrent: 2,
      maxRetained: 3,
    });
    const plugins = Array.from({ length: 6 }, (_, index) => plugin(index));

    preloader.preloadPlugins(plugins.slice(0, 4));
    preloader.preloadPlugins(plugins.slice(4).reverse(), {
      priority: false,
      retain: false,
    });
    preloader.preloadPlugins([plugins[4]], { priority: true });
    expect(requested).toEqual([
      "https://example.com/plugin-0.png",
      "https://example.com/plugin-1.png",
    ]);

    for (let index = 0; index < plugins.length; index += 1) {
      images[index]?.onload?.();
      while (scheduled.length > 0) scheduled.shift()?.();
    }

    expect(requested).toHaveLength(6);
    expect(requested[4]).toContain("plugin-4.png");
    expect(requested[5]).toContain("plugin-5.png");
    expect(preloader.getSnapshot()).toMatchObject({
      activeCount: 0,
      queuedCount: 0,
      retainedCount: 3,
    });
    preloader.dispose();
  });

  it("deduplicates refreshes and holds a concurrency slot through decode", async () => {
    const requested: string[] = [];
    const decoders: Array<ReturnType<typeof vi.fn>> = [];
    const resolveDecoders: Array<() => void> = [];
    const images: TestImage[] = [];
    const preloader = createPluginLogoPreloader({
      createImage: () => {
        let source = "";
        const decode = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveDecoders.push(resolve);
            }),
        );
        decoders.push(decode);
        const image: TestImage & { decode: () => Promise<void> } = {
          decoding: "auto",
          loading: "lazy",
          get src() {
            return source;
          },
          set src(value: string) {
            source = value;
            requested.push(value);
          },
          onload: null,
          onerror: null,
          decode,
        };
        images.push(image);
        return image;
      },
      schedule: (callback) => callback(),
      visibilitySource: null,
      maxConcurrent: 1,
    });
    const plugins = [plugin(1, true), plugin(2)];

    preloader.preload(catalog(plugins));
    preloader.preload(catalog(plugins.map((entry) => ({ ...entry }))));
    expect(requested).toHaveLength(1);

    images[0].onload?.();
    expect(decoders[0]).toHaveBeenCalledOnce();
    expect(requested).toHaveLength(1);
    resolveDecoders[0]?.();
    await Promise.resolve();
    expect(requested).toHaveLength(2);
    preloader.dispose();
  });

  it("does not begin queued work while the document is hidden", () => {
    const requested: string[] = [];
    const listeners = new Set<() => void>();
    let visibilityState: DocumentVisibilityState = "hidden";
    const visibilitySource = {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (_type: "visibilitychange", listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: "visibilitychange", listener: () => void) =>
        listeners.delete(listener),
    };
    const preloader = createPluginLogoPreloader({
      createImage: () => ({
        decoding: "auto",
        loading: "lazy",
        set src(value: string) {
          requested.push(value);
        },
        get src() {
          return "";
        },
        onload: null,
        onerror: null,
      }),
      schedule: (callback) => callback(),
      visibilitySource,
    });

    preloader.preload(catalog([plugin(1), plugin(2)]));
    expect(requested).toHaveLength(0);
    expect(preloader.getSnapshot().queuedCount).toBe(2);

    visibilityState = "visible";
    listeners.forEach((listener) => listener());
    expect(requested).toHaveLength(2);
    preloader.dispose();
    expect(listeners).toHaveLength(0);
  });
});
