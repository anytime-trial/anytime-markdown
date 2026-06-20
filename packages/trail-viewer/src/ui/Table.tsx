import type { CSSProperties, HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { injectTrailUiStyles } from "./injectStyles";

/* ---- TableContainer ---- */
export interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}
export function TableContainer({ children, style, className, ...rest }: Readonly<TableContainerProps>) {
  injectTrailUiStyles();
  const classes = ["trv-table-container", className].filter(Boolean).join(" ");
  return <div className={classes} style={style} {...rest}>{children}</div>;
}

/* ---- Table ---- */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  readonly children?: ReactNode;
  readonly size?: "small" | "medium";
  readonly style?: CSSProperties;
  readonly className?: string;
}
export function Table({ children, size: _size, style, className, ...rest }: Readonly<TableProps>) {
  injectTrailUiStyles();
  const classes = ["trv-table", className].filter(Boolean).join(" ");
  return <table className={classes} style={style} {...rest}>{children}</table>;
}

/* ---- TableHead ---- */
export interface TableSectionProps extends HTMLAttributes<HTMLTableSectionElement> {
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}
export function TableHead({ children, style, className, ...rest }: Readonly<TableSectionProps>) {
  injectTrailUiStyles();
  return <thead style={style} className={className} {...rest}>{children}</thead>;
}

/* ---- TableBody ---- */
export function TableBody({ children, style, className, ...rest }: Readonly<TableSectionProps>) {
  injectTrailUiStyles();
  return <tbody style={style} className={className} {...rest}>{children}</tbody>;
}

/* ---- TableRow ---- */
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  readonly children?: ReactNode;
  readonly selected?: boolean;
  readonly hover?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
}
export function TableRow({ children, selected: _selected, hover: _hover, style, className, ...rest }: Readonly<TableRowProps>) {
  injectTrailUiStyles();
  return <tr style={style} className={className} {...rest}>{children}</tr>;
}

/* ---- TableCell ---- */
export interface TableCellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> {
  readonly children?: ReactNode;
  readonly component?: "th" | "td";
  readonly align?: "left" | "center" | "right" | "inherit";
  readonly padding?: "normal" | "none";
  readonly style?: CSSProperties;
  readonly className?: string;
}
export function TableCell({ children, component, align, padding: _padding, style, className, ...rest }: Readonly<TableCellProps>) {
  injectTrailUiStyles();
  const isHeader = component === "th";
  const baseClass = isHeader ? "trv-th" : "trv-td";
  const alignClass = align === "right" || align === "center" ? `${baseClass}--numeric` : "";
  const classes = [baseClass, alignClass, className].filter(Boolean).join(" ");
  const composed: CSSProperties = align && align !== "inherit" && align !== "left"
    ? { textAlign: align, ...style }
    : style ?? {};
  if (isHeader) {
    return <th className={classes} style={composed} {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}>{children}</th>;
  }
  return <td className={classes} style={composed} {...rest}>{children}</td>;
}
