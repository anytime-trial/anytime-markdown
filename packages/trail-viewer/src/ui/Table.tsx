import type { CSSProperties, HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

/* ---- TableContainer ---- */
export interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}
export function TableContainer({ children, style, className, sx, ...rest }: Readonly<TableContainerProps>) {
  injectTrailUiStyles();
  const classes = ["trv-table-container", className].filter(Boolean).join(" ");
  return <div className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>{children}</div>;
}

/* ---- Table ---- */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  readonly children?: ReactNode;
  readonly size?: "small" | "medium";
  readonly stickyHeader?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}
export function Table({ children, size: _size, stickyHeader: _stickyHeader, style, className, sx, ...rest }: Readonly<TableProps>) {
  injectTrailUiStyles();
  const classes = ["trv-table", className].filter(Boolean).join(" ");
  return <table className={classes} style={{ ...sxToStyle(sx), ...style }} {...rest}>{children}</table>;
}

/* ---- TableHead ---- */
export interface TableSectionProps extends HTMLAttributes<HTMLTableSectionElement> {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}
export function TableHead({ children, style, className, sx, ...rest }: Readonly<TableSectionProps>) {
  injectTrailUiStyles();
  return <thead style={{ ...sxToStyle(sx), ...style }} className={className} {...rest}>{children}</thead>;
}

/* ---- TableBody ---- */
export function TableBody({ children, style, className, sx, ...rest }: Readonly<TableSectionProps>) {
  injectTrailUiStyles();
  return <tbody style={{ ...sxToStyle(sx), ...style }} className={className} {...rest}>{children}</tbody>;
}

/* ---- TableRow ---- */
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  readonly children?: ReactNode;
  readonly selected?: boolean;
  readonly hover?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly sx?: Record<string, unknown>;
}
export function TableRow({ children, selected: _selected, hover: _hover, style, className, sx, onClick, ...rest }: Readonly<TableRowProps>) {
  injectTrailUiStyles();
  return <tr style={{ ...sxToStyle(sx), ...style }} className={className} onClick={onClick} {...rest}>{children}</tr>;
}

/* ---- TableCell ---- */
export interface TableCellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> {
  readonly children?: ReactNode;
  readonly component?: "th" | "td";
  readonly align?: "left" | "center" | "right" | "justify" | "inherit";
  readonly padding?: "normal" | "none" | string;
  readonly size?: string;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly colSpan?: number;
  readonly sx?: Record<string, unknown>;
}
export function TableCell({ children, component, align, padding: _padding, size: _size, style, className, colSpan, sx, ...rest }: Readonly<TableCellProps>) {
  injectTrailUiStyles();
  const isHeader = component === "th";
  const baseClass = isHeader ? "trv-th" : "trv-td";
  const alignClass = align === "right" || align === "center" ? `${baseClass}--numeric` : "";
  const classes = [baseClass, alignClass, className].filter(Boolean).join(" ");
  const composed: CSSProperties = {
    ...sxToStyle(sx),
    ...(align && align !== "inherit" && align !== "left" ? { textAlign: align } : {}),
    ...style,
  };
  if (isHeader) {
    return <th className={classes} style={composed} colSpan={colSpan} {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}>{children}</th>;
  }
  return <td className={classes} style={composed} colSpan={colSpan} {...rest}>{children}</td>;
}
