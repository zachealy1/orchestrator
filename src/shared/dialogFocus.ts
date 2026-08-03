import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function isAvailable(element: HTMLElement) {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    !element.closest("[hidden]")
  );
}

/** Keeps keyboard focus inside a modal surface while it is open. */
export function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;

  const dialog = event.currentTarget;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isAvailable);

  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (
    !event.shiftKey &&
    (activeElement === last || !dialog.contains(activeElement))
  ) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
}
