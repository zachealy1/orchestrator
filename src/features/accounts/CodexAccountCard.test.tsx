import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAccountCard,
  type CodexAccountCardActions,
  type CodexAccountCardModel,
} from "./CodexAccountCard";

function actions(): CodexAccountCardActions {
  return {
    setMenuOpen: vi.fn(),
    selectAccount: vi.fn(),
    addAccount: vi.fn(),
    manageAccounts: vi.fn(),
    refreshAccount: vi.fn(),
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
});
