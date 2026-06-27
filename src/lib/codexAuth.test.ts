import { describe, expect, it } from "vitest";
import {
  formatCodexAuthMessage,
  formatLoginStartStatus,
  isCodexSignedIn,
  shouldBlockRunForAuth,
} from "./codexAuth";

describe("codexAuth", () => {
  it("formats signed-in ChatGPT account status", () => {
    expect(
      formatCodexAuthMessage({
        connected: true,
        account: {
          type: "chatgpt",
          email: "dev@example.com",
          planType: "pro",
        },
        requiresOpenaiAuth: true,
        loginState: "idle",
        loginUserCode: null,
        errorMessage: null,
      }),
    ).toBe("Signed in as dev@example.com (Pro)");
  });

  it("formats waiting device-code status", () => {
    expect(
      formatCodexAuthMessage({
        connected: true,
        account: null,
        requiresOpenaiAuth: true,
        loginState: "waiting",
        loginUserCode: "ABCD-1234",
        errorMessage: null,
      }),
    ).toBe("Enter code ABCD-1234 in the browser.");
  });

  it("formats failed login status", () => {
    expect(
      formatCodexAuthMessage({
        connected: true,
        account: null,
        requiresOpenaiAuth: true,
        loginState: "failed",
        loginUserCode: null,
        errorMessage: "oauth denied",
      }),
    ).toBe("Sign-in failed: oauth denied");
  });

  it("formats auth-not-required status", () => {
    expect(
      formatCodexAuthMessage({
        connected: true,
        account: null,
        requiresOpenaiAuth: false,
        loginState: "idle",
        loginUserCode: null,
        errorMessage: null,
      }),
    ).toBe("OpenAI auth not required");
  });

  it("formats login start responses", () => {
    expect(
      formatLoginStartStatus({
        type: "chatgpt",
        loginId: "login-1",
        authUrl: "https://example.com/auth",
      }),
    ).toBe("Waiting for browser sign-in.");

    expect(
      formatLoginStartStatus({
        type: "chatgptDeviceCode",
        loginId: "login-2",
        verificationUrl: "https://example.com/device",
        userCode: "CODE-123",
      }),
    ).toBe("Enter code CODE-123 in the browser.");
  });

  it("detects when sign-in is required before a run", () => {
    expect(isCodexSignedIn(null)).toBe(false);
    expect(shouldBlockRunForAuth(true, null)).toBe(true);
    expect(shouldBlockRunForAuth(false, null)).toBe(false);
    expect(
      shouldBlockRunForAuth(true, {
        type: "chatgpt",
        email: "dev@example.com",
        planType: "plus",
      }),
    ).toBe(false);
  });
});
