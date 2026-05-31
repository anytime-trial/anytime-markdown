"use client";

import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";

import { useOptionalEmbedProviders } from "../contexts/EmbedProvidersContext";
import type { EmbedVariant } from "../utils/embedInfoString";
import { EmbedNodeView } from "./EmbedNodeView";

interface Props {
    open: boolean;
    initialUrl: string;
    initialVariant: EmbedVariant;
    onClose: () => void;
    onApply: (url: string, variant: EmbedVariant) => void;
    t: (key: string) => string;
}

export function EmbedEditDialog({
    open,
    initialUrl,
    initialVariant,
    onClose,
    onApply,
    t,
}: Readonly<Props>) {
    const theme = useTheme();
    const providers = useOptionalEmbedProviders();
    const [url, setUrl] = useState(initialUrl);
    const [variant, setVariant] = useState<EmbedVariant>(initialVariant);

    useEffect(() => {
        if (open) {
            setUrl(initialUrl);
            setVariant(initialVariant);
        }
    }, [open, initialUrl, initialVariant]);

    const handleApply = () => {
        onApply(url.trim(), variant);
    };

    const previewLang = variant === "compact" ? "embed compact" : "embed";

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{t("embedEditTitle")}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <TextField
                        label={t("embedUrlLabel")}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        fullWidth
                        autoFocus
                        size="small"
                        placeholder="https://..."
                    />
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                            {t("embedVariantLabel")}
                        </Typography>
                        <RadioGroup
                            row
                            value={variant}
                            onChange={(e) => setVariant(e.target.value as EmbedVariant)}
                        >
                            <FormControlLabel
                                value="card"
                                control={<Radio size="small" />}
                                label={t("embedVariantCard")}
                            />
                            <FormControlLabel
                                value="compact"
                                control={<Radio size="small" />}
                                label={t("embedVariantCompact")}
                            />
                        </RadioGroup>
                    </Box>
                    <Box
                        sx={{
                            borderTop: `1px solid ${theme.palette.divider}`,
                            pt: 2,
                        }}
                    >
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            {t("embedPreviewLabel")}
                        </Typography>
                        {url.trim() ? (
                            <EmbedNodeView
                                language={previewLang}
                                body={url.trim()}
                                providers={providers}
                            />
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                {t("embedPreviewEmpty")}
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t("cancel")}</Button>
                <Button onClick={handleApply} variant="contained" disabled={!url.trim()}>
                    {t("apply")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
