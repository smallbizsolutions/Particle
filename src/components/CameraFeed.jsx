import React, { forwardRef, useEffect, useRef, useState } from "react";
import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

const CameraFeed = forwardRef(function CameraFeed(
  { facingMode = "user", mirror = true, onReady, onMaskReady },
  ref
) {
  const videoRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const segRef = useRef(null);
  const rafRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Waiting to start...");

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  async function startCamera() {
    setError(null);
    setStatus("Requesting camera access...");
    
    try {
      setStarted(true);
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("No video element found");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: isMobile ? 640 : 1280 },
          height: { ideal: isMobile ? 480 : 720 },
        },
        audio: false,
      });
      
      videoEl.srcObject = stream;
      await videoEl.play();
      setStatus("Loading AI model...");

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = 256;
      maskCanvas.height = 192;
      maskCanvasRef.current = maskCanvas;
      onMaskReady && onMaskReady(maskCanvas);

      const seg = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      seg.setOptions({ 
        modelSelection: 1,
        selfieMode: mirror 
      });
      segRef.current = seg;

      try {
        await seg.initialize();
        setStatus("Ready!");
      } catch (e) {
        console.error("Segmentation load error", e);
        setError("Failed to load AI model. Check your connection and refresh.");
        return;
      }

      const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });

      const loop = async () => {
        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl });
          }
        } catch (err) {
          console.warn("Segmentation frame error:", err.message);
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      seg.onResults((results) => {
        if (!results.segmentationMask) return;
        
        const src = results.segmentationMask;
        ctx.save();
        
        if (mirror) {
          ctx.translate(maskCanvas.width, 0);
          ctx.scale(-1, 1);
        }
        
        ctx.drawImage(src, 0, 0, maskCanvas.width, maskCanvas.height);
        ctx.restore();

        const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const d = img.data;
        
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i];
          const on = v > 140 ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = on;
          d[i + 3] = 255;
        }
        
        ctx.putImageData(img, 0, 0);
      });

      onReady && onReady();
      setStatus("Running");
      loop();
      
    } catch (err) {
      console.error("Camera startup error:", err);
      const msg = err.name === 'NotAllowedError' 
        ? "Camera permission denied. Please allow camera access and refresh."
        : err.name === 'NotFoundError'
        ? "No camera found on this device."
        : "Could not access camera. Check permissions and try again.";
      setError(msg);
      setStatus("Error");
    }
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (segRef.current && segRef.current.close) {
        try {
          segRef.current.close();
        } catch (e) {
          console.warn("Segmentation cleanup error:", e);
        }
      }
      const v = videoRef.current;
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (typeof ref === "function") ref(videoRef.current);
    else if (ref) ref.current = videoRef.current;
  }, [ref]);

  return (
    <>
      {!started && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <button
            onClick={startCamera}
            style={{
              padding: "16px 32px",
              fontSize: "16px",
              fontWeight: 600,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              border: "none",
              color: "white",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)",
              transition: "transform 0.2s",
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.95)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            🎥 Start Camera
          </button>
          <p style={{ marginTop: "12px", fontSize: "13px", opacity: 0.8 }}>
            Tap to grant camera permission
          </p>
          {error && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 20px",
                background: "rgba(248, 113, 113, 0.15)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: "8px",
                color: "#fca5a5",
                fontSize: "13px",
                maxWidth: "320px",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {started && status !== "Running" && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "12px 24px",
            background: "rgba(0, 0, 0, 0.7)",
            borderRadius: "8px",
            color: "white",
            fontSize: "14px",
            zIndex: 15,
            backdropFilter: "blur(8px)",
          }}
        >
          {status}
        </div>
      )}

      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: mirror ? "scaleX(-1)" : "none",
          filter: "contrast(1.05) saturate(1.05) brightness(0.95)",
        }}
      />
    </>
  );
});

export default CameraFeed;
