import { useEffect, useRef, useState } from "react";

export function useEditorHeight(isMobile: boolean, isMd: boolean) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(isMd ? 600 : isMobile ? 350 : 450);

  useEffect(() => {
    const update = () => {
      if (!editorContainerRef.current) return;
      const top = editorContainerRef.current.getBoundingClientRect().top;
      const padding = isMobile ? 16 : 24;
      setEditorHeight(Math.max(Math.floor(window.innerHeight - top - padding), 200));
    };
    update();
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, [isMobile]);

  return { editorContainerRef, editorHeight };
}
