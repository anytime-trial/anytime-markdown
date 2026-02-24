export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const modKey = isMac ? "⌘" : "Ctrl";

export const KEYBOARD_SHORTCUTS: { categoryKey: string; items: { keys: string; descKey: string }[] }[] = [
  {
    categoryKey: "shortcutTextStyle",
    items: [
      { keys: `${modKey}+B`, descKey: "shortcutBold" },
      { keys: `${modKey}+I`, descKey: "shortcutItalic" },
      { keys: `${modKey}+U`, descKey: "shortcutUnderline" },
      { keys: `${modKey}+Shift+X`, descKey: "shortcutStrikethrough" },
      { keys: `${modKey}+Shift+H`, descKey: "shortcutHighlight" },
    ],
  },
  {
    categoryKey: "shortcutBlock",
    items: [
      { keys: `${modKey}+Alt+1~5`, descKey: "shortcutHeading" },
      { keys: `${modKey}+Shift+7`, descKey: "shortcutBulletList" },
      { keys: `${modKey}+Shift+8`, descKey: "shortcutOrderedList" },
      { keys: `${modKey}+Shift+9`, descKey: "shortcutTaskList" },
      { keys: `${modKey}+Shift+B`, descKey: "shortcutBlockquote" },
      { keys: `${modKey}+Alt+C`, descKey: "shortcutCodeBlock" },
      { keys: `${modKey}+E`, descKey: "shortcutInlineCode" },
      { keys: `${modKey}+Alt+I`, descKey: "shortcutImage" },
      { keys: `${modKey}+Alt+R`, descKey: "shortcutHorizontalRule" },
      { keys: `${modKey}+Alt+T`, descKey: "shortcutTable" },
      { keys: `${modKey}+Alt+D`, descKey: "shortcutDiagram" },
      { keys: `${modKey}+Alt+P`, descKey: "shortcutTemplate" },
      { keys: `${modKey}+Alt+S`, descKey: "shortcutToggleSourceMode" },
      { keys: `${modKey}+Alt+M`, descKey: "shortcutToggleCompareMode" },
    ],
  },
  {
    categoryKey: "shortcutEdit",
    items: [
      { keys: `${modKey}+Z`, descKey: "shortcutUndo" },
      { keys: `${modKey}+Shift+Z`, descKey: "shortcutRedo" },
      { keys: `${modKey}+Shift+K`, descKey: "shortcutDeleteLine" },
      { keys: "Shift+Enter", descKey: "shortcutHardBreak" },
      { keys: "Tab", descKey: "shortcutNextCell" },
      { keys: "Shift+Tab", descKey: "shortcutPrevCell" },
    ],
  },
  {
    categoryKey: "shortcutLinkImage",
    items: [
      { keys: `${modKey}+K`, descKey: "shortcutInsertLink" },
    ],
  },
  {
    categoryKey: "shortcutSearch",
    items: [
      { keys: `${modKey}+F`, descKey: "shortcutSearch" },
      { keys: `${modKey}+H`, descKey: "shortcutSearchReplace" },
    ],
  },
];
