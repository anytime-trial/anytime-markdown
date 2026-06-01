import { useCallback, useEffect, useRef, useState } from "react";

import { NOTIFICATION_DURATION } from "../constants/timing";

export type NotificationKey = "copiedToClipboard" | "fileSaved" | "pdfExportError" | "encodingError" | "saveError" | null;

export function useNotification() {
  const [notification, setNotification] = useState<NotificationKey>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const showNotification = useCallback((key: NotificationKey) => {
    clearTimeout(timerRef.current);
    setNotification(key);
    timerRef.current = setTimeout(() => setNotification(null), NOTIFICATION_DURATION);
  }, []);

  return { notification, setNotification, showNotification };
}
