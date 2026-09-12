import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitlabSettingsPanel } from "./GitlabSettingsPanel";
const api = vi.hoisted(() => ({
  loadGitlabConnections: vi.fn(),
  connectGitlab: vi.fn(),
  cancelGitlabConnection: vi.fn(),
  disconnectGitlab: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
const connection = (
  host = "gitlab.com",
  connected = false,
  status = "disconnected",
) => ({
  host,
  connected,
  available: true,
  login: connected ? "dev" : null,
  displayName: null,
  avatarUrl: null,
  status,
  message: null,
  cliVersion: "1.117.0",
});
beforeEach(() => {
  vi.clearAllMocks();
  api.loadGitlabConnections.mockResolvedValue([connection()]);
  api.connectGitlab.mockResolvedValue(undefined);
  api.cancelGitlabConnection.mockResolvedValue(undefined);
  api.disconnectGitlab.mockResolvedValue(undefined);
});
describe("GitLab Settings", () => {
  it("uses browser sign-in for GitLab.com", async () => {
    render(<GitlabSettingsPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with browser" }),
    );
    await waitFor(() =>
      expect(api.connectGitlab).toHaveBeenCalledWith("gitlab.com", null),
    );
  });
  it("connects a self-managed host with a masked token and clears the input", async () => {
    render(<GitlabSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add GitLab host" }));
    fireEvent.change(screen.getByLabelText("GitLab host"), {
      target: { value: "code.example:8443" },
    });
    expect(
      screen.queryByRole("button", { name: "Sign in with browser" }),
    ).not.toBeInTheDocument();
    const input = screen.getByLabelText("GitLab personal access token");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "synthetic-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect with token" }));
    await waitFor(() =>
      expect(api.connectGitlab).toHaveBeenCalledWith(
        "code.example:8443",
        "synthetic-token",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText("GitLab personal access token"),
      ).not.toBeInTheDocument(),
    );
  });
  it("disconnects only the chosen host and cancels another host independently", async () => {
    api.loadGitlabConnections.mockResolvedValue([
      connection("gitlab.com", true, "connected"),
      connection("code.example", false, "connecting"),
    ]);
    render(<GitlabSettingsPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Disconnect gitlab.com" }),
    );
    await waitFor(() =>
      expect(api.disconnectGitlab).toHaveBeenCalledWith("gitlab.com"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(api.cancelGitlabConnection).toHaveBeenCalledWith("code.example"),
    );
  });
  it("shows connection errors without retaining a token for retries", async () => {
    api.connectGitlab.mockRejectedValue(new Error("Token rejected"));
    render(<GitlabSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add GitLab host" }));
    fireEvent.change(screen.getByLabelText("GitLab personal access token"), {
      target: { value: "synthetic-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect with token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Token rejected",
    );
    expect(screen.getByLabelText("GitLab personal access token")).toHaveValue(
      "",
    );
  });
});
