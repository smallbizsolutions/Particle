import React, { useEffect, useRef } from 'react';

const BASE_PARTICLE_COUNT = 1600;
const SIZE_MIN = 0.8;
const SIZE_MAX = 1.8;

const EDGE_THRESHOLD = 60;
const EDGE_SMOOTH = 0.65;
const STICK_FORCE = 0.45;
const TANGENTIAL_JITTER = 0.4;
const DRAG = 0.88;
const SPEED_THRESHOLD = 3;

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default function ParticleCanvas({ 
  videoRef, 
  running, 
  theme, 
  mirror, 
  maskCanvas,
  intensity = 1,
  trailEffect = true
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const edgeFieldRef = useRef(null);
  const smoothMagRef = useRef(null);
  const edgeUpdateCounter = useRef(0);
  const prevPosRef = useRef(new Map());
  const debugRef = useRef({ hasEdges: false, particleCount: 0 });

  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.floor(BASE_PARTICLE_COUNT * intensity * (isMobile ? 0.6 : 1));
    particlesRef.current = initParticles(count, canvas);
    debugRef.current.particleCount = count;

    let frameCount = 0;

    const loop = () => {
      frameCount++;
      
      if (maskCanvas) {
        if (edgeUpdateCounter.current++ % 2 === 0) {
          const field = computeEdgeField(
            maskCanvas, 
            EDGE_THRESHOLD, 
            edgeFieldRef.current, 
            smoothMagRef.current
          );
          edgeFieldRef.current = field;
          smoothMagRef.current = field.mag;
          debugRef.current.hasEdges = field.edgeCount > 0;
        }
        
        if (edgeFieldRef.current) {
          stepParticles(
            particlesRef.current, 
            canvas, 
            edgeFieldRef.current,
            prevPosRef.current
          );
        }
      } else {
        driftParticles(particlesRef.current, canvas);
      }
      
      drawParticles(ctx, particlesRef.current, theme, trailEffect);
      
      if (frameCount % 60 === 0) {
        console.log('Particle Debug:', {
          hasEdges: debugRef.current.hasEdges,
          particleCount: particlesRef.current.length,
          firstParticle: particlesRef.current[0] ? 
            `(${particlesRef.current[0].x.toFixed(1)}, ${particlesRef.current[0].y.toFixed(1)})` : 'none'
        });
      }
      
      rafRef.current = requestAnimationFrame(loop);
    };
    
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [running, theme, maskCanvas, intensity, trailEffect]);

  return (
    <canvas 
      ref={canvasRef} 
      className="particles" 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none'
      }} 
    />
  );
}

function initParticles(count, canvas) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const arr = [];
  
  for (let i = 0; i < count; i++) {
    arr.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN),
      baseSize: SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN),
      life: Math.random(),
      hueOffset: (Math.random() - 0.5) * 20
    });
  }
  
  return arr;
}

function computeEdgeField(maskCanvas, threshold, prevField, prevMagShared) {
  const w = maskCanvas.width, h = maskCanvas.height;
  const ctx = maskCanvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h).data;

  const mag = new Float32Array(w * h);
  const gxF = new Float32Array(w * h);
  const gyF = new Float32Array(w * h);
  let edgeCount = 0;

  const at = (x, y) => {
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    const i = (y * w + x) * 4;
    return img[i];
  };

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
      const ml = at(x - 1, y),                        mr = at(x + 1, y);
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);

      const sx = (tr + 2*mr + br) - (tl + 2*ml + bl);
      const sy = (bl + 2*bc + br) - (tl + 2*tc + tr);
      const g = Math.sqrt(sx * sx + sy * sy) / 4;

      const idx = y * w + x;
      let m = g > threshold ? g : 0;

      if (prevMagShared && prevMagShared.length === mag.length) {
        m = prevMagShared[idx] * EDGE_SMOOTH + m * (1 - EDGE_SMOOTH);
      }

      if (m > 0) edgeCount++;
      
      mag[idx] = m;
      gxF[idx] = sx;
      gyF[idx] = sy;
    }
  }

  return { w, h, mag, gx: gxF, gy: gyF, edgeCount };
}

