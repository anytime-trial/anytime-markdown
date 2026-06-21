import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type { C4ThemeColors } from '../../../theme/c4Tokens';
import {
  mountResizablePopupShell,
  type ResizablePopupShellHandle,
  type ResizablePopupSize,
  type ResizablePopupVanillaProps,
} from '../../../views/c4/widgets/resizablePopup';

export type { ResizablePopupSize };

export interface ResizablePopupProps {
  readonly title: string;
  readonly ariaLabel: string;
  readonly onClose: () => void;
  readonly isDark: boolean;
  readonly colors: C4ThemeColors;
  readonly size: ResizablePopupSize | null;
  readonly onSizeChange: (size: ResizablePopupSize) => void;
  readonly maximized: boolean;
  readonly onMaximizedChange: (maximized: boolean) => void;
  readonly defaultLeft?: number;
  readonly defaultMaxWidth?: number;
  readonly centered?: boolean;
  readonly withBackdrop?: boolean;
  readonly toolbarButtonSx: Record<string, unknown>;
  readonly i18nMaximize: string;
  readonly i18nRestore: string;
  readonly i18nClose: string;
  readonly i18nResize: string;
  readonly children: React.ReactNode;
}

export function ResizablePopup({
  children,
  toolbarButtonSx: _toolbarButtonSx,
  ...rest
}: ResizablePopupProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const handleRef = React.useRef<ResizablePopupShellHandle | null>(null);
  const [contentEl, setContentEl] = React.useState<HTMLElement | null>(null);

  // Mount the vanilla shell once.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const shellProps: Omit<ResizablePopupVanillaProps, 'mountContent'> = {
      title: rest.title,
      ariaLabel: rest.ariaLabel,
      onClose: rest.onClose,
      isDark: rest.isDark,
      colors: rest.colors,
      size: rest.size,
      onSizeChange: rest.onSizeChange,
      maximized: rest.maximized,
      onMaximizedChange: rest.onMaximizedChange,
      defaultLeft: rest.defaultLeft,
      defaultMaxWidth: rest.defaultMaxWidth,
      centered: rest.centered,
      withBackdrop: rest.withBackdrop,
      i18nMaximize: rest.i18nMaximize,
      i18nRestore: rest.i18nRestore,
      i18nClose: rest.i18nClose,
      i18nResize: rest.i18nResize,
    };
    handleRef.current = mountResizablePopupShell(containerRef.current, shellProps);
    setContentEl(handleRef.current.contentEl);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
      setContentEl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Propagate prop changes to vanilla shell.
  React.useEffect(() => {
    if (!handleRef.current) return;
    handleRef.current.update({
      title: rest.title,
      ariaLabel: rest.ariaLabel,
      onClose: rest.onClose,
      isDark: rest.isDark,
      colors: rest.colors,
      size: rest.size,
      onSizeChange: rest.onSizeChange,
      maximized: rest.maximized,
      onMaximizedChange: rest.onMaximizedChange,
      defaultLeft: rest.defaultLeft,
      defaultMaxWidth: rest.defaultMaxWidth,
      centered: rest.centered,
      withBackdrop: rest.withBackdrop,
      i18nMaximize: rest.i18nMaximize,
      i18nRestore: rest.i18nRestore,
      i18nClose: rest.i18nClose,
      i18nResize: rest.i18nResize,
    });
  });

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {contentEl !== null && ReactDOM.createPortal(children, contentEl)}
    </div>
  );
}
