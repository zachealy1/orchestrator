import { type ReactNode, useLayoutEffect, useRef } from "react";

export type KanbanComposerOverlayProps = {
  children: ReactNode;
};

export function KanbanComposerOverlay({
  children,
}: KanbanComposerOverlayProps) {
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const mount = shell?.parentElement;
    if (!shell || !mount) return;

    let animationFrame: number | null = null;
    const updateClearance = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const height = Math.ceil(shell.getBoundingClientRect().height);
        mount.style.setProperty("--kanban-composer-clearance", `${height}px`);
      });
    };

    updateClearance();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateClearance);
    resizeObserver?.observe(shell);
    window.addEventListener("resize", updateClearance);

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateClearance);
      mount.style.removeProperty("--kanban-composer-clearance");
    };
  }, []);

  return (
    <div ref={shellRef} className="kanban-composer-shell">
      {children}
    </div>
  );
}
