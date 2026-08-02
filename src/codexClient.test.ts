import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { readActiveCodexLogin, startCodexLogin } from "./codexClient";

describe("Codex account login client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("starts hosted browser OAuth with Codex branding", async () => {
    invokeMock.mockResolvedValue({
      type: "chatgpt",
      loginId: "login-1",
      authUrl: "https://chatgpt.com/auth",
    });

    await startCodexLogin(8);

    expect(invokeMock).toHaveBeenCalledWith("codex_rpc", {
      accountId: 8,
      method: "account/login/start",
      params: {
        type: "chatgpt",
        useHostedLoginSuccessPage: true,
        appBrand: "codex",
      },
    });
  });

  it("reads the recoverable native login attempt", async () => {
    invokeMock.mockResolvedValue(null);

    await readActiveCodexLogin();

    expect(invokeMock).toHaveBeenCalledWith("codex_active_login");
  });
});
