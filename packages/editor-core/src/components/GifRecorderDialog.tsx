"use client";

import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import GifIcon from "@mui/icons-material/Gif";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import CropFreeIcon from "@mui/icons-material/CropFree";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import { Box, Button, LinearProgress, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import {
  GifRecorderState,
  extractFrameFromCanvas,
  encodeGif,
  type CropRect,
  type GifSettings,
} from "../utils/gifEncoder";

type RecordingPhase = "idle" | "previewing" | "selecting" | "ready" | "recording" | "encoding" | "done";

interface GifRecorderDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: (blob: Blob, fileName: string, settings: GifSettings) => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `recording-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.gif`;
}

export function GifRecorderDialog({ open, onClose, onComplete }: GifRecorderDialogProps) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState(defaultFileName());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<GifRecorderState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const MAX_DURATION = 30000;

  // --- Cleanup ---
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
  }, [resultUrl]);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("idle");
      setCropRect(null);
      setElapsed(0);
      setProgress(0);
      setResultBlob(null);
      setResultUrl(null);
      setFileName(defaultFileName());
      recorderRef.current = null;
    }
  }, [open, cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

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
        setPhase("idle");
        streamRef.current = null;
      });
      setPhase("previewing");
    } catch {
      // User cancelled or error
    }
  }, []);

  // --- Canvas overlay: rectangle selection ---
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvas = canvasOverlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = video.videoWidth / rect.width;
      const scaleY = video.videoHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const drawOverlay = useCallback(
    (rect: CropRect | null) => {
      const canvas = canvasOverlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!rect) return;
      // Dark overlay outside selection
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Clear selection area
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
      // Selection border
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    },
    [],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== "previewing" && phase !== "selecting" && phase !== "ready") return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      dragStartRef.current = coords;
      setPhase("selecting");
      setCropRect(null);
      drawOverlay(null);
    },
    [phase, getCanvasCoords, drawOverlay],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== "selecting" || !dragStartRef.current) return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const start = dragStartRef.current;
      const rect: CropRect = {
        x: Math.min(start.x, coords.x),
        y: Math.min(start.y, coords.y),
        width: Math.abs(coords.x - start.x),
        height: Math.abs(coords.y - start.y),
      };
      drawOverlay(rect);
    },
    [phase, getCanvasCoords, drawOverlay],
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== "selecting" || !dragStartRef.current) return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const start = dragStartRef.current;
      const rect: CropRect = {
        x: Math.min(start.x, coords.x),
        y: Math.min(start.y, coords.y),
        width: Math.abs(coords.x - start.x),
        height: Math.abs(coords.y - start.y),
      };
      dragStartRef.current = null;
      if (rect.width < 10 || rect.height < 10) {
        // Too small, reset
        setPhase("previewing");
        drawOverlay(null);
        return;
      }
      setCropRect(rect);
      drawOverlay(rect);
      setPhase("ready");
    },
    [phase, getCanvasCoords, drawOverlay],
  );

  // --- Recording ---
  const handleStartRecording = useCallback(() => {
    if (!cropRect || !videoRef.current) return;
    const recorder = new GifRecorderState({ fps: 10, maxDuration: MAX_DURATION, outputWidth: 800 });
    recorderRef.current = recorder;
    setElapsed(0);
    setPhase("recording");

    const video = videoRef.current;
    const hiddenCanvas = document.createElement("canvas");
    hiddenCanvas.width = video.videoWidth;
    hiddenCanvas.height = video.videoHeight;
    const hiddenCtx = hiddenCanvas.getContext("2d")!;

    intervalRef.current = setInterval(() => {
      hiddenCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const frameCanvas = extractFrameFromCanvas(hiddenCanvas, cropRect, recorder.outputWidth);
      const ok = recorder.addFrame(frameCanvas);
      setElapsed(recorder.elapsed);
      if (!ok) {
        // Max frames reached, auto-stop
        handleStopRecording();
      }
    }, 1000 / recorder.fps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropRect]);

  const handleStopRecording = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.frames.length === 0) {
      setPhase("ready");
      return;
    }
    setPhase("encoding");
    setProgress(0);

    const firstFrame = recorder.frames[0];
    try {
      const blob = await encodeGif(
        recorder.frames,
        firstFrame.width,
        firstFrame.height,
        recorder.fps,
        (p) => setProgress(p),
      );
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setPhase("done");
    } catch (err) {
      console.error("GIF encoding failed:", err);
      setPhase("ready");
    }
  }, []);

  // --- Save ---
  const handleSave = useCallback(() => {
    if (!resultBlob) return;
    const recorder = recorderRef.current;
    const settings: GifSettings = {
      fps: recorder?.fps ?? 10,
      width: recorder?.outputWidth ?? 800,
      duration: recorder?.elapsed ?? 0,
    };
    onComplete(resultBlob, fileName, settings);
  }, [resultBlob, fileName, onComplete]);

  // --- Retry ---
  const handleRetry = useCallback(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultBlob(null);
    setResultUrl(null);
    setElapsed(0);
    setProgress(0);
    recorderRef.current?.reset();
    setPhase(streamRef.current ? "previewing" : "idle");
    drawOverlay(null);
  }, [resultUrl, drawOverlay]);

  const t = (key: string) => key; // placeholder - i18n keys passed through

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="gif-recorder-title">
      <EditDialogHeader
        label="GIF Recorder"
        onClose={onClose}
        icon={<GifIcon sx={{ fontSize: 18 }} />}
        t={t}
      />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Video + Canvas overlay area */}
        <Box sx={{ flex: 1, position: "relative", overflow: "hidden", bgcolor: "black", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              display: phase === "idle" ? "none" : "block",
            }}
          />
          {phase !== "idle" && phase !== "encoding" && phase !== "done" && (
            <canvas
              ref={canvasOverlayRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                cursor: phase === "recording" ? "default" : "crosshair",
              }}
              onMouseDown={phase !== "recording" ? handleCanvasMouseDown : undefined}
              onMouseMove={phase !== "recording" ? handleCanvasMouseMove : undefined}
              onMouseUp={phase !== "recording" ? handleCanvasMouseUp : undefined}
            />
          )}
          {phase === "idle" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "grey.400" }}>
              <ScreenShareIcon sx={{ fontSize: 48 }} />
              <Typography variant="body2">Select a screen to start</Typography>
            </Box>
          )}
          {phase === "done" && resultUrl && (
            <img src={resultUrl} alt="GIF preview" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          )}
          {phase === "encoding" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "grey.400", width: "60%" }}>
              <Typography variant="body2">Encoding GIF...</Typography>
              <LinearProgress variant="determinate" value={progress * 100} sx={{ width: "100%" }} />
              <Typography variant="caption">{Math.round(progress * 100)}%</Typography>
            </Box>
          )}
        </Box>

        {/* Bottom bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderTop: 1, borderColor: "divider" }}>
          {phase === "idle" && (
            <Button size="small" variant="outlined" startIcon={<ScreenShareIcon />} onClick={handleSelectScreen}>
              Select Screen
            </Button>
          )}
          {(phase === "previewing" || phase === "selecting") && (
            <>
              <Button size="small" variant="outlined" startIcon={<CropFreeIcon />} disabled>
                Select Area
              </Button>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Drag on the preview to select recording area
              </Typography>
            </>
          )}
          {phase === "ready" && (
            <>
              <Button size="small" variant="outlined" startIcon={<CropFreeIcon />} onClick={() => { setPhase("previewing"); setCropRect(null); drawOverlay(null); }}>
                Reselect Area
              </Button>
              <Button size="small" variant="contained" color="error" startIcon={<FiberManualRecordIcon />} onClick={handleStartRecording}>
                Record
              </Button>
            </>
          )}
          {phase === "recording" && (
            <>
              <Button size="small" variant="contained" color="error" startIcon={<StopIcon />} onClick={handleStopRecording}>
                Stop
              </Button>
              <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                {formatTime(elapsed)} / {formatTime(MAX_DURATION)}
              </Typography>
            </>
          )}
          {phase === "done" && (
            <>
              <TextField
                size="small"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                sx={{ flex: 1 }}
                inputProps={{ "aria-label": "File name" }}
              />
              <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
                Save
              </Button>
              <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleRetry}>
                Retry
              </Button>
            </>
          )}
        </Box>
      </Box>
    </EditDialogWrapper>
  );
}
