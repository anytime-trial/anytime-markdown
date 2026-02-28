"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
const SETTINGS_KEY = "markdown-editor-settings";
const SETTINGS_VERSION = 3; // editorMaxWidth 設定を廃止

export interface EditorSettings {
  lineHeight: number;
  fontSize: number;
  tableWidth: "auto" | "100%";
  editorBg: "white" | "grey";
  lightBgColor: string;    // ライトモード背景色（空文字 = テーマデフォルト）
  lightTextColor: string;  // ライトモード文字色（空文字 = テーマデフォルト）
  darkBgColor: string;     // ダークモード背景色（空文字 = テーマデフォルト）
  darkTextColor: string;   // ダークモード文字色（空文字 = テーマデフォルト）
}

export const DEFAULT_SETTINGS: EditorSettings = {
  lineHeight: 1.2,
  fontSize: 14,
  tableWidth: "auto",
  editorBg: "white",
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
};

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
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
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...merged, _version: SETTINGS_VERSION })); } catch { /* */ }
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
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...next, _version: SETTINGS_VERSION }));
      } catch {
        // storage full
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { settings, loaded, updateSettings, resetSettings };
}

/** 設定を子コンポーネント（NodeView 等）と共有するための Context */
export const EditorSettingsContext = createContext<EditorSettings>(DEFAULT_SETTINGS);

/** Context から設定を取得するフック */
export function useEditorSettingsContext() {
  return useContext(EditorSettingsContext);
}
