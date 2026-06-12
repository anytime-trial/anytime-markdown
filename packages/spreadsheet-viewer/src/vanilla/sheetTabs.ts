import { createSpreadsheetT, type SpreadsheetT } from "../i18n/createSpreadsheetT";
import { createSvIconButton } from "../ui-vanilla/controls";
import { svIcon } from "../ui-vanilla/icons";
import { createSvMenuItem, openSvMenu, type SvMenuHandle } from "../ui-vanilla/overlay";

/**
 * SheetTabs.tsx の vanilla 版。
 * タブのクリック選択・ダブルクリックリネーム・右クリック削除メニュー・
 * ドラッグ & ドロップ並べ替えを移植する。シート一覧の変化は handle.update で受ける。
 */

export interface SheetTabsCallbacks {
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export interface SheetTabsHandle {
  el: HTMLDivElement;
  update(state: { sheets: readonly string[]; activeSheet: number }): void;
  destroy(): void;
}

export function createSheetTabs(
  initial: { sheets: readonly string[]; activeSheet: number },
  callbacks: SheetTabsCallbacks,
  i18n?: { t?: SpreadsheetT; locale?: string },
): SheetTabsHandle {
  const t = i18n?.t ?? createSpreadsheetT("Spreadsheet", i18n?.locale);
  const el = document.createElement("div");
  Object.assign(el.style, {
    display: "flex",
    alignItems: "center",
    borderTop: "1px solid var(--sv-color-divider)",
    background: "var(--sv-color-bg-paper)",
    overflowX: "auto",
    flexShrink: "0",
    minHeight: "32px",
  });

  let sheets: readonly string[] = initial.sheets;
  let activeSheet = initial.activeSheet;
  let renamingIndex: number | null = null;
  let dragFrom: number | null = null;
  let menu: SvMenuHandle | null = null;

  const closeMenu = (): void => {
    menu?.close();
    menu = null;
  };

  const render = (): void => {
    el.replaceChildren();
    sheets.forEach((name, index) => {
      const tab = document.createElement("div");
      tab.className = "sv-hoverable";
      tab.draggable = true;
      Object.assign(tab.style, {
        padding: "4px 12px",
        cursor: "pointer",
        borderBottom:
          activeSheet === index
            ? "2px solid var(--sv-color-primary-main)"
            : "2px solid transparent",
        userSelect: "none",
        whiteSpace: "nowrap",
      });

      if (renamingIndex === index) {
        const input = document.createElement("input");
        input.value = name;
        Object.assign(input.style, {
          width: `${Math.max(60, name.length * 8)}px`,
          fontSize: "inherit",
        });
        const commit = (): void => {
          const value = input.value.trim();
          renamingIndex = null;
          if (value.length > 0) {
            callbacks.onRename(index, value);
          }
          render();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("input", () => {
          input.style.width = `${Math.max(60, input.value.length * 8)}px`;
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            renamingIndex = null;
            render();
          }
        });
        tab.appendChild(input);
        queueMicrotask(() => {
          input.focus();
          input.select();
        });
      } else {
        const label = document.createElement("span");
        label.className = "sv-text-caption";
        label.textContent = name;
        tab.appendChild(label);
      }

      tab.addEventListener("click", () => callbacks.onSelect(index));
      tab.addEventListener("dblclick", () => {
        renamingIndex = index;
        render();
      });
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        closeMenu();
        menu = openSvMenu({
          anchorEl: tab,
          anchorOrigin: { vertical: "top", horizontal: "left" },
          transformOrigin: { vertical: "bottom", horizontal: "left" },
          onClose: closeMenu,
        });
        menu?.paper.appendChild(
          createSvMenuItem({
            label: t("sheetDelete"),
            disabled: sheets.length <= 1,
            onClick: () => {
              callbacks.onRemove(index);
              closeMenu();
            },
          }),
        );
      });
      tab.addEventListener("dragstart", () => {
        dragFrom = index;
      });
      tab.addEventListener("dragover", (e) => e.preventDefault());
      tab.addEventListener("drop", () => {
        if (dragFrom !== null && dragFrom !== index) {
          callbacks.onReorder(dragFrom, index);
        }
        dragFrom = null;
      });

      el.appendChild(tab);
    });

    const addBtn = createSvIconButton({
      icon: svIcon("Add", { fontSize: "small" }),
      size: "small",
      ariaLabel: t("sheetAdd"),
      onClick: callbacks.onAdd,
    });
    Object.assign(addBtn.style, { marginLeft: "4px", marginRight: "4px" });
    el.appendChild(addBtn);
  };

  render();

  return {
    el,
    update(state) {
      sheets = state.sheets;
      activeSheet = state.activeSheet;
      renamingIndex = null;
      render();
    },
    destroy() {
      closeMenu();
      el.remove();
    },
  };
}
