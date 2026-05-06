"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import React, { useRef } from "react";
import { useTranslations } from "next-intl";

export interface DatabaseFilePickerProps {
  readonly onPick: (file: File) => void;
}

export const DatabaseFilePicker: React.FC<Readonly<DatabaseFilePickerProps>> = ({ onPick }) => {
  const t = useTranslations("Database");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", p: 4 }} spacing={2}>
      <Typography variant="h5">{t("webDropZone")}</Typography>
      <Box
        sx={{
          border: "2px dashed",
          borderColor: "divider",
          p: 6,
          borderRadius: 2,
          minWidth: 360,
          textAlign: "center",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onPick(f);
        }}
      >
        <Button variant="contained" onClick={() => inputRef.current?.click()}>
          {t("webFilePicker")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".db,.sqlite,.sqlite3,.db3"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
      </Box>
    </Stack>
  );
};
