import React, { useEffect, useRef } from "react";

/**
 * EdgeParticleCanvas
 * - Uses Sobel edge detection to find silhouette edges from the selfie camera.
 * - Spawns small glowing particles that cling to those edges like energy outlines.
 */

const PARTICLE_COUNT = 1200;
const EDGE_W = 96;
const EDGE_H = 54;
const EDGE_THRESHOLD = 80; // higher = fewer edges (more contrast required)
const FADE_DECAY = 0.9;

export default function ParticleCanvas({ videoRef, running, theme, mirror }) {
  const canvasRef = useRef(null);
  const edgeCtxRef = useRef(null);
  const prevFrameRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Offscreen buffer for edge detection
    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = EDGE_W;
    edgeCanvas.height = EDGE_H;
    edgeCtxRef.current = edgeCanvas.getContext("2d");

    // Initialize micro particles
    particlesRef.current = new Array(PARTICLE_COUNT).fill(0).map(() => ({
      x: Math.random() * canvas.clientWidth,
      y: Math.random() * canvas.clientHeight,
      vx: 0,
      vy: 0,
      life: Math.random(),
      size: 0.5 + Math.random() * 0.8,
    }));

    const loop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const edgeCtx = edgeCtxRef.current;
        drawEdges(edgeCtx, video, mirror);
        stepParticles(particlesRef.current, canvas, edgeCtx, theme);
        drawParticles(ctx, particlesRef.current, theme);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, theme, mirror, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="particles"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/* ---- Edge Detection ---- */
function drawEdges(edgeCtx, video, mirror) {
  const w = EDGE_W,
    h = EDGE_H;
  edgeCtx.save();
  if (mirror) {
    edgeCtx.translate(w, 0);
    edgeCtx.scale(-1, 1);
  }
  edgeCtx.drawImage(video, 0, 0, w, h);
  edgeCtx.restore();

  const frame = edgeCtx.getImageData(0, 0, w, h);
  const out = edgeCtx.createImageData(w, h);
  const d = frame.data;
  const o = out.data;

  // Sobel edge kernels
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0,
        sy = 0,
        idx = (y * w + x) * 4;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const i = ((y + ky) * w + (x + kx)) * 4;
          const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
          sx += gx[k] * gray;
          sy += gy[k] * gray;
          k++;
        }
      }
      const mag = Math.sqrt(sx * sx + sy * sy);
      const val = mag > EDGE_THRESHOLD ? 255 : 0;
      o[idx] = val;
      o[idx + 1] = val;
      o[idx + 2] = val;
      o[idx + 3] = 255;
    }
  }

  edgeCtx.putImageData(out, 0, 0);
}

/* ---- Particle Behavior ---- */
function stepParticles(particles, canvas, edgeCtx, theme) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const { width: ew, height: eh } = edgeCtx.canvas;
  const edgeData = edgeCtx.getImageData(0, 0, ew, eh).data;

  for (let p of particles) {
    // Slight drift
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.x += p.vx;
    p.y += p.vy;

    // Occasionally re-attract to a random edge pixel
    if (Math.random() < 0.04) {
      const found = sampleEdge(edgeData, ew, eh);
      if (found) {
        const tx = (found.x / ew) * w;
        const ty = (found.y / eh) * h;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy) + 1;
        const f = 0.15;
        p.vx += (dx / dist) * f;
        p.vy += (dy / dist) * f;
      }
    }

    // keep inside bounds softly
    if (p.x < 0) p.x += w;
    if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y > h) p.y -= h;
    p.life += 0.01;
    if (p.life > 1) p.life = 0;
  }
}

function sampleEdge(edgeData, w, h) {
  for (let i = 0; i < 8; i++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const idx = (y * w + x) * 4;
    if (edgeData[idx] > 200) {
      return { x, y };
    }
  }
  return null;
}

/* ---- Draw Particles ---- */
function drawParticles(ctx, particles, theme) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";
  for (let p of particles) {
    const hue = theme.baseHue + (Math.sin(p.life * 12.6) * 20);
    const alpha = 0.4 + 0.4 * Math.sin(p.life * Math.PI * 2);
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${
      theme.saturation * 100
    }%, 70%, ${alpha})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
