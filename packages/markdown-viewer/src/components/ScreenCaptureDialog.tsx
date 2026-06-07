"use client";

import { useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../ui/Button";
import { CameraAltIcon, RefreshIcon, ScreenshotMonitorIcon } from "../ui/icons";

import { getDivider } from "../constants/colors";
import { Text } from "../ui/Text";
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

export function ScreenCaptureDialog({ open, onClose, onCapture, t }: Readonly<ScreenCaptureDialogProps>) {
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
        icon={<ScreenshotMonitorIcon fontSize={18} />}
        t={t}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Preview / Capture area */}
        {phase !== "captured" && (
          <div
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              backgroundColor: "black",
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, color: "#9e9e9e" }}>
                <ScreenshotMonitorIcon fontSize={48} />
                <Text variant="body2">{t("screenCaptureSelect")}</Text>
              </div>
            )}
          </div>
        )}

        {/* Captured phase: ImageCropTool */}
        {phase === "captured" && capturedDataUrl && (
          <ImageCropTool src={capturedDataUrl} onCrop={handleCropComplete} t={t} />
        )}

        {/* Bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderTop: `1px solid ${getDivider(isDark)}` }}>
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
        </div>
      </div>
    </EditDialogWrapper>
  );
}
