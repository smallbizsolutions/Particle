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

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = 256;
      maskCanvas.height = 192;
      maskCanvasRef.current = maskCanvas;
      const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });

      // Send empty mask immediately so particles start
      onMaskReady && onMaskReady(maskCanvas);
      onReady && onReady();

      // Create segmentation
      const seg = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      
      seg.setOptions({ 
        modelSelection: 1,
        selfieMode: mirror 
      });
      
      segRef.current = seg;

      let isProcessing = false;

      // Results handler
      seg.onResults = (results) => {
        if (!results || !results.segmentationMask) {
          isProcessing = false;
          return;
        }
        
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
      };

      // Initialize
      try {
        await seg.initialize();
      } catch (e) {
        console.log("Segmentation init failed, continuing anyway");
      }

      // Processing loop
      const loop = async () => {
        if (!isProcessing && videoEl.readyState >= 2 && seg) {
          isProcessing = true;
          try {
            await seg.send({ image: videoEl });
          } catch (err) {
            isProcessing = false;
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      loop();
      
    } catch (err) {
      console.error("Startup error:", err);
      setError("Camera error. Please refresh.");
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
              padding: "18px 36px",
              fontSize: "18px",
              fontWeight: 600,
              borderRadius: "14px",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              border: "none",
              color: "white",
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(59, 130, 246, 0.5)",
            }}
          >
            🎥 Start Camera
          </button>
          <p style={{ marginTop: "14px", fontSize: "15px", opacity: 0.85 }}>
            Particles will attach to your outline
          </p>
          {error && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 20px",
                background: "rgba(248, 113, 113, 0.2)",
                border: "1px solid rgba(248, 113, 113, 0.4)",
                borderRadius: "10px",
                color: "#fca5a5",
                fontSize: "14px",
                maxWidth: "340px",
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
