import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLOATING_STATUS_NOTICE_TIMEOUT_MS,
  FloatingHeaderStatusBubble,
  type FloatingStatusNotice,
} from "./FloatingHeaderStatusBubble";

const persistentApproval: FloatingStatusNotice = {
  id: "approval",
  revisionKey: "approval:1",
  tone: "approval",
  title: "Approval needed",
  detail: "Another chat is waiting for your approval",
  actionLabel: "Open chat awaiting approval",
  timeoutMs: null,
};

const transientWarning: FloatingStatusNotice = {
  id: "warning",
  revisionKey: "warning:1",
  tone: "warning",
  title: "Goal update failed",
  detail: "Could not pause the goal.",
  timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
  dismissible: true,
};

describe("FloatingHeaderStatusBubble", () => {
  let anchorElement: HTMLDivElement;

  beforeEach(() => {
    anchorElement = document.createElement("div");
    anchorElement.className = "task-hero";
    document.body.append(anchorElement);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    anchorElement.remove();
  });

  it("portals stacked notices into the task viewport and preserves actions", () => {
    const onActivate = vi.fn();
    render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
        onActivate={onActivate}
      />,
    );

    const bubble = within(anchorElement).getByRole("complementary", {
      name: "Workspace status",
    });
    const action = within(bubble).getByRole("button", {
      name: "Open chat awaiting approval",
    });

    expect(bubble).toHaveClass("floating-header-status-bubble");
    expect(Array.from(bubble.children)).toHaveLength(2);
    expect(within(bubble).getByText("Goal update failed")).toBeInTheDocument();
    expect(
      within(
        within(bubble).getByText("Goal update failed").closest(
          ".composer-status-notice",
        )!,
      ).queryByRole("button"),
    ).not.toBeInTheDocument();

    fireEvent.click(action);
    expect(onActivate).toHaveBeenCalledWith("approval");
  });

  it("supports a surface-specific accessible banner label", () => {
    render(
      <FloatingHeaderStatusBubble
        notices={[transientWarning]}
        anchorElement={anchorElement}
        active
        ariaLabel="Browser data notification"
      />,
    );

    expect(
      within(anchorElement).getByRole("complementary", {
        name: "Browser data notification",
      }),
    ).toBeInTheDocument();
    expect(
      within(anchorElement).getByRole("alert", {
        name: "Goal update failed",
      }),
    ).toBeInTheDocument();
  });

  it("dismisses transient notices after 60 visible seconds but keeps approvals", () => {
    vi.useFakeTimers();
    render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
      />,
    );

    act(() => {
      vi.advanceTimersByTime(FLOATING_STATUS_NOTICE_TIMEOUT_MS - 1);
    });
    expect(screen.getByText("Goal update failed")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Goal update failed")).not.toBeInTheDocument();
    expect(screen.getByText("Approval needed")).toBeInTheDocument();
  });

  it("dismisses one notice immediately without affecting the remaining stack", () => {
    const onDismiss = vi.fn();
    render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss Goal update failed" }),
    );

    expect(screen.queryByText("Goal update failed")).not.toBeInTheDocument();
    expect(screen.getByText("Approval needed")).toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledWith("warning");
    expect(
      screen.queryByRole("button", { name: "Dismiss Approval needed" }),
    ).not.toBeInTheDocument();
  });

  it("pauses transient notice time while hovered or keyboard-focused", () => {
    vi.useFakeTimers();
    const actionableWarning = {
      ...transientWarning,
      actionLabel: "Retry goal update",
    };
    render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, actionableWarning]}
        anchorElement={anchorElement}
        active
        onActivate={() => undefined}
      />,
    );

    const warningRow = screen
      .getByText("Goal update failed")
      .closest(".composer-status-notice")!;
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    fireEvent.mouseEnter(warningRow);
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(screen.getByText("Goal update failed")).toBeInTheDocument();

    fireEvent.mouseLeave(warningRow);
    const retryButton = screen.getByRole("button", {
      name: "Retry goal update",
    });
    fireEvent.focus(retryButton);
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(screen.getByText("Goal update failed")).toBeInTheDocument();

    fireEvent.blur(retryButton);
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(screen.queryByText("Goal update failed")).not.toBeInTheDocument();
  });

  it("pauses timeout while the task view or document is hidden", () => {
    vi.useFakeTimers();
    const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    const { rerender } = render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
      />,
    );

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    rerender(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active={false}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    rerender(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
      />,
    );
    expect(screen.getByText("Goal update failed")).toBeInTheDocument();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    fireEvent(document, new Event("visibilitychange"));
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(screen.getByText("Goal update failed")).toBeInTheDocument();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(screen.queryByText("Goal update failed")).not.toBeInTheDocument();

    if (visibilityStateDescriptor) {
      Object.defineProperty(
        document,
        "visibilityState",
        visibilityStateDescriptor,
      );
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("restarts a transient timeout when its revision changes", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <FloatingHeaderStatusBubble
        notices={[persistentApproval, transientWarning]}
        anchorElement={anchorElement}
        active
      />,
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    rerender(
      <FloatingHeaderStatusBubble
        notices={[
          persistentApproval,
          {
            ...transientWarning,
            revisionKey: "warning:2",
            detail: "Could not resume the goal.",
          },
        ]}
        anchorElement={anchorElement}
        active
      />,
    );
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("Could not resume the goal.")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(
      screen.queryByText("Could not resume the goal."),
    ).not.toBeInTheDocument();
  });

  it("continues a transient timeout across application-screen rerenders", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <FloatingHeaderStatusBubble
        notices={[transientWarning]}
        anchorElement={anchorElement}
        active
        ariaLabel="Application notifications"
      />,
    );

    act(() => vi.advanceTimersByTime(20_000));
    rerender(
      <FloatingHeaderStatusBubble
        notices={[transientWarning]}
        anchorElement={anchorElement}
        active
        ariaLabel="Application notifications"
      />,
    );
    act(() => vi.advanceTimersByTime(40_001));

    expect(
      screen.queryByRole("alert", { name: "Goal update failed" }),
    ).not.toBeInTheDocument();
  });
});
