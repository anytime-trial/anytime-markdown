import { useCallback, useEffect, useRef, useState } from "react";

import { EDITOR_HEIGHT_DEFAULT, EDITOR_HEIGHT_MD, EDITOR_HEIGHT_MIN,EDITOR_HEIGHT_MOBILE } from "../constants/dimensions";
import { DEBOUNCE_SHORT } from "../constants/timing";

export function useEditorHeight(isMobile: boolean, isMd: boolean, bottomOffset = 0) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  let initialHeight: number;
  if (isMd) initialHeight = EDITOR_HEIGHT_MD;
  else if (isMobile) initialHeight = EDITOR_HEIGHT_MOBILE;
  else initialHeight = EDITOR_HEIGHT_DEFAULT;
  const [editorHeight, setEditorHeight] = useState(initialHeight);

  const update = useCallback(() => {
    if (!editorContainerRef.current) return;
    const top = editorContainerRef.current.getBoundingClientRect().top;
    setEditorHeight(Math.max(Math.floor(window.innerHeight - top - bottomOffset), EDITOR_HEIGHT_MIN));
  }, [bottomOffset]);

  useEffect(() => {
    update();
    const timer = setTimeout(update, DEBOUNCE_SHORT);
    window.addEventListener("resize", update);

    // Observe position changes (e.g. frontmatter show/hide)
    const container = editorContainerRef.current;
    let ro: ResizeObserver | undefined;
    if (container?.parentElement) {
      ro = new ResizeObserver(update);
      // Observe the parent so that sibling size changes (frontmatter) trigger recalculation
      ro.observe(container.parentElement);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [update]);

  return { editorContainerRef, editorHeight };
}
