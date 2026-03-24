/** @anytime-markdown/editor-core/constants サブパスエクスポート */
export {
  ACCENT_COLOR, ACCENT_COLOR_ALPHA,
  CAPTURE_BG,
  DEFAULT_DARK_BG, DEFAULT_DARK_CODE_BG, DEFAULT_DARK_HEADING_BG, DEFAULT_DARK_HEADING_LINK, DEFAULT_DARK_TEXT,
  DEFAULT_LIGHT_BG, DEFAULT_LIGHT_CODE_BG, DEFAULT_LIGHT_HEADING_BG, DEFAULT_LIGHT_HEADING_LINK, DEFAULT_LIGHT_TEXT,
  getEditorBg, getEditorText,
  PLANTUML_DARK_BG, PLANTUML_DARK_FG, PLANTUML_DARK_SURFACE,
} from '../constants/colors';
export { defaultContent } from '../constants/defaultContent';
export {
  COMMENT_PANEL_WIDTH, EDITOR_HEIGHT_DEFAULT, EDITOR_HEIGHT_MD, EDITOR_HEIGHT_MIN,
  EDITOR_HEIGHT_MOBILE, EDITOR_PADDING_BORDER, EDITOR_PADDING_TOP,
  OUTLINE_WIDTH_DEFAULT, OUTLINE_WIDTH_MAX, OUTLINE_WIDTH_MIN,
  PREVIEW_MAX_HEIGHT, STATUSBAR_HEIGHT,
} from '../constants/dimensions';
export type { DiagramSample } from '../constants/samples';
export { MERMAID_SAMPLES, PLANTUML_SAMPLES } from '../constants/samples';
export { isMac, KEYBOARD_SHORTCUTS, modKey } from '../constants/shortcuts';
export {
  STORAGE_KEY_CONTENT, STORAGE_KEY_EDITOR_MODE,
  STORAGE_KEY_READONLY_MODE, STORAGE_KEY_REVIEW_MODE,
  STORAGE_KEY_SETTINGS, STORAGE_KEY_SOURCE_MODE,
} from '../constants/storageKeys';
export type { MarkdownTemplate } from '../constants/templates';
export { BUILTIN_TEMPLATES } from '../constants/templates';
export { DEBOUNCE_MEDIUM, DEBOUNCE_SHORT, MERMAID_RENDER_TIMEOUT, NOTIFICATION_DURATION, PRINT_DELAY } from '../constants/timing';
export { Z_FULLSCREEN, Z_LINK_TOOLTIP, Z_SKIP_LINK, Z_TOOLBAR } from '../constants/zIndex';
