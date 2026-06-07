import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ArrowDropDownIcon } from "./icons";
import { MenuItem } from "./MenuItem";
import styles from "./Select.module.css";
import { useFloating } from "./useFloating";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  "aria-label"?: string;
  /** 既定 true（消費者は fullWidth で使用）。 */
  fullWidth?: boolean;
}

/**
 * MUI outlined Select の置換。closed 表示は combobox ボタン（枠線 + 値 + ▼）、
 * open 時は useFloating でアンカーした role="listbox" の popup（Portal + backdrop）。
 * value 連動・キーボードナビ（↑↓/Home/End/Enter/Esc/Tab）対応。closed 状態が VR 対象。
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  fullWidth = true,
}: Readonly<SelectProps<T>>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const { referenceRef, floatingRef, x, y, ready } = useFloating({ open, placement: "bottom-start", offsetPx: 4 });

  referenceRef.current = buttonRef.current;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  // open 時に選択中 option をアクティブ化し、listbox へフォーカスする。
  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const id = requestAnimationFrame(() => floatingRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, selectedIndex, floatingRef]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[activeIndex];
      if (o) choose(o.value);
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={[styles.select, fullWidth && styles.fullWidth].filter(Boolean).join(" ")}
        onMouseDown={() => setOpen(true)}
        onKeyDown={onButtonKeyDown}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <ArrowDropDownIcon className={styles.icon} aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className={styles.backdrop} onMouseDown={close} />
          <ul
            ref={(node) => { floatingRef.current = node; }}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
            tabIndex={-1}
            className={styles.listbox}
            style={{
              left: x,
              top: y,
              minWidth: buttonRef.current?.offsetWidth,
              opacity: ready ? 1 : 0,
              pointerEvents: ready ? undefined : "none",
            }}
            onKeyDown={onListKeyDown}
          >
            {options.map((o, i) => (
              // aria-selected=確定値の一致 / selected(CSS ハイライト)=キーボードカーソル位置。
              <MenuItem
                key={o.value}
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                selected={i === activeIndex}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {o.label}
              </MenuItem>
            ))}
          </ul>
        </>,
        document.body,
      )}
    </>
  );
}
