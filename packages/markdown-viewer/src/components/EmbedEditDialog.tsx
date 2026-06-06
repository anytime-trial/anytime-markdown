"use client";

import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
} from "@mui/material";

import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { useEffect, useState } from "react";

import { useOptionalEmbedProviders } from "../contexts/EmbedProvidersContext";
import { Stack } from "../ui/Stack";
import { Text } from "../ui/Text";
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
                    <div>
                        <Text variant="subtitle2" style={{ marginBottom: 4 }}>
                            {t("embedVariantLabel")}
                        </Text>
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
                    </div>
                    <div
                        style={{
                            borderTop: "1px solid var(--am-color-divider)",
                            paddingTop: 16,
                        }}
                    >
                        <Text variant="subtitle2" style={{ marginBottom: 8 }}>
                            {t("embedPreviewLabel")}
                        </Text>
                        {url.trim() ? (
                            <EmbedNodeView
                                language={previewLang}
                                body={url.trim()}
                                providers={providers}
                            />
                        ) : (
                            <Text variant="body2" style={{ color: "var(--am-color-text-secondary)" }}>
                                {t("embedPreviewEmpty")}
                            </Text>
                        )}
                    </div>
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
