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

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  async function startCamera() {
    setError(null);
    
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

      // Wait a moment for video to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = 320;
      maskCanvas.height = 240;
      maskCanvasRef.current = maskCanvas;
      const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });

      // Create segmentation
      const seg = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
      });
      
      seg.setOptions({ 
        modelSelection: 0,  // Changed to 0 for better compatibility
        selfieMode: mirror 
      });
      
      segRef.current = seg;

      // Initialize segmentation
      await seg.initialize();
      
      console.log("✅ Segmentation ready!");

      let isProcessing = false;

      // Results handler
      seg.onResults((results) => {
        if (!results || !results.segmentationMask) {
          console.warn("No segmentation mask");
          return;
        }
        
        try {
          const src = results.segmentationMask;
          ctx.save();
          
          if (mirror) {
            ctx.translate(maskCanvas.width, 0);
            ctx.scale(-1, 1);
          }
          
          ctx.drawImage(src, 0, 0, maskCanvas.width, maskCanvas.height);
          ctx.restore();

          // Binary threshold
          const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
          const d = img.data;
          
          for (let i = 0; i < d.length; i += 4) {
            const v = d[i];
            const on = v > 128 ? 255 : 0;
            d[i] = d[i + 1] = d[i + 2] = on;
            d[i + 3] = 255;
          }
          
          ctx.putImageData(img, 0, 0);
          isProcessing = false;
        } catch (err) {
          console.error("Mask processing error:", err);
          isProcessing = false;
        }
      });

      // Pass mask canvas to parent
      onMaskReady && onMaskReady(maskCanvas);
      onReady && onReady();

      // Processing loop
      const loop = async () => {
        try {
          if (!isProcessing && videoEl.readyState >= 2) {
            isProcessing = true;
            await seg.send({ image: videoEl });
          }
        } catch (err) {
          console.error("Send error:", err);
          isProcessing = false;
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      loop();
      
    } catch (err) {
      console.error("Startup error:", err);
      const msg = err.name === 'NotAllowedError' 
        ? "Camera permission denied. Please refresh and allow camera access."
        : err.name === 'NotFoundError'
        ? "No camera found."
        : "Camera error. Please refresh and try again.";
      setError(msg);
    }
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (segRef.current) {
        try {
          segRef.current.close();
        } catch (e) {}
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
              fontSize: "18px",
              fontWeight: 600,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              border: "none",
              color: "white",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)",
            }}
          >
            🎥 Start Camera
          </button>
          <p style={{ marginTop: "12px", fontSize: "14px", opacity: 0.8 }}>
            Particles will attach to your outline
          </p>
          {error && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 20px",
                background: "rgba(248, 113, 113, 0.2)",
                border: "1px solid rgba(248, 113, 113, 0.4)",
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
