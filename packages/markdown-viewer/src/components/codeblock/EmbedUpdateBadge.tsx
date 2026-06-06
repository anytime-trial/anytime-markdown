import React from "react";

import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Tooltip, useTheme } from "@mui/material";

import { IconButton } from "../../ui/IconButton";
import styles from "./EmbedUpdateBadge.module.css";

interface Props {
    visible: boolean;
    newTitle: string | null;
    onClick: () => void;
}

export function EmbedUpdateBadge({ visible, newTitle, onClick }: Readonly<Props>) {
    const theme = useTheme();
    if (!visible) return null;
    const title = newTitle ? `更新あり: ${newTitle}` : "前回確認後に更新されました";
    return (
        <Tooltip title={title}>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                }}
                aria-label="embed 更新あり"
                className={styles.badge}
                style={{
                    "--badge-color": theme.palette.primary.main,
                    "--badge-bg": theme.palette.background.paper,
                    "--badge-hover-bg": theme.palette.action.hover,
                } as React.CSSProperties}
            >
                <FiberManualRecordIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}
