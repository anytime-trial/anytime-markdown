"use client";

import { createContext, useContext } from "react";

export interface EditorFeatures {
  hideGraph: boolean;
}

const DEFAULT_FEATURES: EditorFeatures = {
  hideGraph: false,
};

export const EditorFeaturesContext = createContext<EditorFeatures>(DEFAULT_FEATURES);

export function useEditorFeaturesContext(): EditorFeatures {
  return useContext(EditorFeaturesContext);
}
