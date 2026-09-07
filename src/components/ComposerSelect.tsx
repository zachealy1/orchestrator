import { Check, ChevronDown } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ComposerSelectOption = {
  id?: string;
  value: string;
  label: string;
  disabled?: boolean;
  action?: boolean;
  icon?: ReactNode;
};

type Props = {
  ariaLabel: string;
  value: string;
  options: ComposerSelectOption[];
  placeholder: string;
  icon: ReactNode;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  onChange: (value: string) => void;
  onAction?: (actionId: string) => void;
};

type Placement = "above" | "below";
const SELECT_OPEN_EVENT = "orchestrator:composer-select-open";

export function ComposerSelect({
  ariaLabel,
  value,
  options,
  placeholder,
  icon,
  disabled = false,
  className = "",
  menuClassName = "",
  onChange,
  onAction,
}: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>("below");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const selectedOption = options.find(
    (option) => !option.action && option.value === value,
  );
  const enabledOptions = options.filter((option) => !option.disabled);
  const optionId = (option: ComposerSelectOption) =>
    option.id ?? option.value;

  useEffect(() => {
    const closeOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) setOpen(false);
    };
    document.addEventListener(SELECT_OPEN_EVENT, closeOtherMenu);
    return () => document.removeEventListener(SELECT_OPEN_EVENT, closeOtherMenu);
  }, [menuId]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 10;
      const menuGap = 6;
      const desiredHeight = Math.min(options.length * 38 + 10, 240);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const nextPlacement: Placement =
        spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? "below" : "above";
      const availableHeight = Math.max(
        80,
        Math.min(
          240,
          (nextPlacement === "below" ? spaceBelow : spaceAbove) - menuGap,
        ),
      );

      setPlacement(nextPlacement);
      setMenuStyle(
        nextPlacement === "below"
          ? {
              top: rect.bottom + menuGap,
              left: rect.left,
              width: rect.width,
              maxHeight: availableHeight,
            }
          : {
              bottom: window.innerHeight - rect.top + menuGap,
              left: rect.left,
              width: rect.width,
              maxHeight: availableHeight,
            },
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !focusedOptionId) {
      return;
    }

    // The option exists after commit; keyboard navigation must not wait for a
    // compositor frame (WKWebView can suspend those while the window is hidden).
    optionRefs.current.get(focusedOptionId)?.focus({ preventScroll: true });
  }, [focusedOptionId, open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  function openMenu(focusLast = false) {
    if (disabled || enabledOptions.length === 0) {
      return;
    }

    // Keyboard and accessibility activation do not necessarily emit pointerdown.
    document.dispatchEvent(new CustomEvent(SELECT_OPEN_EVENT, { detail: menuId }));
    const selectedEnabled = enabledOptions.find((option) => option.value === value);
    const fallbackOption = focusLast
      ? enabledOptions[enabledOptions.length - 1]
      : enabledOptions[0];
    setFocusedOptionId(
      (selectedEnabled ? optionId(selectedEnabled) : null) ??
        (fallbackOption ? optionId(fallbackOption) : null) ??
        null,
    );
    setOpen(true);
  }

  function selectOption(option: ComposerSelectOption) {
    if (option.disabled) {
      return;
    }
    if (option.action) {
      onAction?.(optionId(option));
    } else {
      onChange(option.value);
    }
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp");
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: ComposerSelectOption,
  ) {
    const index = enabledOptions.findIndex(
      (candidate) => candidate.value === option.value,
    );

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % enabledOptions.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (index - 1 + enabledOptions.length) % enabledOptions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledOptions.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextOption = enabledOptions[nextIndex];
      setFocusedOptionId(nextOption ? optionId(nextOption) : null);
    }
  }

  return (
    <div
      className={`composer-select ${className} ${disabled ? "disabled" : ""} ${
        open ? "open" : ""
      }`}
      ref={rootRef}
    >
      <span className="composer-select-icon" aria-hidden="true">
        {icon}
      </span>
      <button
        className="composer-select-trigger"
        type="button"
        ref={triggerRef}
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
      </button>
      <ChevronDown className="select-chevron" size={16} aria-hidden="true" />

      {open
        ? createPortal(
            <div
              className={`composer-select-menu ${menuClassName} ${placement}`}
              id={menuId}
              role="listbox"
              aria-label={`${ariaLabel} options`}
              data-placement={placement}
              ref={menuRef}
              style={menuStyle}
            >
              {options.map((option) => (
                <button
                  className={`composer-select-option ${
                    option.action ? "action" : ""
                  }`}
                  type="button"
                  role="option"
                  aria-selected={!option.action && option.value === value}
                  disabled={option.disabled}
                  key={optionId(option)}
                  ref={(element) => {
                    const id = optionId(option);
                    if (element) {
                      optionRefs.current.set(id, element);
                    } else {
                      optionRefs.current.delete(id);
                    }
                  }}
                  onClick={() => selectOption(option)}
                  onKeyDown={(event) => handleOptionKeyDown(event, option)}
                >
                  {option.icon ? (
                    <span
                      className="composer-select-option-icon"
                      aria-hidden="true"
                    >
                      {option.icon}
                    </span>
                  ) : null}
                  <span>{option.label}</span>
                  {option.value === value && !option.action ? (
                    <Check size={14} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
