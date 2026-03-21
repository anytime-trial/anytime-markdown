"use client";

import CameraAltIcon from "@mui/icons-material/CameraAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScreenshotMonitorIcon from "@mui/icons-material/ScreenshotMonitor";
import { Box, Button, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";

import { getDivider, getTextSecondary } from "../constants/colors";

import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { ImageCropTool } from "./ImageCropTool";

type CapturePhase = "idle" | "previewing" | "captured";

interface ScreenCaptureDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  t: (key: string) => string;
}

export function ScreenCaptureDialog({ open, onClose, onCapture, t }: ScreenCaptureDialogProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- Cleanup ---
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("idle");
      setCapturedDataUrl(null);
    }
  }, [open, stopStream]);

  // Cleanup on unmount
  useEffect(() => stopStream, [stopStream]);

  // --- Select Screen ---
  const handleSelectScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Listen for track ended (user stopped sharing)
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopStream();
        setPhase("idle");
      });
      setPhase("previewing");
    } catch {
      // User cancelled the OS dialog
      onClose();
    }
  }, [onClose, stopStream]);

  // Auto-call getDisplayMedia when dialog opens in idle phase
  useEffect(() => {
    if (open && phase === "idle") {
      handleSelectScreen();
    }
  }, [open, phase, handleSelectScreen]);

  // --- Capture ---
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    const dataUrl = canvas.toDataURL("image/png");
    stopStream();
    setCapturedDataUrl(dataUrl);
    setPhase("captured");
  }, [stopStream]);

  // --- Crop complete ---
  const handleCropComplete = useCallback(
    (croppedDataUrl: string) => {
      onCapture(croppedDataUrl);
      onClose();
    },
    [onCapture, onClose],
  );

  // --- Retry ---
  const handleRetry = useCallback(() => {
    stopStream();
    setCapturedDataUrl(null);
    setPhase("idle");
  }, [stopStream]);

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="screen-capture-title">
      <EditDialogHeader
        label={t("screenCapture")}
        onClose={onClose}
        icon={<ScreenshotMonitorIcon sx={{ fontSize: 18 }} />}
        t={t}
      />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Preview / Capture area */}
        {phase !== "captured" && (
          <Box
            sx={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              bgcolor: "black",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                display: phase === "previewing" ? "block" : "none",
              }}
            />
            {phase === "idle" && (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "grey.400" }}>
                <ScreenshotMonitorIcon sx={{ fontSize: 48 }} />
                <Typography variant="body2">{t("screenCaptureSelect")}</Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Captured phase: ImageCropTool */}
        {phase === "captured" && capturedDataUrl && (
          <ImageCropTool src={capturedDataUrl} onCrop={handleCropComplete} t={t} />
        )}

        {/* Bottom bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderTop: 1, borderColor: getDivider(isDark) }}>
          {phase === "previewing" && (
            <>
              <Button size="small" variant="contained" startIcon={<CameraAltIcon />} onClick={handleCapture}>
                {t("screenCaptureShoot")}
              </Button>
              <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleRetry}>
                {t("screenCaptureRetry")}
              </Button>
            </>
          )}
          {phase === "captured" && (
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleRetry}>
              {t("screenCaptureRetry")}
            </Button>
          )}
        </Box>
      </Box>
    </EditDialogWrapper>
  );
}
