import {
  ChevronDown,
  ChevronRight,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  UserPlus,
  X,
} from "lucide-react";
import { memo, type RefObject } from "react";
import { formatCodexPlanType } from "../../lib/codexAuth";
import type { CodexLoginState } from "../codex/types";
import type { CodexAccountProfile } from "./types";

export type AuthRowState = {
  title: string;
  subtitle: string;
  avatarLabel: string;
  tone: "default" | "waiting" | "failed" | "signed-in";
};

export type CodexAccountCardModel = {
  authRow: AuthRowState;
  signedIn: boolean;
  menuOpen: boolean;
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
  activeRunAccountIds: ReadonlySet<number>;
  runIsActive: boolean;
  loginState: CodexLoginState;
  showCancelLogin: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
};

export type CodexAccountCardActions = {
  setMenuOpen: (open: boolean) => void;
  selectAccount: (accountId: number) => void;
  addAccount: () => void;
  manageAccounts: () => void;
  refreshAccount: () => void;
  logout: () => void;
  login: () => void;
  cancelLogin: () => void;
};

export const CodexAccountCard = memo(function CodexAccountCard({
  model,
  actions,
}: {
  model: CodexAccountCardModel;
  actions: CodexAccountCardActions;
}) {
  const { authRow } = model;
  return (
    <div
      className={`codex-card account-card auth-${authRow.tone}`}
      data-tauri-drag-region="false"
      ref={model.containerRef}
    >
      {model.signedIn ? (
        <>
          <button
            className={`account-trigger secondary ${model.menuOpen ? "open" : ""}`}
            type="button"
            onClick={() => actions.setMenuOpen(!model.menuOpen)}
            aria-expanded={model.menuOpen}
            aria-controls="codex-account-menu"
            aria-label="Codex account"
          >
            <span className="account-avatar" aria-hidden="true">
              {authRow.avatarLabel}
            </span>
            <span className="account-copy">
              <strong>{authRow.title}</strong>
              <span>{authRow.subtitle}</span>
            </span>
            <ChevronDown className="account-chevron" size={18} />
          </button>
          {model.menuOpen ? (
            <div className="account-menu" id="codex-account-menu">
              {model.accounts.length > 1 ? (
                <div className="account-menu-section">
                  <div className="account-switcher-list" aria-label="Codex accounts">
                    {model.accounts
                      .filter((account) => account.id !== model.selectedAccountId)
                      .map((account) => {
                        const identity = (account.email ?? account.label).toLowerCase();
                        const duplicateIdentity =
                          model.accounts.filter(
                            (candidate) =>
                              (candidate.email ?? candidate.label).toLowerCase() ===
                              identity,
                          ).length > 1;
                        const details = [
                          account.email && account.email !== account.label
                            ? account.email
                            : null,
                          account.status === "signed_in"
                            ? account.plan_type
                              ? formatCodexPlanType(account.plan_type)
                              : "Signed in"
                            : "Signed out",
                          duplicateIdentity ? `Local profile ${account.id}` : null,
                        ].filter(Boolean);

                        return (
                          <button
                            className="account-switcher-item"
                            type="button"
                            key={account.id}
                            onClick={() => actions.selectAccount(account.id)}
                            disabled={model.runIsActive}
                          >
                            <span className="account-mini-avatar" aria-hidden="true">
                              {(account.email ?? account.label)
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            <span>
                              <strong>{account.label}</strong>
                              <small>{details.join(" · ")}</small>
                            </span>
                            <ChevronRight size={15} aria-hidden="true" />
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : null}
              {model.accounts.length > 1 ? (
                <div className="account-menu-separator" />
              ) : null}
              <div className="account-menu-group">
                <button
                  className="account-menu-action"
                  type="button"
                  onClick={actions.addAccount}
                  disabled={
                    model.loginState === "starting" ||
                    model.loginState === "waiting"
                  }
                >
                  <UserPlus size={16} />
                  Add account
                </button>
                <button
                  className="account-menu-action"
                  type="button"
                  onClick={actions.manageAccounts}
                >
                  <Settings size={16} />
                  Manage accounts
                </button>
              </div>
              <div className="account-menu-separator" />
              <div className="account-menu-group">
                <button
                  className="account-menu-action"
                  type="button"
                  onClick={actions.refreshAccount}
                  disabled={model.runIsActive}
                >
                  <RefreshCw size={16} />
                  Refresh account
                </button>
                <button
                  className="account-menu-action"
                  type="button"
                  onClick={actions.logout}
                  aria-label="Log out of Codex"
                  disabled={
                    model.selectedAccountId !== null &&
                    model.activeRunAccountIds.has(model.selectedAccountId)
                  }
                >
                  <LogOut size={16} />
                  Log out
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <button
          className="account-sign-in secondary"
          type="button"
          onClick={model.showCancelLogin ? actions.cancelLogin : actions.login}
          disabled={model.loginState === "starting"}
          aria-label={
            model.showCancelLogin ? "Cancel Codex sign-in" : "Sign in to Codex"
          }
        >
          <span className="account-copy">
            <strong>{authRow.title}</strong>
            <span>
              {model.showCancelLogin ? "Click to cancel" : authRow.subtitle}
            </span>
          </span>
          {model.showCancelLogin ? (
            <X className="account-action-icon" size={18} />
          ) : (
            <LogIn className="account-action-icon" size={18} />
          )}
        </button>
      )}
    </div>
  );
});
