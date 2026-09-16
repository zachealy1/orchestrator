import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingMarkdown, StreamingText } from "./StreamingText";

const animations: Array<{
  element: Element;
  cancel: ReturnType<typeof vi.fn>;
}> = [];
const animate = vi.fn(function (this: Element) {
  const animation = { element: this, cancel: vi.fn() };
  animations.push(animation);
  return animation as unknown as Animation;
});

afterEach(() => {
  vi.restoreAllMocks();
  animations.length = 0;
  animate.mockClear();
});

function mockAnimations() {
  vi.spyOn(Element.prototype, "animate").mockImplementation(animate);
}
// jsdom does not implement the Web Animations API.
if (!Element.prototype.animate)
  Element.prototype.animate =
    (() => ({})) as unknown as typeof Element.prototype.animate;

describe("stream text reveal", () => {
  it("fades appended words while keeping previously rendered text settled", () => {
    mockAnimations();
    const view = render(<StreamingMarkdown text="Existing text. " active />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<StreamingMarkdown text="Existing text. New words" active />);
    expect(animations.map(({ element }) => element.textContent)).toEqual([
      "New ",
      "words",
    ]);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: "cubic-bezier(.37,.55,.86,.88)",
    });
    view.rerender(
      <StreamingMarkdown text="Existing text. New words arrive." active />,
    );
    expect(animations.map(({ element }) => element.textContent)).toEqual([
      "New ",
      "words ",
      "arrive.",
    ]);
    expect(view.container).toHaveTextContent(
      "Existing text. New words arrive.",
    );
  });

  it("does not replay fades when Markdown reparents existing words", () => {
    mockAnimations();
    const view = render(<StreamingMarkdown text="Intro " active />);
    view.rerender(<StreamingMarkdown text="Intro *new words" active />);
    animate.mockClear();
    view.rerender(<StreamingMarkdown text="Intro *new words*" active />);
    expect(animate).not.toHaveBeenCalled();
    expect(view.container.querySelector("em")).toHaveTextContent("new words");
  });

  it("cancels motion immediately on completion and shows history without animation", () => {
    mockAnimations();
    const view = render(<StreamingMarkdown text="First " active />);
    view.rerender(<StreamingMarkdown text="First second" active />);
    view.rerender(<StreamingMarkdown text="First second" active={false} />);
    expect(animations[0].cancel).toHaveBeenCalled();
    expect(view.container.querySelector("[data-stream-segment]")).toBeNull();
    view.unmount();
    render(<StreamingMarkdown text="First second" active={false} />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("honors reduced motion and visibility changes without replay on restore", () => {
    mockAnimations();
    const view = render(<StreamingText text="First " active />);
    view.rerender(<StreamingText text="First second " active />);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animations[0].cancel).toHaveBeenCalled();
    view.rerender(<StreamingText text="First second third " active />);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animate).toHaveBeenCalledTimes(1);
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    view.rerender(<StreamingText text="First second third fourth" active />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("preserves code, tables, links and Unicode while streaming", () => {
    mockAnimations();
    const view = render(<StreamingMarkdown text="" active />);
    const text =
      "**Hello 👋** [link](https://example.com)\n\n```sh\nprintf 'hello'\n```\n\n| A | B |\n| - | - |\n| one | two |";
    view.rerender(<StreamingMarkdown text={text} active />);
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(view.container.querySelector("strong")).toHaveTextContent(
      "Hello 👋",
    );
    expect(view.container.querySelector("pre code")?.textContent).toBe(
      "printf 'hello'\n",
    );
    expect(screen.getByRole("table")).toHaveTextContent("ABonetwo");
  });
});

it("keeps new-word animations running through StrictMode effect replay", () => {
  mockAnimations();
  vi.spyOn(performance, "now").mockReturnValue(0);
  const view = render(
    <StrictMode>
      <StreamingMarkdown text="First " active />
    </StrictMode>,
  );
  view.rerender(
    <StrictMode>
      <StreamingMarkdown text="First second" active />
    </StrictMode>,
  );
  expect(animations.length).toBeGreaterThan(0);
  expect(animations[animations.length - 1]?.cancel).not.toHaveBeenCalled();
});
