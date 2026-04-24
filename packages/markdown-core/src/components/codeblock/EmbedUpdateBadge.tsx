import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { IconButton, Tooltip } from "@mui/material";

interface Props {
    visible: boolean;
    newTitle: string | null;
    onClick: () => void;
}

export function EmbedUpdateBadge({ visible, newTitle, onClick }: Readonly<Props>) {
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
                sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    color: (theme) => theme.palette.primary.main,
                    backgroundColor: (theme) => theme.palette.background.paper,
                    "&:hover": {
                        backgroundColor: (theme) => theme.palette.action.hover,
                    },
                }}
            >
                <FiberManualRecordIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}
