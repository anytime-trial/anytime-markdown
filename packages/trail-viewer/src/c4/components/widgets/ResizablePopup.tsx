import { useCallback, useRef } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import type { C4ThemeColors } from '../../../theme/c4Tokens';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MARGIN = 8;
const HANDLE_SIZE = 16;

export interface ResizablePopupSize {
  readonly width: number;
  readonly height: number;
}

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
  /** size === null のときに使う初期 left オフセット（px）。`centered` 指定時は無視される。 */
  readonly defaultLeft?: number;
  /** size === null のときに使う maxWidth（px） */
  readonly defaultMaxWidth?: number;
  /** size === null のときに親領域の中央に水平方向で寄せる。デフォルト false。 */
  readonly centered?: boolean;
  /** ポップアップ背後を覆う半透明 + ぼかしの backdrop を表示する。デフォルト false。 */
  readonly withBackdrop?: boolean;
  readonly toolbarButtonSx: SxProps<Theme>;
  readonly i18nMaximize: string;
  readonly i18nRestore: string;
  readonly i18nClose: string;
  readonly i18nResize: string;
  readonly children: React.ReactNode;
}

/**
 * C4 ビュー内で使う右ペイン型ポップアップ。
 * - 右下コーナーをドラッグでリサイズ（min 360×240、親領域が上限）
 * - 最大化トグルで親領域全面（margin 8px）に展開
 * - サイズ・最大化状態は呼び出し側で持たせるため state は受け取らない
 */
export function ResizablePopup({
  title, ariaLabel, onClose, isDark, colors,
  size, onSizeChange, maximized, onMaximizedChange,
  defaultLeft = 244, defaultMaxWidth = 960,
  centered = false,
  withBackdrop = false,
  toolbarButtonSx,
  i18nMaximize, i18nRestore, i18nClose, i18nResize,
  children,
}: ResizablePopupProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const parent = root.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const offsetLeft = parentRect ? rect.left - parentRect.left : 0;
    const offsetTop = parentRect ? rect.top - parentRect.top : 0;
    const parentW = parent?.clientWidth ?? globalThis.innerWidth;
    const parentH = parent?.clientHeight ?? globalThis.innerHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const maxW = Math.max(MIN_WIDTH, parentW - offsetLeft - MARGIN);
    const maxH = Math.max(MIN_HEIGHT, parentH - offsetTop - MARGIN);

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_WIDTH, Math.min(maxW, startW + (ev.clientX - startX)));
      const h = Math.max(MIN_HEIGHT, Math.min(maxH, startH + (ev.clientY - startY)));
      onSizeChange({ width: w, height: h });
    };
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove);
      globalThis.removeEventListener('mouseup', onUp);
    };
    globalThis.addEventListener('mousemove', onMove);
    globalThis.addEventListener('mouseup', onUp);
  }, [onSizeChange]);

  const baseSx = {
    position: 'absolute' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    bgcolor: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(251,249,243,0.98)',
    color: colors.text,
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
    zIndex: 11,
  };
  const sizeSx = maximized
    ? { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN }
    : size
      ? centered
        // 中央寄せモードでリサイズ済みの場合は left/right に同値を入れて margin auto で中央維持。
        ? { top: MARGIN, left: MARGIN, right: MARGIN, marginLeft: 'auto', marginRight: 'auto', width: size.width, height: size.height }
        : { top: MARGIN, left: defaultLeft, width: size.width, height: size.height }
      : centered
        // position: absolute でも left/right + margin auto で水平中央寄せが効く。
        ? { top: MARGIN, left: MARGIN, right: MARGIN, marginLeft: 'auto', marginRight: 'auto', maxWidth: defaultMaxWidth, height: `calc(100% - ${MARGIN * 2}px)` }
        : { top: MARGIN, left: defaultLeft, right: MARGIN, maxWidth: defaultMaxWidth, height: `calc(100% - ${MARGIN * 2}px)` };

  return (
    <>
      {withBackdrop && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            bgcolor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        />
      )}
    <Box ref={rootRef} role="dialog" aria-label={ariaLabel} sx={{ ...baseSx, ...sizeSx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={maximized ? i18nRestore : i18nMaximize}>
            <IconButton
              size="small"
              onClick={() => onMaximizedChange(!maximized)}
              aria-label={maximized ? i18nRestore : i18nMaximize}
              sx={{ ...toolbarButtonSx, width: 22, height: 22, minWidth: 22 } as SxProps<Theme>}
            >
              {maximized ? <FullscreenExitIcon sx={{ fontSize: 14 }} /> : <FullscreenIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={i18nClose}>
            <IconButton
              size="small"
              onClick={onClose}
              aria-label={i18nClose}
              sx={{ ...toolbarButtonSx, width: 22, height: 22, minWidth: 22 } as SxProps<Theme>}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
      {!maximized && (
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-label={i18nResize}
          onMouseDown={handleResizeMouseDown}
          sx={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            cursor: 'nwse-resize',
            opacity: 0.5,
            '&:hover': { opacity: 1 },
            '&::before': {
              content: '""',
              position: 'absolute',
              right: 3,
              bottom: 3,
              width: 10,
              height: 10,
              backgroundImage: `linear-gradient(135deg, transparent 0%, transparent 40%, ${colors.text} 40%, ${colors.text} 50%, transparent 50%, transparent 70%, ${colors.text} 70%, ${colors.text} 80%, transparent 80%)`,
            },
          }}
        />
      )}
    </Box>
    </>
  );
}
