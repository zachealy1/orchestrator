import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerSelect } from "./ComposerSelect";

const originalInnerHeight = window.innerHeight;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
});

function mockTriggerRect(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: top,
    top,
    bottom,
    left: 100,
    right: 300,
    width: 200,
    height: bottom - top,
    toJSON: () => ({}),
  });
}

function renderSelect(onChange = vi.fn()) {
  const user = userEvent.setup();
  render(
    <ComposerSelect
      ariaLabel="Agent"
      value="standard"
      options={[
        { value: "standard", label: "Standard" },
        { value: "advanced", label: "Advanced" },
      ]}
      placeholder="Select agent"
      icon={<span>A</span>}
      onChange={onChange}
    />,
  );
  return { user, onChange };
}

describe("ComposerSelect", () => {
  it("renders its menu below when there is enough space", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    mockTriggerRect(100, 140);
    const { user } = renderSelect();

    await user.click(screen.getByRole("combobox", { name: "Agent" }));

    expect(screen.getByRole("listbox", { name: "Agent options" })).toHaveAttribute(
      "data-placement",
      "below",
    );
  });

  it("renders its menu above when the trigger is near the viewport bottom", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    mockTriggerRect(650, 690);
    const { user } = renderSelect();

    await user.click(screen.getByRole("combobox", { name: "Agent" }));

    expect(screen.getByRole("listbox", { name: "Agent options" })).toHaveAttribute(
      "data-placement",
      "above",
    );
  });

  it("selects options and supports keyboard dismissal", async () => {
    mockTriggerRect(100, 140);
    const { user, onChange } = renderSelect();
    const trigger = screen.getByRole("combobox", { name: "Agent" });

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Advanced" }));
    expect(onChange).toHaveBeenCalledWith("advanced");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
