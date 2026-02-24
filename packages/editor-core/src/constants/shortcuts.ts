const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '\u2318' : 'Ctrl';

const SHORTCUTS: Record<string, { keys: string; label: string }> = {
  bold: { keys: 'Mod-b', label: `${modKey}+B` },
  italic: { keys: 'Mod-i', label: `${modKey}+I` },
  underline: { keys: 'Mod-u', label: `${modKey}+U` },
  strikethrough: { keys: 'Mod-Shift-x', label: `${modKey}+Shift+X` },
  highlight: { keys: 'Mod-Shift-h', label: `${modKey}+Shift+H` },
  h1: { keys: 'Mod-Alt-1', label: `${modKey}+Alt+1` },
  h2: { keys: 'Mod-Alt-2', label: `${modKey}+Alt+2` },
  h3: { keys: 'Mod-Alt-3', label: `${modKey}+Alt+3` },
  bulletList: { keys: 'Mod-Shift-8', label: `${modKey}+Shift+8` },
  orderedList: { keys: 'Mod-Shift-7', label: `${modKey}+Shift+7` },
  taskList: { keys: 'Mod-Shift-9', label: `${modKey}+Shift+9` },
  blockquote: { keys: 'Mod-Shift-b', label: `${modKey}+Shift+B` },
  codeBlock: { keys: 'Mod-Alt-c', label: `${modKey}+Alt+C` },
  horizontalRule: { keys: 'Mod-Alt-r', label: `${modKey}+Alt+R` },
  table: { keys: 'Mod-Alt-t', label: `${modKey}+Alt+T` },
  link: { keys: 'Mod-k', label: `${modKey}+K` },
  source: { keys: 'Mod-Alt-s', label: `${modKey}+Alt+S` },
  code: { keys: 'Mod-e', label: `${modKey}+E` },
};

const TOOLTIP_NAMES: Record<string, string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  highlight: 'Highlight',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bulletList: 'Bullet List',
  orderedList: 'Ordered List',
  taskList: 'Task List',
  blockquote: 'Blockquote',
  codeBlock: 'Code Block',
  horizontalRule: 'Horizontal Rule',
  table: 'Insert Table',
  link: 'Link',
  source: 'Source View',
  code: 'Code',
};

export function tooltipWithShortcut(key: string): string {
  const name = TOOLTIP_NAMES[key] || key;
  const shortcut = SHORTCUTS[key];
  if (!shortcut) { return name; }
  return `${name} (${shortcut.label})`;
}

export { SHORTCUTS, isMac, modKey };
