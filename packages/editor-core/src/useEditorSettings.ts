"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { STORAGE_KEY_SETTINGS } from "./constants/storageKeys";
import { safeRemoveItem, safeSetItem } from "./utils/storage";
const SETTINGS_VERSION = 8; // blockAlign を追加

export interface EditorSettings {
  lineHeight: number;
  fontSize: number;
  tableWidth: "auto" | "100%";
  editorBg: "white" | "grey";
  lightBgColor: string;    // ライトモード背景色（空文字 = テーマデフォルト）
  lightTextColor: string;  // ライトモード文字色（空文字 = テーマデフォルト）
  darkBgColor: string;     // ダークモード背景色（空文字 = テーマデフォルト）
  darkTextColor: string;   // ダークモード文字色（空文字 = テーマデフォルト）
  spellCheck: boolean;
  paperSize: "off" | "A3" | "A4" | "B4" | "B5";
  paperMargin: number; // mm単位、10-40
  blockAlign: "left" | "center" | "right";
}

export const DEFAULT_SETTINGS: EditorSettings = {
  lineHeight: 1.6,
  fontSize: 16,
  tableWidth: "auto",
  editorBg: "white",
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
  spellCheck: false,
  paperSize: "off",
  paperMargin: 20,
  blockAlign: "left",
};

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