function stepParticles(particles, canvas, field, prevPosMap) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const { w, h, mag, gx, gy } = field;

  const samples = [];
  const sampleCount = Math.min(800, Math.floor(w * h * 0.02));
  
  for (let i = 0; i < sampleCount; i++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    const idx = y * w + x;
    if (mag[idx] > 0) {
      samples.push({ x, y, idx, strength: mag[idx] });
    }
  }

  const scaleX = W / w, scaleY = H / h;

  for (let p of particles) {
    const oldPos = prevPosMap.get(p) || { x: p.x, y: p.y };
    
    if (samples.length > 0) {
      let best = null, bestD = Infinity;
      const checkCount = Math.min(5, samples.length);
      
      for (let k = 0; k < checkCount; k++) {
        const s = samples[Math.floor(Math.random() * samples.length)];
        const tx = s.x * scaleX, ty = s.y * scaleY;
        const dx = tx - p.x, dy = ty - p.y;
        const d2 = dx*dx + dy*dy;
        
        if (d2 < bestD) {
          bestD = d2;
          best = { tx, ty, idx: s.idx, strength: s.strength };
        }
      }

      if (best) {
        const dx = best.tx - p.x, dy = best.ty - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > 1) {
          const force = STICK_FORCE * (best.strength / 100);
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        const gxv = gx[best.idx], gyv = gy[best.idx];
        const glen = Math.hypot(gxv, gyv) || 1;
        const tx = -gyv / glen, ty = gxv / glen;
        const jitter = (Math.random() - 0.5) * TANGENTIAL_JITTER;
        
        p.vx += tx * jitter;
        p.vy += ty * jitter;
      }
    }

    p.vx *= DRAG;
    p.vy *= DRAG;

    p.x += p.vx;
    p.y += p.vy;

    const speed = Math.hypot(p.x - oldPos.x, p.y - oldPos.y);
    
    if (speed > SPEED_THRESHOLD) {
      const boost = Math.min(speed / 15, 1.5);
      p.size = p.baseSize * (1 + boost * 0.5);
    } else {
      p.size = p.size * 0.95 + p.baseSize * 0.05;
    }

    if (p.x < -10) p.x = W + 10;
    else if (p.x > W + 10) p.x = -10;
    if (p.y < -10) p.y = H + 10;
    else if (p.y > H + 10) p.y = -10;

    p.life += 0.008 + Math.random() * 0.004;
    if (p.life > 1) p.life = 0;

    prevPosMap.set(p, { x: p.x, y: p.y });
  }
}

function driftParticles(particles, canvas) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  
  for (let p of particles) {
    p.vx += (Math.random() - 0.5) * 0.1;
    p.vy += (Math.random() - 0.5) * 0.1;
    p.vx *= 0.95;
    p.vy *= 0.95;
    
    p.x += p.vx;
    p.y += p.vy;
    
    if (p.x < 0) p.x = W;
    else if (p.x > W) p.x = 0;
    if (p.y < 0) p.y = H;
    else if (p.y > H) p.y = 0;
    
    p.life += 0.01;
    if (p.life > 1) p.life = 0;
  }
}

function drawParticles(ctx, particles, theme, trailEffect) {
  const { width, height } = ctx.canvas;
  
  if (trailEffect) {
    ctx.fillStyle = 'rgba(11, 11, 18, 0.2)';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }
  
  ctx.globalCompositeOperation = 'lighter';

  for (let p of particles) {
    const hue = theme.baseHue + Math.sin(p.life * Math.PI * 2) * 16 + p.hueOffset;
    const brightness = 65 + Math.sin(p.life * Math.PI * 4) * 10;
    const alpha = 0.5 + 0.3 * Math.sin(p.life * Math.PI * 2);
    
    const glowSize = p.size * 2.5 * theme.glow;
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
    gradient.addColorStop(0, `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, ${brightness}%, ${alpha})`);
    gradient.addColorStop(0.5, `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, ${brightness}%, ${alpha * 0.4})`);
    gradient.addColorStop(1, `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, ${brightness}%, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(p.x - glowSize, p.y - glowSize, glowSize * 2, glowSize * 2);
    
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, ${Math.round(theme.saturation * 100)}%, ${brightness + 10}%, ${alpha * 1.2})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}
