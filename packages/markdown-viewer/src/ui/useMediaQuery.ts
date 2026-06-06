import { useEffect, useState } from "react";

/**
 * MUI useMediaQuery の置換。`matchMedia` ベースで media query にマッチするか返す。
 * SSR / 非ブラウザ環境では false を返し、マウント後に再評価する。
 *
 * MUI の `theme.breakpoints.down("sm")` / `up("md")` 等は media query 文字列に変換して渡す
 * （MUI 既定: sm=600 / md=900。down(key)=max-width:(value-0.05)px、up(key)=min-width:value px）。
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
