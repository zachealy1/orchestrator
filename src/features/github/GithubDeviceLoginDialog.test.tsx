import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GithubConnectionStatus } from "./api";
import { GithubDeviceLoginDialog } from "./GithubDeviceLoginDialog";

function connection(
  overrides: Partial<GithubConnectionStatus> = {},
): GithubConnectionStatus {
  return {
    available: true,
    connected: false,
    login: null,
    displayName: null,
    avatarUrl: null,
    status: "connecting",
    message: "Review the GitHub device code to continue.",
    cliVersion: "2.96.0",
    deviceCode: "ABCD-1234",
    verificationUri: "https://github.com/login/device",
    loginGeneration: 7,
    browserOpened: false,
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof GithubDeviceLoginDialog>> = {},
) {
  const props: React.ComponentProps<typeof GithubDeviceLoginDialog> = {
    connection: connection(),
    opening: false,
    copied: false,
    error: null,
    onCopyAndOpen: vi.fn(),
    onOpen: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  render(<GithubDeviceLoginDialog {...props} />);
  return props;
}

describe("GithubDeviceLoginDialog", () => {
  it("shows and focuses the code before offering either continuation path", async () => {
    renderDialog();

    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    const copy = screen.getByRole("button", {
      name: "Copy code and open GitHub",
    });
    await waitFor(() => expect(copy).toHaveFocus());
    expect(
      screen.getByRole("button", { name: "Continue to GitHub" }),
    ).toBeInTheDocument();
  });

  it("routes copying, acknowledgement, and cancellation independently", () => {
    const props = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy code and open GitHub" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to GitHub" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onCopyAndOpen).toHaveBeenCalledOnce();
    expect(props.onOpen).toHaveBeenCalledOnce();
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("keeps the same code available after GitHub has opened", () => {
    renderDialog({ connection: connection({ browserOpened: true }) });

    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open GitHub again" }),
    ).toBeInTheDocument();
  });

  it("shows preparation and retryable failure states without exposing actions early", () => {
    const props = renderDialog({
      connection: connection({
        deviceCode: null,
        verificationUri: null,
        loginGeneration: null,
      }),
      error: "GitHub CLI returned malformed device output.",
    });

    expect(screen.getByText("Preparing a secure device code...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open github/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry GitHub sign-in" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
});
