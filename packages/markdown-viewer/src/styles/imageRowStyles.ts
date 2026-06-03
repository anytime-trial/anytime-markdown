import { getPrimaryMain } from "../constants/colors";

/**
 * 画像行 (imageRow) のレイアウトスタイル。
 *
 * 通常エディタ (blockStyles) と比較ビュー (mergeTiptapStyles) の双方で共用する。
 * 連続画像（README のバッジ等）を横並び・折り返しで表示するための flex 定義を一元管理し、
 * 経路ごとの CSS drift（比較モードで縦並びになる等）を防ぐ。
 *
 * セレクタはすべて `&` 始まりの相対指定のため、`.tiptap` 配下にスプレッドして使う。
 *
 * @param isDark ダークモードか否か
 */
export function getImageRowStyles(isDark: boolean) {
  return {
    // imageRow: React NodeView を使わず renderHTML 直出力。
    // DOM: [data-image-row] > .react-renderer.node-image+
    // 画像は横並びに詰め、空きがあるときは折り返し。flex を使う。
    "& [data-image-row]": {
      display: "flex !important" as unknown as string,
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "flex-start",
      my: 1,
    },
    "& [data-image-row] > *": {
      minWidth: "0 !important" as unknown as string,
      maxWidth: "100%",
      overflow: "hidden",
    },
    "& [data-image-row] .image-node-wrapper": {
      marginTop: "0 !important",
      marginBottom: "0 !important",
      minWidth: "0 !important" as unknown as string,
    },
    "& [data-image-row] img": {
      maxWidth: "100%",
      height: "auto",
    },
    "& [data-image-row] .image-node-wrapper > .MuiBox-root": {
      marginTop: "0 !important",
      marginBottom: "0 !important",
    },
    // 単独画像ブロック（imageRow 外）は画像サイズに合わせて幅を縮める
    "& .image-node-wrapper[data-inside-image-row='false']": {
      width: "fit-content",
      maxWidth: "100%",
    },
    "& .image-row[data-selected='true'], & [data-image-row][data-selected='true']": {
      outline: `2px solid ${getPrimaryMain(isDark)}`,
      outlineOffset: "2px",
      borderRadius: "4px",
    },
    "& .image-row-drop-cursor-vertical": {
      position: "absolute" as const,
      width: "2px",
      backgroundColor: getPrimaryMain(isDark),
      pointerEvents: "none" as const,
      zIndex: 10,
    },
  };
}
