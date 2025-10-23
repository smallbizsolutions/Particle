import React, { forwardRef, useEffect, useRef, useState } from "react";
import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

/**
 * CameraFeed.jsx
 * --------------
 * - Waits for a user gesture ("Start Camera") before accessing the webcam.
 * - Runs MediaPipe Selfie Segmentation and passes a mask canvas to parent.
 * - Emits: onReady() once segmentation begins,
 *          onMaskReady(maskCanvas) with live binary mask.
 */

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

  // Start camera only after user clicks button
  async function startCamera() {
    setError(null);
    try {
      setStarted(true);
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("No video element found");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      // Offscreen mask canvas (small for speed)
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = 160;
      maskCanvas.height = 120;
      maskCanvasRef.current = maskCanvas;
      onMaskReady && onMaskReady(maskCanvas);

      // Load MediaPipe model
      const seg = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      seg.setOptions({ modelSelection: 1, selfieMode: mirror });
      segRef.current = seg;

      try {
        await seg.initialize();
      } catch (e) {
        console.error("Segmentation load error", e);
        setError("Failed to load segmentation model. Check your connection.");
        return;
      }

      // Segmentation render loop
      const ctx = maskCanvas.getContext("2d");

      const loop = async () => {
        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl }).then((results) => {
              const src = results.segmentationMask;
              ctx.save();
              if (mirror) {
                ctx.translate(maskCanvas.width, 0);
                ctx.scale(-1, 1);
              }
              ctx.drawImage(src, 0, 0, maskCanvas.width, maskCanvas.height);
              ctx.restore();

              // Binary cleanup for crisper edges
              const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
              const d = img.data;
              for (let i = 0; i < d.length; i += 4) {
                const v = d[i];
                const on = v > 128 ? 255 : 0;
                d[i] = d[i + 1] = d[i + 2] = on;
                d[i + 3] = 255;
              }
              ctx.putImageData(img, 0, 0);
            });
          }
        } catch (err) {
          console.warn("Segmentation frame error:", err.message);
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      onReady && onReady();
      loop();
    } catch (err) {
      console.error("Camera startup error:", err);
      setError(
        "Could not access camera or load segmentation. Check permissions and connection."
      );
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (segRef.current && segRef.current.close) segRef.current.close();
      const v = videoRef.current;
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Pass video ref outward
  useEffect(() => {
    if (typeof ref === "function") ref(videoRef.current);
    else if (ref) ref.current = videoRef.current;
  }, [ref]);

  return (
    <>
      {/* Overlay Start Button */}
      {!started && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
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
              padding: "14px 28px",
              fontSize: "16px",
              fontWeight: 600,
              borderRadius: "12px",
              background: "#3b82f6",
              border: "none",
              color: "white",
              cursor: "pointer",
            }}
          >
            Start Camera
          </button>
          <p style={{ marginTop: "10px", fontSize: "13px", opacity: 0.8 }}>
            Tap to grant camera permission
          </p>
          {error && (
            <p
              style={{
                marginTop: "12px",
                color: "#fca5a5",
                fontSize: "13px",
                maxWidth: "260px",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* Background Video */}
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
        }}
      />
    </>
  );
});

export default CameraFeed;
