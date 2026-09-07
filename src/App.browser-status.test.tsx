import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getMocks, prepareDefaults, prepareSignedInRun, renderApp,
  signedInAccount, signedInAccount2,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Browser status account routing", () => {
  beforeEach(() => {
    prepareDefaults();
    prepareSignedInRun();
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount, signedInAccount2]);
    mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => {
      const account = accountId === signedInAccount2.id ? signedInAccount2 : signedInAccount;
      return { account: { type: "chatgpt", email: account.email, planType: account.plan_type }, requiresOpenaiAuth: true };
    });
    const defaultRpc = mocks.codexDefaultProfileRpcMock.getMockImplementation();
    mocks.codexDefaultProfileRpcMock.mockImplementation(async (method, params) => {
      if (method !== "plugin/list") return defaultRpc?.(method, params);
      return {
        marketplaces: [{ name: "openai-bundled", path: null, plugins: [{
          id: "browser@openai-bundled", name: "browser", version: "26.901.51231",
          installed: true, enabled: true, installPolicy: "AVAILABLE", authPolicy: "ON_USE",
          availability: "AVAILABLE", interface: { displayName: "Browser" },
        }] }], marketplaceLoadErrors: [], featuredPluginIds: [],
      };
    });
  });

  it("checks the selected profile, switches accounts, and retries silently without starting a task", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(mocks.readBrowserRuntimeStatusMock).toHaveBeenCalledWith(`account:${signedInAccount.id}`, signedInAccount.id));
    await user.click(screen.getByRole("button", { name: `Select ${signedInAccount2.label}` }));
    await waitFor(() => expect(mocks.readBrowserRuntimeStatusMock).toHaveBeenLastCalledWith(`account:${signedInAccount2.id}`, signedInAccount2.id));
    const browser = screen.getByRole("region", { name: "Browser settings" });
    await waitFor(() => expect(within(browser).getByRole("button", { name: "Refresh Browser status" })).toBeEnabled());
    mocks.readBrowserRuntimeStatusMock.mockClear();
    await user.click(within(browser).getByRole("button", { name: "Refresh Browser status" }));
    await waitFor(() => expect(mocks.readBrowserRuntimeStatusMock).toHaveBeenCalledExactlyOnceWith(`account:${signedInAccount2.id}`, signedInAccount2.id));
    expect(mocks.codexRpcMock.mock.calls.some(([, method]) => method === "thread/start" || method === "turn/start")).toBe(false);
    expect(within(browser).queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/app-server connected|Default Codex profile connected/)).toBeNull();
  });
});
