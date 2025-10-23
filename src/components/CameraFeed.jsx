import React, { forwardRef, useEffect, useRef } from 'react';

/**
 * Simple camera component requesting the selfie camera.
 * Exports a <video> element ref that ParticleCanvas will read from.
 */
const CameraFeed = forwardRef(function CameraFeed(
  { facingMode = 'user', mirror = true, onReady },
  ref
) {
  const localRef = useRef(null);

  useEffect(() => {
    const videoEl = localRef.current;
    if (!videoEl) return;

    let stream;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false
        });
        videoEl.srcObject = stream;
        await videoEl.play();
        onReady && onReady();
      } catch (err) {
        console.error('Camera error:', err);
        alert('Could not access the camera. Check permissions and try again.');
      }
    };

    start();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [facingMode, onReady]);

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
      style={{
        transform: mirror ? 'scaleX(-1)' : 'none'
      }}
    />
  );
});

export default CameraFeed;
