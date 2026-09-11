import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAccountCard,
  type CodexAccountCardActions,
  type CodexAccountCardModel,
} from "./CodexAccountCard";
import { initialUpdateState } from "../updates/UpdateController";

function actions(): CodexAccountCardActions {
  return {
    setMenuOpen: vi.fn(),
    selectAccount: vi.fn(),
    addAccount: vi.fn(),
    manageAccounts: vi.fn(),
    refreshAccount: vi.fn(),
    reportBug: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    cancelLogin: vi.fn(),
  };
}

function model(
  overrides: Partial<CodexAccountCardModel> = {},
): CodexAccountCardModel {
  return {
    authRow: {
      title: "zac@example.com",
      subtitle: "Plus",
      avatarLabel: "Z",
      tone: "signed-in",
    },
    signedIn: true,
    menuOpen: false,
    accounts: [],
    selectedAccountId: 1,
    activeRunAccountIds: new Set(),
    runIsActive: false,
    loginState: "idle",
    showCancelLogin: false,
    containerRef: { current: null },
    ...overrides,
  };
}

describe("CodexAccountCard", () => {
  it("offers updates immediately above support when signed in", () => {
    const act = vi.fn();
    render(<CodexAccountCard model={model({ signedIn: true, menuOpen: true, update: { act, state: {
      ...initialUpdateState, phase: "available", version: "0.2.0-beta.2", checking: false, installing: false, message: null,
    } } })} actions={actions()} />);
    const button = screen.getByRole("button", { name: /Download update/ });
    expect(button.nextElementSibling).toBe(screen.getByRole("button", { name: "Report a bug" }));
    expect(button).toHaveClass("account-menu-action"); fireEvent.click(button); expect(act).toHaveBeenCalledOnce();
  });
  it.each([false, true])("shows only sign-in while signed out, including when menuOpen=%s", (menuOpen) => {
    render(<CodexAccountCard model={model({ signedIn: false, menuOpen, update: { act: vi.fn(), state: {
      ...initialUpdateState, phase: "available", version: "0.2.0-beta.2", checking: false, installing: false, message: null,
    } } })} actions={actions()} />);
    expect(screen.getAllByRole("button")).toEqual([screen.getByRole("button", { name: "Sign in to Codex" })]);
    expect(screen.queryByLabelText("Application menu")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("App update available")).not.toBeInTheDocument();
    expect(screen.queryByText("Report a bug")).not.toBeInTheDocument();
  });
  it("opens the account menu from the signed-in trigger", () => {
    const handlers = actions();
    render(<CodexAccountCard model={model()} actions={handlers} />);

    fireEvent.click(screen.getByRole("button", { name: "Codex account" }));
    expect(handlers.setMenuOpen).toHaveBeenCalledWith(true);
  });

  it("routes signed-out interaction to login or cancellation", () => {
    const loginActions = actions();
    const { rerender } = render(
      <CodexAccountCard
        model={model({ signedIn: false })}
        actions={loginActions}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in to Codex" }));
    expect(loginActions.login).toHaveBeenCalledOnce();

    rerender(
      <CodexAccountCard
        model={model({ signedIn: false, showCancelLogin: true })}
        actions={loginActions}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel Codex sign-in" }));
    expect(loginActions.cancelLogin).toHaveBeenCalledOnce();
  });

  it("routes the account-menu bug report action", () => {
    const handlers = actions();
    render(
      <CodexAccountCard
        model={model({ menuOpen: true })}
        actions={handlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
    expect(handlers.reportBug).toHaveBeenCalledOnce();
  });
});
