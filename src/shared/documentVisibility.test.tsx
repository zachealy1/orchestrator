import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDocumentVisible } from "./documentVisibility";

afterEach(() => vi.restoreAllMocks());

it("shares one listener, follows visibility rather than focus, and cleans up", () => {
  let visible = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const first = renderHook(useDocumentVisible);
  const second = renderHook(useDocumentVisible);
  expect(first.result.current).toBe(false);
  expect(add.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);
  act(() => { visible = true; document.dispatchEvent(new Event("visibilitychange")); });
  expect(first.result.current).toBe(true);
  expect(second.result.current).toBe(true);
  act(() => window.dispatchEvent(new Event("blur")));
  expect(first.result.current).toBe(true);
  first.unmount();
  expect(remove.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(0);
  second.unmount();
  expect(remove.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);
});
