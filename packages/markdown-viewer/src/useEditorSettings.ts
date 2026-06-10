"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { STORAGE_KEY_SETTINGS } from "./constants/storageKeys";
import { DEFAULT_SETTINGS, type EditorSettings } from "./editorSettings";
import { safeRemoveItem, safeSetItem } from "./utils/storage";
const SETTINGS_VERSION = 9; // wordBreak を追加

// 型と既定値は React 非依存の単一ソース（./editorSettings）から再 export（互換維持）。
export { DEFAULT_SETTINGS, type EditorSettings };

export interface UseEditorSettingsReturn {
  settings: EditorSettings;
  loaded: boolean;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  resetSettings: () => void;
}

export function useEditorSettings(): UseEditorSettingsReturn {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        const raw = JSON.parse(saved) as Record<string, unknown>;
        // マイグレーション: バージョンが古い場合、改名/変更されたキーをリセット
        if ((raw._version as number) !== SETTINGS_VERSION) {
          delete raw.editorMinWidth;
          delete raw.editorMaxWidth;
          raw._version = SETTINGS_VERSION;
        }
        delete raw._version;
        const parsed = raw as Partial<EditorSettings>;
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(merged);
        // バージョンを保存
        safeSetItem(STORAGE_KEY_SETTINGS, JSON.stringify({ ...merged, _version: SETTINGS_VERSION }));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Save to localStorage
  const updateSettings = useCallback((patch: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      safeSetItem(STORAGE_KEY_SETTINGS, JSON.stringify({ ...next, _version: SETTINGS_VERSION }));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    safeRemoveItem(STORAGE_KEY_SETTINGS);
  }, []);

  return { settings, loaded, updateSettings, resetSettings };
}

/** 設定を子コンポーネント（NodeView 等）と共有するための Context */
export const EditorSettingsContext = createContext<EditorSettings>(DEFAULT_SETTINGS);

/** Context から設定を取得するフック */
export function useEditorSettingsContext() {
  return useContext(EditorSettingsContext);
}
