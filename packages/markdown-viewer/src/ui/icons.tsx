import type { SVGProps } from "react";

/**
 * vendored Material Design アイコン（Apache-2.0）。
 * @mui/icons-material 依存を切るため使用アイコンの SVG path のみ自前化する。
 * 出典: Material Symbols / Material Icons (https://fonts.google.com/icons), Apache License 2.0
 */
function createIcon(path: string, displayName: string) {
  function Icon({ size = 24, ...props }: Readonly<SVGProps<SVGSVGElement> & { size?: number }>) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
        aria-hidden="true"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const CloseIcon = createIcon(
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  "CloseIcon",
);

export const CheckIcon = createIcon(
  "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  "CheckIcon",
);
