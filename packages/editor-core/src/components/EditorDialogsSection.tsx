import type { ThemePresetName } from "../constants/themePresets";
import type { EditorSettings } from "../useEditorSettings";
import { EditorDialogs } from "./EditorDialogs";
import { EditorSettingsPanel } from "./EditorSettingsPanel";

interface EditorDialogsSectionProps {
  // comment dialog
  commentDialogOpen: boolean;
  setCommentDialogOpen: (open: boolean) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  handleCommentInsert: () => void;
  // link dialog
  linkDialogOpen: boolean;
  setLinkDialogOpen: (open: boolean) => void;
  linkUrl: string;
  setLinkUrl: (url: string) => void;
  handleLinkInsert: () => void;
  // image dialog
  imageDialogOpen: boolean;
  setImageDialogOpen: (open: boolean) => void;
  imageUrl: string;
  setImageUrl: (url: string) => void;
  imageAlt: string;
  setImageAlt: (alt: string) => void;
  handleImageInsert: () => void;
  imageEditMode: boolean;
  // other dialogs
  shortcutDialogOpen: boolean;
  setShortcutDialogOpen: (open: boolean) => void;
  versionDialogOpen: boolean;
  setVersionDialogOpen: (open: boolean) => void;
  locale: "en" | "ja";
  // settings panel
  hideSettings?: boolean;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  resetSettings: () => void;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  onLocaleChange?: (locale: string) => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
  t: (key: string) => string;
}

export function EditorDialogsSection({
  commentDialogOpen, setCommentDialogOpen, commentText, setCommentText, handleCommentInsert,
  linkDialogOpen, setLinkDialogOpen, linkUrl, setLinkUrl, handleLinkInsert,
  imageDialogOpen, setImageDialogOpen, imageUrl, setImageUrl, imageAlt, setImageAlt, handleImageInsert, imageEditMode,
  shortcutDialogOpen, setShortcutDialogOpen,
  versionDialogOpen, setVersionDialogOpen,
  locale,
  hideSettings, settingsOpen, setSettingsOpen, settings, updateSettings, resetSettings,
  themeMode, onThemeModeChange, onLocaleChange,
  presetName, onPresetChange,
  t,
}: Readonly<EditorDialogsSectionProps>) {
  return (
    <>
      <EditorDialogs
        commentDialogOpen={commentDialogOpen}
        setCommentDialogOpen={setCommentDialogOpen}
        commentText={commentText}
        setCommentText={setCommentText}
        handleCommentInsert={handleCommentInsert}
        linkDialogOpen={linkDialogOpen}
        setLinkDialogOpen={setLinkDialogOpen}
        linkUrl={linkUrl}
        setLinkUrl={setLinkUrl}
        handleLinkInsert={handleLinkInsert}
        imageDialogOpen={imageDialogOpen}
        setImageDialogOpen={setImageDialogOpen}
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        imageAlt={imageAlt}
        setImageAlt={setImageAlt}
        handleImageInsert={handleImageInsert}
        imageEditMode={imageEditMode}
        shortcutDialogOpen={shortcutDialogOpen}
        setShortcutDialogOpen={setShortcutDialogOpen}
        versionDialogOpen={versionDialogOpen}
        setVersionDialogOpen={setVersionDialogOpen}
        locale={locale}
        t={t}
      />

      {!hideSettings && (
        <EditorSettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          updateSettings={updateSettings}
          resetSettings={resetSettings}
          t={t}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          onLocaleChange={onLocaleChange}
          presetName={presetName}
          onPresetChange={onPresetChange}
        />
      )}
    </>
  );
}
