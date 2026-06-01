import { useState } from "react";

interface HeadingMenuState {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

export function useEditorMenuState() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sampleAnchorEl, setSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [diagramAnchorEl, setDiagramAnchorEl] = useState<HTMLElement | null>(null);
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLElement | null>(null);
  const [templateAnchorEl, setTemplateAnchorEl] = useState<HTMLElement | null>(null);
  const [headingMenu, setHeadingMenu] = useState<HeadingMenuState | null>(null);

  return {
    settingsOpen, setSettingsOpen,
    sampleAnchorEl, setSampleAnchorEl,
    diagramAnchorEl, setDiagramAnchorEl,
    helpAnchorEl, setHelpAnchorEl,
    templateAnchorEl, setTemplateAnchorEl,
    headingMenu, setHeadingMenu,
  };
}
