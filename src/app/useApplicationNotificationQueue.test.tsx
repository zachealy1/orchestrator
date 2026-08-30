import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FloatingStatusNotice } from "../components/FloatingHeaderStatusBubble";
import { useApplicationNotificationQueue } from "./useApplicationNotificationQueue";

function notice(
  id: string,
  revisionKey: string,
  title = revisionKey,
): FloatingStatusNotice {
  return {
    id,
    revisionKey,
    tone: "success",
    title,
    timeoutMs: 60_000,
    dismissible: true,
  };
}

describe("useApplicationNotificationQueue", () => {
  it("deduplicates unchanged revisions and replaces changed revisions in order", () => {
    const { result } = renderHook(() => useApplicationNotificationQueue());

    act(() => {
      result.current.publish(notice("settings", "1"));
      result.current.publish(notice("kanban", "1"));
    });
    const firstNotices = result.current.notices;

    act(() => result.current.publish(notice("settings", "1")));
    expect(result.current.notices).toBe(firstNotices);

    act(() => result.current.publish(notice("settings", "2")));
    expect(result.current.notices.map(({ id }) => id)).toEqual([
      "kanban",
      "settings",
    ]);
    expect(
      result.current.notices[result.current.notices.length - 1]?.revisionKey,
    ).toBe("2");
  });

  it("does not republish a dismissed revision but accepts a new revision", () => {
    const { result } = renderHook(() => useApplicationNotificationQueue());

    act(() => result.current.publish(notice("settings", "1")));
    act(() => result.current.dismiss("settings"));
    expect(result.current.notices).toEqual([]);

    act(() => result.current.publish(notice("settings", "1")));
    expect(result.current.notices).toEqual([]);

    act(() => result.current.publish(notice("settings", "2")));
    expect(result.current.notices).toEqual([notice("settings", "2")]);
  });
});
