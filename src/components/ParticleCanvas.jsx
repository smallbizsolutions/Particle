import React, { useEffect, useRef } from 'react';

/**
 * ParticleCanvas
 * - Renders additive-blend particles on a full-screen canvas.
 * - Computes a motion heatmap via frame differencing on a small buffer.
 * - Particles are attracted to "hot" cells (moving areas = your hands/body).
 */

const PARTICLE_COUNT = 800;
const HEAT_W = 96;     // small buffer for motion analysis
const HEAT_H = 54;     // keep 16:9-ish for speed
const DIFF_THRESHOLD = 24; // motion sensitivity (0-255)
const HEAT_DECAY = 0.92;   // how fast motion heat fades
const SPAWN_BIAS = 0.7;    // probability to respawn near a hot cell

export default function ParticleCanvas({ videoRef, running, theme, mirror }) {
  const canvasRef = useRef(null);
  const heatRef = useRef(null);
  const prevFrameRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });

    // HiDPI canvas setup
    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onResize = () => resize();
    resize();
    window.addEventListener('resize', onResize);

    // motion buffers
    const heatCanvas = document.createElement('canvas');
    heatCanvas.width = HEAT_W;
    heatCanvas.height = HEAT_H;
    const heatCtx = heatCanvas.getContext('2d');

    heatRef.current = heatCtx;
    prevFrameRef.current = heatCtx.createImageData(HEAT_W, HEAT_H);

    // particles
    particlesRef.current = initParticles(PARTICLE_COUNT, canvas);

    // render loop
    const loop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        updateHeat(heatCtx, prevFrameRef, video, mirror);
        stepParticles(particlesRef.current, canvas, heatCtx, theme);
        drawParticles(ctx, particlesRef.current, theme);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [running, theme, mirror, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="particles"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ---- Helpers ----

function initParticles(count, canvas) {
  const arr = new Array(count).fill(0).map(() => ({
    x: Math.random() * canvas.clientWidth,
    y: Math.random() * canvas.clientHeight,
    vx: (Math.random() - 0.5) * 0.2,
    vy: (Math.random() - 0.5) * 0.2,
    life: Math.random() * 1,
    size: 1 + Math.random() * 2,
  }));
  return arr;
}

function updateHeat(heatCtx, prevFrameRef, video, mirror) {
  // draw current video frame into small buffer
  const { width: w, height: h } = heatCtx.canvas;
  // drawVideoFrame mirrored or not
  heatCtx.save();
  if (mirror) {
    heatCtx.translate(w, 0);
    heatCtx.scale(-1, 1);
  }
  heatCtx.drawImage(video, 0, 0, w, h);
  heatCtx.restore();

  const cur = heatCtx.getImageData(0, 0, w, h);
  const prev = prevFrameRef.current;

  const cd = cur.data;
  const pd = prev.data;

  // compute grayscale difference -> write back into cur as heat
  for (let i = 0; i < cd.length; i += 4) {
    const cr = cd[i], cg = cd[i + 1], cb = cd[i + 2];
    const pr = pd[i], pg = pd[i + 1], pb = pd[i + 2];

    const cgGray = (cr * 0.299 + cg * 0.587 + cb * 0.114);
    const pvGray = (pr * 0.299 + pg * 0.587 + pb * 0.114);

    let diff = Math.abs(cgGray - pvGray);

    // threshold + decay the existing heat
    const old = cd[i]; // reuse red channel as heat accumulator
    const heat = Math.max(0, Math.max(old * HEAT_DECAY, diff - DIFF_THRESHOLD));

    cd[i] = heat;      // R = heat
    cd[i + 1] = 0;     // G
    cd[i + 2] = 0;     // B
    cd[i + 3] = 255;   // A
  }

  // write heat back & clone for next frame
  heatCtx.putImageData(cur, 0, 0);
  prevFrameRef.current = cur; // keep current as previous for next cycle
}

function sampleHotspot(heatCtx) {
  const { width: w, height: h } = heatCtx.canvas;
  const { data } = heatCtx.getImageData(0, 0, w, h);
  let tries = 16;
  while (tries-- > 0) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const idx = (y * w + x) * 4;
    if (data[idx] > 12) {
      return { x, y, heat: data[idx] };
    }
  }
  return null;
}

function stepParticles(particles, canvas, heatCtx, theme) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  for (let p of particles) {
    // occasional respawn near a hot cell (keeps the effect lively)
    if (Math.random() < 0.005) {
      if (Math.random() < SPAWN_BIAS) {
        const hot = sampleHotspot(heatCtx);
        if (hot) {
          p.x = (hot.x / heatCtx.canvas.width) * w;
          p.y = (hot.y / heatCtx.canvas.height) * h;
          p.vx = (Math.random() - 0.5) * 0.2;
          p.vy = (Math.random() - 0.5) * 0.2;
        } else {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
        }
      } else {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
      }
      p.life = Math.random();
      p.size = 1 + Math.random() * 2.5;
    }

    // steer toward nearest hot cell
    const hot = sampleHotspot(heatCtx);
    if (hot) {
      const tx = (hot.x / heatCtx.canvas.width) * w;
      const ty = (hot.y / heatCtx.canvas.height) * h;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy) + 0.001;
      const force = Math.min(0.15, (hot.heat / 255) * 0.12);
      p.vx += (dx / dist) * force;
      p.vy += (dy / dist) * force;
    }

    // mild drag
    p.vx *= 0.985;
    p.vy *= 0.985;

    // move
    p.x += p.vx;
    p.y += p.vy;

    // wrap edges softly
    if (p.x < -10) p.x = w + 10;
    if (p.x > w + 10) p.x = -10;
    if (p.y < -10) p.y = h + 10;
    if (p.y > h + 10) p.y = -10;

    // life cycles for subtle twinkle
    p.life += 0.006 + Math.random() * 0.004;
    if (p.life > 1) p.life = 0;
  }
}

function drawParticles(ctx, particles, theme) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  // add glow: draw faint background veil
  ctx.globalCompositeOperation = 'lighter';

  for (let p of particles) {
    const flicker = 0.6 + 0.4 * Math.sin(p.life * Math.PI * 2);
    const hue = theme.baseHue + (Math.sin(p.life * 6.283 + p.x * 0.002) * 20);
    const alpha = 0.05 + 0.35 * flicker;

    // glow ring
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, 60%, ${alpha})`;
    ctx.arc(p.x, p.y, p.size * 6 * theme.glow, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, 75%, ${Math.min(0.9, alpha + 0.1)})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}
