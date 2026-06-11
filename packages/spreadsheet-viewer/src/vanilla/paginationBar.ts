import { createSpreadsheetT, type SpreadsheetT } from "../i18n/createSpreadsheetT";
import { createSvCaption, createSvIconButton, createSvSelect } from "../ui-vanilla/controls";
import { svIcon } from "../ui-vanilla/icons";

/**
 * PaginationBar.tsx の vanilla 版。
 * props 変更（page / totalRows 等）は handle.update(props) で受けて内容を再構築する。
 */

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  availablePageSizes: ReadonlyArray<number>;
  onChange: (next: { page: number; pageSize: number }) => void;
  disabled?: boolean;
}

export interface PaginationBarHandle {
  el: HTMLDivElement;
  update(props: PaginationProps): void;
}

export function createPaginationBar(
  initial: PaginationProps,
  i18n?: { t?: SpreadsheetT; locale?: string },
): PaginationBarHandle {
  const t = i18n?.t ?? createSpreadsheetT("Pager", i18n?.locale);
  const el = document.createElement("div");
  Object.assign(el.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    borderTop: "1px solid var(--sv-color-divider)",
    flexShrink: "0",
    background: "var(--sv-color-bg-paper)",
  });

  const render = (props: PaginationProps): void => {
    const { page, pageSize, totalRows, availablePageSizes, onChange, disabled } = props;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const clampedPage = Math.min(Math.max(1, page), totalPages);

    const goto = (target: number): void => {
      const next = Math.min(Math.max(1, target), totalPages);
      if (next !== clampedPage) onChange({ page: next, pageSize });
    };

    const navBtn = (
      icon: Parameters<typeof svIcon>[0],
      label: string,
      target: number,
      navDisabled: boolean,
    ): HTMLButtonElement =>
      createSvIconButton({
        icon: svIcon(icon, { fontSize: "small" }),
        size: "small",
        ariaLabel: label,
        disabled: disabled || navDisabled,
        onClick: () => goto(target),
      });

    const pageText = createSvCaption(t("pageOfTotal", { page: clampedPage, total: totalPages }));
    Object.assign(pageText.style, { minWidth: "110px", textAlign: "center" });

    const spacer = document.createElement("div");
    spacer.style.flexGrow = "1";

    const select = createSvSelect({
      value: pageSize,
      options: availablePageSizes.map((s) => ({ value: s, label: String(s) })),
      disabled,
      ariaLabel: t("pageSize"),
      style: { minWidth: "72px" },
      onChange: (v) => onChange({ page: 1, pageSize: Number(v) }),
    });

    el.replaceChildren(
      navBtn("FirstPage", t("first"), 1, clampedPage <= 1),
      navBtn("KeyboardArrowLeft", t("prev"), clampedPage - 1, clampedPage <= 1),
      pageText,
      navBtn("KeyboardArrowRight", t("next"), clampedPage + 1, clampedPage >= totalPages),
      navBtn("LastPage", t("last"), totalPages, clampedPage >= totalPages),
      spacer,
      createSvCaption(`${t("pageSize")}:`),
      select,
      createSvCaption(t("totalRows", { count: totalRows })),
    );
  };

  render(initial);
  return { el, update: render };
}
