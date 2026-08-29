import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { listCodexPlugins } from "./api";

describe("Plugins startup recovery", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads Plugins when discovery starts before the shared profile connects", async () => {
    let pluginListAttempts = 0;
    invokeMock.mockImplementation(async (command, input) => {
      if (command === "codex_default_profile_connect") {
        return { pid: 42, alreadyConnected: false, initialize: {} };
      }
      if (
        command === "codex_default_profile_rpc" &&
        input?.method === "plugin/list"
      ) {
        pluginListAttempts += 1;
        if (pluginListAttempts === 1) {
          throw new Error("Codex account 0 is not connected");
        }
        return {
          marketplaces: [
            {
              name: "openai-bundled",
              path: null,
              plugins: [
                {
                  id: "browser@openai-bundled",
                  name: "browser",
                  displayName: "Browser",
                  installed: true,
                  enabled: true,
                  installPolicy: "INSTALLED_BY_DEFAULT",
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
          featuredPluginIds: ["browser@openai-bundled"],
        };
      }
      throw new Error(`Unexpected invocation: ${command}`);
    });

    await expect(listCodexPlugins()).resolves.toMatchObject({
      plugins: [
        {
          id: "browser@openai-bundled",
          displayName: "Browser",
          installed: true,
          enabled: true,
        },
      ],
    });
    expect(pluginListAttempts).toBe(2);
    expect(invokeMock).toHaveBeenCalledWith("codex_default_profile_connect");
  });
});
