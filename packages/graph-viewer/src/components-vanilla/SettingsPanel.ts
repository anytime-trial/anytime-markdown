/**
 * graph-viewer vanilla SettingsPanel ファクトリ。
 *
 * React 実装 `components/SettingsPanel.tsx` の DOM 版。
 * createIconButton / createText / createToggleButton / createToggleButtonGroup を使用。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { createGraphT } from '../i18n/createGraphT';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createText } from '../ui-vanilla/Text';
import {
  createToggleButton,
  createToggleButtonGroup,
} from '../ui-vanilla/ToggleButton';
import {
  createCloseIcon,
  createDarkModeIcon,
  createLightModeIcon,
} from '../ui-vanilla/icons';

export interface SettingsPanelOptions {
  readonly open: boolean;
  readonly width: number;
  readonly onClose: () => void;
  readonly themeMode?: 'light' | 'dark';
  readonly onThemeModeChange?: (mode: 'light' | 'dark') => void;
  readonly locale?: string;
  readonly onLocaleChange?: (locale: string) => void;
}

export interface SettingsPanelHandle {
  readonly el: HTMLDivElement;
  destroy(): void;
}

/**
 * MUI SettingsPanel コンポーネントの vanilla 置換。
 *
 * open が false のときは display:none の div を返す（呼び出し元で open 変化時に
 * destroy() → createSettingsPanel() し直すか、el.style.display を切り替える）。
 */
export function createSettingsPanel(opts: Readonly<SettingsPanelOptions>): SettingsPanelHandle {
  const {
    open,
    width,
    onClose,
    themeMode = 'dark',
    onThemeModeChange,
    locale,
    onLocaleChange,
  } = opts;

  const t = createGraphT('Graph', locale);
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  const root = document.createElement('div');
  root.style.width = `${width}px`;
  root.style.flexShrink = '0';
  root.style.backgroundColor = colors.panelBg;
  root.style.borderLeft = `1px solid ${colors.panelBorder}`;
  root.style.display = open ? 'flex' : 'none';
  root.style.flexDirection = 'column';
  root.style.overflow = 'hidden';

  // --- header ---
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '12px 16px';
  header.style.borderBottom = `1px solid ${colors.panelBorder}`;

  const titleEl = createText({
    variant: 'subtitle2',
    style: { color: colors.textPrimary, fontWeight: '700' },
    children: t('settings'),
  });

  const closeIconEl = createCloseIcon({ fontSize: 'small' });
  const closeBtn = createIconButton({
    size: 'small',
    onClick: onClose,
    children: closeIconEl,
  });
  closeBtn.style.color = colors.textSecondary;

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  root.appendChild(header);

  // --- body ---
  const body = document.createElement('div');
  body.style.padding = '16px';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '20px';

  // Theme section
  const themeSection = document.createElement('div');

  const themeRow = document.createElement('div');
  themeRow.style.display = 'flex';
  themeRow.style.alignItems = 'center';
  themeRow.style.gap = '8px';
  themeRow.style.marginBottom = '8px';

  const themeModeIcon = isDark
    ? createDarkModeIcon({ fontSize: 'small', color: colors.textSecondary })
    : createLightModeIcon({ fontSize: 'small', color: colors.textSecondary });

  const themeLabelEl = createText({
    style: { color: colors.textPrimary, fontWeight: '600' },
    children: t('themeMode'),
  });

  themeRow.appendChild(themeModeIcon);
  themeRow.appendChild(themeLabelEl);

  const themeGroup = createToggleButtonGroup({
    value: themeMode,
    exclusive: true,
    size: 'small',
    fullWidth: true,
    onChange: (_e, v) => {
      if (v === 'light' || v === 'dark') onThemeModeChange?.(v);
    },
  });
  const lightBtn = createToggleButton({ value: 'light', children: 'Light' });
  const darkBtn = createToggleButton({ value: 'dark', children: 'Dark' });
  themeGroup.register(lightBtn);
  themeGroup.register(darkBtn);

  themeSection.appendChild(themeRow);
  themeSection.appendChild(themeGroup.el);

  // Language section
  const langSection = document.createElement('div');

  const langLabelEl = createText({
    style: {
      color: colors.textPrimary,
      fontWeight: '600',
      marginBottom: '8px',
      display: 'block',
    },
    children: t('language'),
  });

  const currentLocale = locale ?? 'ja';
  const langGroup = createToggleButtonGroup({
    value: currentLocale,
    exclusive: true,
    size: 'small',
    fullWidth: true,
    onChange: (_e, v) => {
      if (v != null) onLocaleChange?.(v);
    },
  });
  const enBtn = createToggleButton({ value: 'en', children: 'English' });
  const jaBtn = createToggleButton({ value: 'ja', children: 'Japanese' });
  langGroup.register(enBtn);
  langGroup.register(jaBtn);

  langSection.appendChild(langLabelEl);
  langSection.appendChild(langGroup.el);

  body.appendChild(themeSection);
  body.appendChild(langSection);
  root.appendChild(body);

  return {
    el: root,
    destroy(): void {
      themeGroup.destroy();
      langGroup.destroy();
    },
  };
}
