import { fireEvent, render, screen } from "@testing-library/react";
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
  it("moves keyboard focus without waiting for animation frames", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const { user, onChange } = renderSelect();
    const trigger = screen.getByRole("combobox", { name: "Agent" });
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Standard" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Advanced" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("advanced");
    expect(trigger).toHaveFocus();
  });
  it("closes the previous menu for accessibility and keyboard activation", () => {
    render(<>{["Access", "Agent"].map((label) => (
      <ComposerSelect key={label} ariaLabel={label} value="one"
        options={[{ value: "one", label: "One" }]} placeholder={label}
        icon={null} onChange={vi.fn()} />
    ))}</>);
    fireEvent.click(screen.getByRole("combobox", { name: "Access" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Agent" }));
    expect(screen.queryByRole("listbox", { name: "Access options" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Agent options" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Access" }), { key: "ArrowDown" });
    expect(screen.queryByRole("listbox", { name: "Agent options" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Access options" })).toBeInTheDocument();
  });
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

  it("invokes menu actions without changing the selected value", async () => {
    mockTriggerRect(100, 140);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAction = vi.fn();
    render(
      <ComposerSelect
        ariaLabel="Branch"
        value="main"
        options={[
          { value: "main", label: "main" },
          {
            id: "create-branch",
            value: "",
            label: "Create branch...",
            action: true,
          },
        ]}
        placeholder="No branch"
        icon={<span>B</span>}
        onChange={onChange}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Branch" }));
    const action = screen.getByRole("option", { name: "Create branch..." });
    expect(action).toHaveAttribute("aria-selected", "false");
    await user.click(action);

    expect(onAction).toHaveBeenCalledWith("create-branch");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveTextContent(
      "main",
    );
  });
});
