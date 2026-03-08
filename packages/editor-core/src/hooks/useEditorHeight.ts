import { useEffect, useRef, useState } from "react";

export function useEditorHeight(isMobile: boolean, isMd: boolean, bottomOffset = 0) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(isMd ? 600 : isMobile ? 350 : 450);

  useEffect(() => {
    const update = () => {
      if (!editorContainerRef.current) return;
      const top = editorContainerRef.current.getBoundingClientRect().top;
      const parent = editorContainerRef.current.closest("#main-content");
      const paddingBottom = parent
        ? parseFloat(getComputedStyle(parent).paddingBottom) || 0
        : (isMobile ? 16 : 24);
      setEditorHeight(Math.max(Math.floor(window.innerHeight - top - paddingBottom - bottomOffset), 200));
    };
    update();
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, [isMobile, bottomOffset]);

  return { editorContainerRef, editorHeight };
}
