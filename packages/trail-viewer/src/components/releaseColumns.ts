import type { TrailI18n } from '../i18n/types';

export type ReleaseTableColumnKey =
  | 'version'
  | 'date'
  | 'interval'
  | 'steps'
  | 'files'
  | 'commits'
  | 'breakdown'
  | 'fixRate';

export interface ReleaseTableColumn {
  readonly key: ReleaseTableColumnKey;
  readonly i18nKey: keyof TrailI18n;
  readonly align?: 'right';
}

const RELEASE_TABLE_COLUMNS: ReadonlyArray<ReleaseTableColumn> = [
  { key: 'version', i18nKey: 'releases.version' },
  { key: 'date', i18nKey: 'releases.date' },
  { key: 'interval', i18nKey: 'releases.interval', align: 'right' },
  { key: 'steps', i18nKey: 'releases.steps', align: 'right' },
  { key: 'files', i18nKey: 'releases.files', align: 'right' },
  { key: 'commits', i18nKey: 'releases.commits', align: 'right' },
  { key: 'breakdown', i18nKey: 'releases.breakdown' },
  { key: 'fixRate', i18nKey: 'releases.fixRate', align: 'right' },
];

export function getReleaseTableColumns(): ReadonlyArray<ReleaseTableColumn> {
  return RELEASE_TABLE_COLUMNS;
}
