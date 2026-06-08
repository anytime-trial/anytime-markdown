/**
 * vendored Material Design アイコン（Apache-2.0）。
 * graph-viewer が使用する @mui/icons-material アイコンを自前化したもの。
 * 出典: Material Icons (https://fonts.google.com/icons)。path データは Material Icons より。
 *
 * 命名は `<MUI ソース名>Icon`。各コンポーネントは import 時に必要なエイリアスを付ける
 * （例: `import { CropSquareIcon as RectIcon } from '../ui'`）。
 */
import { createIcon } from './SvgIcon';

export const AddIcon = createIcon(<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />, 'Add');
export const CloseIcon = createIcon(
  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
  'Close',
);
export const DeleteIcon = createIcon(
  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />,
  'Delete',
);
export const AccountTreeIcon = createIcon(
  <path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z" />,
  'AccountTree',
);
export const AlignHorizontalCenterIcon = createIcon(
  <path d="M11 2h2v5h8v3h-8v4h5v3h-5v5h-2v-5H6v-3h5v-4H3V7h8z" />,
  'AlignHorizontalCenter',
);
export const AlignHorizontalLeftIcon = createIcon(
  <path d="M4 22H2V2h2zM22 7H6v3h16zm-6 7H6v3h10z" />,
  'AlignHorizontalLeft',
);
export const AlignHorizontalRightIcon = createIcon(
  <path d="M20 2h2v20h-2zM2 10h16V7H2zm6 7h10v-3H8z" />,
  'AlignHorizontalRight',
);
export const AlignVerticalBottomIcon = createIcon(
  <path d="M22 22H2v-2h20zM10 2H7v16h3zm7 6h-3v10h3z" />,
  'AlignVerticalBottom',
);
export const AlignVerticalCenterIcon = createIcon(
  <path d="M22 11h-5V6h-3v5h-4V3H7v8H1.84v2H7v8h3v-8h4v5h3v-5h5z" />,
  'AlignVerticalCenter',
);
export const AlignVerticalTopIcon = createIcon(
  <path d="M22 2v2H2V2zM7 22h3V6H7zm7-6h3V6h-3z" />,
  'AlignVerticalTop',
);
export const ArrowDropDownIcon = createIcon(<path d="m7 10 5 5 5-5z" />, 'ArrowDropDown');
export const CircleOutlinedIcon = createIcon(
  <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8" />,
  'CircleOutlined',
);
export const CloudDoneIcon = createIcon(
  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96M10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41z" />,
  'CloudDone',
);
export const CloudOffIcon = createIcon(
  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96M3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4z" />,
  'CloudOff',
);
export const CloudSyncIcon = createIcon(
  <path d="M21.5 14.98c-.02 0-.03 0-.05.01C21.2 13.3 19.76 12 18 12c-1.4 0-2.6.83-3.16 2.02C13.26 14.1 12 15.4 12 17c0 1.66 1.34 3 3 3l6.5-.02c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5M10 4.26v2.09C7.67 7.18 6 9.39 6 12c0 1.77.78 3.34 2 4.44V14h2v6H4v-2h2.73C5.06 16.54 4 14.4 4 12c0-3.73 2.55-6.85 6-7.74M20 6h-2.73c1.43 1.26 2.41 3.01 2.66 5h-2.02c-.23-1.36-.93-2.55-1.91-3.44V10h-2V4h6z" />,
  'CloudSync',
);
export const CropSquareIcon = createIcon(
  <path d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 14H6V6h12z" />,
  'CropSquare',
);
export const DashboardIcon = createIcon(
  <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" />,
  'Dashboard',
);
export const DescriptionIcon = createIcon(
  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z" />,
  'Description',
);
export const FileDownloadIcon = createIcon(
  <path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z" />,
  'FileDownload',
);
export const FileUploadIcon = createIcon(
  <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />,
  'FileUpload',
);
export const FilterListIcon = createIcon(
  <path d="M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z" />,
  'FilterList',
);
export const FitScreenIcon = createIcon(
  <path d="M17 4h3c1.1 0 2 .9 2 2v2h-2V6h-3zM4 8V6h3V4H4c-1.1 0-2 .9-2 2v2zm16 8v2h-3v2h3c1.1 0 2-.9 2-2v-2zM7 18H4v-2H2v2c0 1.1.9 2 2 2h3zM18 8H6v8h12z" />,
  'FitScreen',
);
export const GridOnIcon = createIcon(
  <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M8 20H4v-4h4zm0-6H4v-4h4zm0-6H4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4z" />,
  'GridOn',
);
export const LayersIcon = createIcon(
  <path d="m11.99 18.54-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27z" />,
  'Layers',
);
export const LayersClearIcon = createIcon(
  <path d="m19.81 14.99 1.19-.92-1.43-1.43-1.19.92zm-.45-4.72L21 9l-9-7-2.91 2.27 7.87 7.88zM3.27 1 2 2.27l4.22 4.22L3 9l1.63 1.27L12 16l2.1-1.63 1.43 1.43L12 18.54l-7.37-5.73L3 14.07l9 7 4.95-3.85L20.73 21 22 19.73z" />,
  'LayersClear',
);
export const NearMeIcon = createIcon(
  <path d="M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98z" />,
  'NearMe',
);
export const PanToolIcon = createIcon(
  <path d="M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S11 3.17 11 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S15 .67 15 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5" />,
  'PanTool',
);
export const RedoIcon = createIcon(
  <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7z" />,
  'Redo',
);
export const RemoveIcon = createIcon(<path d="M19 13H5v-2h14z" />, 'Remove');
export const TableRowsIcon = createIcon(
  <path d="M21 8H3V4h18zm0 2H3v4h18zm0 6H3v4h18z" />,
  'TableRows',
);
export const TextFieldsIcon = createIcon(
  <path d="M2.5 4v3h5v12h3V7h5V4zm19 5h-9v3h3v7h3v-7h3z" />,
  'TextFields',
);
export const UndoIcon = createIcon(
  <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8" />,
  'Undo',
);
export const UnfoldMoreIcon = createIcon(
  <path d="M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15z" />,
  'UnfoldMore',
);
export const ViewColumnIcon = createIcon(
  <path d="M14.67 5v14H9.33V5zm1 14H21V5h-5.33zm-7.34 0V5H3v14z" />,
  'ViewColumn',
);
export const ZoomInIcon = createIcon(
  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14m.5-7H9v2H7v1h2v2h1v-2h2V9h-2z" />,
  'ZoomIn',
);
export const ZoomOutIcon = createIcon(
  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z" />,
  'ZoomOut',
);
export const ArrowDownwardIcon = createIcon(
  <path d="m20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z" />,
  'ArrowDownward',
);
export const ArrowUpwardIcon = createIcon(
  <path d="m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z" />,
  'ArrowUpward',
);
export const LockIcon = createIcon(
  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z" />,
  'Lock',
);
export const LockOpenIcon = createIcon(
  <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m0 12H6V10h12z" />,
  'LockOpen',
);
export const VerticalAlignBottomIcon = createIcon(
  <path d="M16 13h-3V3h-2v10H8l4 4zM4 19v2h16v-2z" />,
  'VerticalAlignBottom',
);
export const VerticalAlignTopIcon = createIcon(
  <path d="M8 11h3v10h2V11h3l-4-4zM4 3v2h16V3z" />,
  'VerticalAlignTop',
);
export const ContentCopyIcon = createIcon(
  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z" />,
  'ContentCopy',
);
export const ContentPasteIcon = createIcon(
  <path d="M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m7 18H5V4h2v3h10V4h2z" />,
  'ContentPaste',
);
export const FlipToBackIcon = createIcon(
  <path d="M9 7H7v2h2zm0 4H7v2h2zm0-8c-1.11 0-2 .9-2 2h2zm4 12h-2v2h2zm6-12v2h2c0-1.1-.9-2-2-2m-6 0h-2v2h2zM9 17v-2H7c0 1.1.89 2 2 2m10-4h2v-2h-2zm0-4h2V7h-2zm0 8c1.1 0 2-.9 2-2h-2zM5 7H3v12c0 1.1.89 2 2 2h12v-2H5zm10-2h2V3h-2zm0 12h2v-2h-2z" />,
  'FlipToBack',
);
export const FlipToFrontIcon = createIcon(
  <path d="M3 13h2v-2H3zm0 4h2v-2H3zm2 4v-2H3c0 1.1.89 2 2 2M3 9h2V7H3zm12 12h2v-2h-2zm4-18H9c-1.11 0-2 .9-2 2v10c0 1.1.89 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 12H9V5h10zm-8 6h2v-2h-2zm-4 0h2v-2H7z" />,
  'FlipToFront',
);
export const GroupWorkIcon = createIcon(
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2M8 17.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5M9.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5S9.5 9.38 9.5 8m6.5 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5" />,
  'GroupWork',
);
export const SelectAllIcon = createIcon(
  <path d="M3 5h2V3c-1.1 0-2 .9-2 2m0 8h2v-2H3zm4 8h2v-2H7zM3 9h2V7H3zm10-6h-2v2h2zm6 0v2h2c0-1.1-.9-2-2-2M5 21v-2H3c0 1.1.9 2 2 2m-2-4h2v-2H3zM9 3H7v2h2zm2 18h2v-2h-2zm8-8h2v-2h-2zm0 8c1.1 0 2-.9 2-2h-2zm0-12h2V7h-2zm0 8h2v-2h-2zm-4 4h2v-2h-2zm0-16h2V3h-2zM7 17h10V7H7zm2-8h6v6H9z" />,
  'SelectAll',
);
export const DarkModeIcon = createIcon(
  <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1" />,
  'DarkMode',
);
export const LightModeIcon = createIcon(
  <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5M2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1m18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1M11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1m0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1M5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0z" />,
  'LightMode',
);
export const DeblurIcon = createIcon(
  <>
    <path d="M12 3v18c4.97 0 9-4.03 9-9s-4.03-9-9-9" />
    <circle cx="6" cy="14" r="1" />
    <circle cx="6" cy="18" r="1" />
    <circle cx="6" cy="10" r="1" />
    <circle cx="3" cy="10" r=".5" />
    <circle cx="6" cy="6" r="1" />
    <circle cx="3" cy="14" r=".5" />
    <circle cx="10" cy="21" r=".5" />
    <circle cx="10" cy="3" r=".5" />
    <circle cx="10" cy="6" r="1" />
    <circle cx="10" cy="14" r="1.5" />
    <circle cx="10" cy="10" r="1.5" />
    <circle cx="10" cy="18" r="1" />
  </>,
  'Deblur',
);
