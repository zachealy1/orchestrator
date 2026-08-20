import {
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { GithubConnectionStatus } from "./api";

type GithubDeviceLoginDialogProps = {
  connection: GithubConnectionStatus | null;
  opening: boolean;
  copied: boolean;
  error: string | null;
  onCopyAndOpen: () => void;
  onOpen: () => void;
  onCancel: () => void;
  onRetry: () => void;
};

export const GithubDeviceLoginDialog = memo(function GithubDeviceLoginDialog({
  connection,
  opening,
  copied,
  error,
  onCopyAndOpen,
  onOpen,
  onCancel,
  onRetry,
}: GithubDeviceLoginDialogProps) {
  const copyActionRef = useRef<HTMLButtonElement | null>(null);
  const codeReady = Boolean(
    connection?.deviceCode &&
      connection.verificationUri &&
      connection.loginGeneration != null,
  );
  const browserOpened = connection?.browserOpened === true;
  const announcement = useMemo(() => {
    if (error) return error;
    if (!codeReady) return "Preparing a GitHub device code.";
    if (opening) return "Opening GitHub.";
    if (copied) {
      return "GitHub device code copied. Complete authorization in your browser.";
    }
    if (browserOpened) {
      return "GitHub is open. Complete authorization in your browser.";
    }
    return "Your GitHub device code is ready.";
  }, [browserOpened, codeReady, copied, error, opening]);

  useEffect(() => {
    if (!codeReady || browserOpened || opening) return;
    const frame = window.requestAnimationFrame(() => {
      copyActionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [browserOpened, codeReady, opening]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirmation-dialog github-device-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-device-login-title"
        aria-describedby="github-device-login-description"
      >
        <div>
          <h2 id="github-device-login-title">Connect GitHub</h2>
          <p id="github-device-login-description">
            {browserOpened
              ? "Enter this code in GitHub to authorize Orchestrator. Keep this window open while sign-in completes."
              : "Review the device code before opening GitHub. Copy it or continue without copying."}
          </p>
        </div>

        {codeReady ? (
          <code
            className="github-device-login-code"
            aria-label={`GitHub device code ${connection?.deviceCode ?? ""}`}
            tabIndex={0}
          >
            {connection?.deviceCode}
          </code>
        ) : (
          <div className="github-device-login-preparing" role="status">
            <Loader2 className="spin" size={18} aria-hidden="true" />
            <span>Preparing a secure device code...</span>
          </div>
        )}

        {error ? (
          <p className="confirmation-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label="Cancel GitHub sign-in"
            data-tooltip="Cancel GitHub sign-in"
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          {error && !codeReady ? (
            <button
              className="native-plan-icon-action"
              type="button"
              aria-label="Retry GitHub sign-in"
              data-tooltip="Retry GitHub sign-in"
              disabled={opening}
              onClick={onRetry}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          ) : null}
          {codeReady ? (
            <>
              <button
                ref={copyActionRef}
                className="native-plan-icon-action implement"
                type="button"
                aria-label="Copy code and open GitHub"
                data-tooltip="Copy code and open GitHub"
                disabled={opening}
                onClick={onCopyAndOpen}
              >
                {opening ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <Copy size={15} aria-hidden="true" />
                )}
              </button>
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label={
                  browserOpened ? "Open GitHub again" : "Continue to GitHub"
                }
                data-tooltip={
                  browserOpened ? "Open GitHub again" : "Continue to GitHub"
                }
                disabled={opening}
                onClick={onOpen}
              >
                <ExternalLink size={15} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
});
