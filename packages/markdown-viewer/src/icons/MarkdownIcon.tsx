import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";

/**
 * Markdown Mark (M↓) logo
 * By Dustin Curtis (https://github.com/dcurtis/markdown-mark)
 * Dedicated to the public domain under CC0 1.0 Universal
 * https://creativecommons.org/publicdomain/zero/1.0/
 */
export default function MarkdownIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 208 128">
      <path d="M193 128H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15zM50 98V59l20 25 20-25v39h20V30H90L70 55 50 30H30v68zm134-34h-20V30h-20v34h-20l30 35z" />
    </SvgIcon>
  );
}
