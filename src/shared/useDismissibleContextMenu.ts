import { useEffect, type RefObject } from "react";

export function useDismissibleContextMenu(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  dismiss: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const menu = menuRef.current;
      if (event.target instanceof Node) {
        if (menu?.contains(event.target) || triggerRef?.current?.contains(event.target)) {
          return;
        }
      }
      dismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (triggerRef) event.preventDefault();
      dismiss();
      if (triggerRef) {
        window.requestAnimationFrame(() =>
          triggerRef.current?.focus({ preventScroll: true }),
        );
      }
    }

    function handleScroll(event: Event) {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      dismiss();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [dismiss, menuRef, open, triggerRef]);
}
