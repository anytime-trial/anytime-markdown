import styles from "./AppIcon.module.css";

interface AppIconProps {
  fontSize?: "small" | "medium" | "large";
  src?: string;
}

const SIZE_MAP = { small: 36, medium: 40, large: 44 };

/** Anytime Markdown camel logo (PNG image icon) */
export default function AppIcon({ fontSize = "small", src = "/icons/icon-192x192.png" }: Readonly<AppIconProps>) {
  const size = SIZE_MAP[fontSize];
  return (
    <img
      className={styles.appIcon}
      src={src}
      alt="Anytime Markdown"
      width={size}
      height={size}
    />
  );
}
