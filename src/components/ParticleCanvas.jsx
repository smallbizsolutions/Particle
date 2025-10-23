import React, { useEffect, useRef } from 'react';

/**
 * Reads the segmentation mask from CameraFeed (maskCanvas),
 * extracts the outline via Sobel, and pins micro-particles to that edge.
 */

const PARTICLE_COUNT = 1600;
const SIZE_MIN = 0.6;
const SIZE_MAX = 1.2;

const EDGE_THRESHOLD = 80;     // higher => thinner outline
const EDGE_SMOOTH = 0.7;       // temporal smoothing of edge map (0..1)
const STICK_FORCE = 0.55;      // how strongly particles snap to nearest edge point
const TANGENTIAL_JITTER = 0.35;// shimmer along edge tangent
const DRAG = 0.9;

export default function ParticleCanvas({ videoRef, running, theme, mirror, maskCanvas }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const edgeFieldRef = useRef(null);   // {w,h,mag, gx, gy} in small mask space
  const smoothMagRef = useRef(null);

  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });

    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    particlesRef.current = initParticles(PARTICLE_COUNT, canvas);

    const loop = () => {
      if (maskCanvas) {
        const field = computeEdgeField(maskCanvas, EDGE_THRESHOLD, edgeFieldRef.current, smoothMagRef.current);
        edgeFieldRef.current = field;
        smoothMagRef.current = field.mag; // share reference for next frame smoothing
        stepParticles(particlesRef.current, canvas, field);
        drawParticles(ctx, particlesRef.current, theme);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [running, theme, maskCanvas]);

  return <canvas ref={canvasRef} className="particles" style={{ width: '100%', height: '100%' }} />;
}

/* ---------------- Helpers ---------------- */

function initParticles(count, canvas) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const arr = new Array(count).fill(0).map(() => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: 0, vy: 0,
    size: SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN),
    life: Math.random()
  }));
  return arr;
}

/**
 * Compute Sobel edges of the mask and (optionally) temporal smooth the magnitude.
 * Returns { w, h, mag (Float32Array), gx, gy } in maskCanvas resolution.
 */
function computeEdgeField(maskCanvas, threshold, prevField, prevMagShared) {
  const w = maskCanvas.width, h = maskCanvas.height;
  const ctx = maskCanvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h).data;

  const mag = new Float32Array(w * h);
  const gxF = new Float32Array(w * h);
  const gyF = new Float32Array(w * h);

  const at = (x, y) => {
    if (x < 0) x = 0; if (x >= w) x = w - 1;
    if (y < 0) y = 0; if (y >= h) y = h - 1;
    const i = (y * w + x) * 4;
    // mask is binarized; use red channel
    return img[i]; // 0 or 255
  };

  // Sobel
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
      const ml = at(x - 1, y),     mc = at(x, y),     mr = at(x + 1, y);
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);

      const sx = (tr + 2*mr + br) - (tl + 2*ml + bl);
      const sy = (bl + 2*bc + br) - (tl + 2*tc + tr);
      const g = Math.sqrt(sx * sx + sy * sy) / 4; // normalize a bit

      const idx = y * w + x;
      let m = g;
      // threshold edges
      m = m > threshold ? m : 0;

      // temporal smoothing on magnitude only (keeps outline stable)
      if (prevMagShared && prevMagShared.length === mag.length) {
        m = prevMagShared[idx] * EDGE_SMOOTH + m * (1 - EDGE_SMOOTH);
      }

      mag[idx] = m;
      gxF[idx] = sx;
      gyF[idx] = sy;
    }
  }

  return { w, h, mag, gx: gxF, gy: gyF };
}

/**
 * Move particles to the nearest strong edge, then jitter along the edge tangent.
 */
function stepParticles(particles, canvas, field) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const { w, h, mag, gx, gy } = field;

  // Precompute a few random strong edge samples for guidance
  const samples = [];
  for (let i = 0; i < 600; i++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const idx = y * w + x;
    if (mag[idx] > 0) samples.push({ x, y, idx });
  }

  // Helper: map mask coords to screen
  const scaleX = W / w, scaleY = H / h;

  for (let p of particles) {
    // If we have some samples, steer to the nearest of a few attempts
    let best = null, bestD = 1e9;
    for (let k = 0; k < 3; k++) {
      const s = samples[(Math.random() * samples.length) | 0];
      if (!s) break;
      const tx = s.x * scaleX, ty = s.y * scaleY;
      const dx = tx - p.x, dy = ty - p.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; best = { tx, ty, idx: s.idx }; }
    }

    if (best) {
      // Stick toward the edge point
      const dx = best.tx - p.x, dy = best.ty - p.y;
      p.vx = p.vx * DRAG + dx * STICK_FORCE * 0.05;
      p.vy = p.vy * DRAG + dy * STICK_FORCE * 0.05;

      // Tangent shimmer (perpendicular to gradient)
      const gxv = gx[best.idx], gyv = gy[best.idx];
      const glen = Math.hypot(gxv, gyv) || 1;
      // Edge tangent vector is perpendicular to gradient:
      const tx = -gyv / glen, ty = gxv / glen;
      const jitter = (Math.random() - 0.5) * TANGENTIAL_JITTER;
      p.vx += tx * jitter * 0.6;
      p.vy += ty * jitter * 0.6;
    } else {
      // No edges detected (rare): gentle fade toward center
      p.vx *= DRAG; p.vy *= DRAG;
    }

    // Advance
    p.x += p.vx;
    p.y += p.vy;

    // Constrain softly to screen
    if (p.x < 0) p.x = 0; else if (p.x > W) p.x = W;
    if (p.y < 0) p.y = 0; else if (p.y > H) p.y = H;

    // Tiny life tick (for color flicker)
    p.life += 0.01 + Math.random() * 0.005;
    if (p.life > 1) p.life = 0;
  }
}

function drawParticles(ctx, particles, theme) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  for (let p of particles) {
    const hue = theme.baseHue + Math.sin(p.life * 6.283) * 14;
    const alpha = 0.45 + 0.35 * Math.sin(p.life * 12.566);
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, 70%, ${alpha})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}
