import React, { forwardRef, useEffect, useRef } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

/**
 * Uses the front camera and runs MediaPipe Selfie Segmentation in-browser.
 * Exposes:
 *  - <video> element via ref (for the background)
 *  - an offscreen maskCanvas (grayscale person mask) via onMaskReady(maskCanvas)
 */
const CameraFeed = forwardRef(function CameraFeed(
  { facingMode = 'user', mirror = true, onReady, onMaskReady },
  ref
) {
  const localRef = useRef(null);
  const segRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const videoEl = localRef.current;
    if (!videoEl) return;

    let stream;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        videoEl.srcObject = stream;
        await videoEl.play();

        // Create a small offscreen canvas for the person mask (fast)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = 160;       // keep small, we only need edges
        maskCanvas.height = 120;
        maskCanvasRef.current = maskCanvas;
        onMaskReady && onMaskReady(maskCanvas);

        // Init MediaPipe Selfie Segmentation (assets from CDN)
        const seg = new SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        seg.setOptions({
          modelSelection: 1,     // 0 = landscape, 1 = general
          selfieMode: mirror     // mirror-friendly
        });
        segRef.current = seg;

        // We'll drive it manually each RAF for lowest latency
        const loop = async () => {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl }).then((results) => {
              // results.segmentationMask is a Canvas/Image bitmap where the person area is white
              const src = results.segmentationMask;
              const ctx = maskCanvas.getContext('2d');
              // draw + downscale into our small mask canvas
              ctx.save();
              if (mirror) {
                ctx.translate(maskCanvas.width, 0);
                ctx.scale(-1, 1);
              }
              ctx.drawImage(src, 0, 0, maskCanvas.width, maskCanvas.height);
              ctx.restore();
              // Optional: binarize for a cleaner edge (improves outline crispness)
              const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
              const d = img.data;
              for (let i = 0; i < d.length; i += 4) {
                const v = d[i]; // red channel (mask luminance)
                const on = v > 128 ? 255 : 0;
                d[i] = d[i+1] = d[i+2] = on;
                d[i+3] = 255;
              }
              ctx.putImageData(img, 0, 0);
            }).catch(() => {});
          }
          rafRef.current = requestAnimationFrame(loop);
        };

        await seg.initialize();
        onReady && onReady();
        loop();
      } catch (err) {
        console.error('Camera/Segmentation error:', err);
        alert('Could not access camera or load segmentation. Check permissions and connection.');
      }
    };

    start();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (segRef.current && segRef.current.close) segRef.current.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, mirror, onReady, onMaskReady]);

  // expose the video element to parent via ref
  useEffect(() => {
    if (typeof ref === 'function') {
      ref(localRef.current);
    } else if (ref) {
      ref.current = localRef.current;
    }
  }, [ref]);

  return (
    <video
      ref={localRef}
      playsInline
      muted
      autoPlay
      style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
    />
  );
});

export default CameraFeed;
