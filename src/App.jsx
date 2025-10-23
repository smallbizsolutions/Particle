import React, { useRef, useState } from 'react';
import CameraFeed from './components/CameraFeed.jsx';
import ParticleCanvas from './components/ParticleCanvas.jsx';

const THEMES = {
  plasma: { baseHue: 200, saturation: 0.9, glow: 1.4 },
  ember:  { baseHue: 16,  saturation: 0.95, glow: 1.5 },
  neon:   { baseHue: 130, saturation: 1.0, glow: 1.3 },
  aurora: { baseHue: 260, saturation: 0.9, glow: 1.5 },
};

export default function App() {
  const videoRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [themeKey, setThemeKey] = useState('plasma');
  const [mirror, setMirror] = useState(true);
  const [intensity, setIntensity] = useState(1);
  const [trailEffect, setTrailEffect] = useState(true);
  const [maskCanvas, setMaskCanvas] = useState(null);

  return (
    <div className="app">
      <div className="badge">SuperParticle Vision · Edge Aura</div>

      <div className="video-wrap">
        <CameraFeed
          ref={videoRef}
          facingMode="user"
          mirror={mirror}
          onReady={() => setRunning(true)}
          onMaskReady={setMaskCanvas}
        />
      </div>

      <ParticleCanvas
        videoRef={videoRef}
        running={running}
        theme={THEMES[themeKey]}
        mirror={mirror}
        maskCanvas={maskCanvas}
        intensity={intensity}
        trailEffect={trailEffect}
      />

      <div className="panel">
        <button onClick={() => setMirror(m => !m)}>
          {mirror ? '🪞 Unmirror' : '🪞 Mirror'}
        </button>

        <label>
          <span style={{ fontSize: '11px', opacity: 0.7, marginRight: '4px' }}>Theme</span>
          <select value={themeKey} onChange={e => setThemeKey(e.target.value)}>
            {Object.keys(THEMES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>
            Intensity: {intensity.toFixed(1)}x
          </span>
          <input 
            type="range" 
            min="0.3" 
            max="2" 
            step="0.1" 
            value={intensity}
            onChange={e => setIntensity(+e.target.value)}
            style={{ width: '100%' }}
          />
        </label>

        <button 
          onClick={() => setTrailEffect(t => !t)}
          style={{ fontSize: '11px' }}
        >
          {trailEffect ? '✨ Trails On' : '○ Trails Off'}
        </button>

        <small style={{ opacity: 0.85, marginLeft: '8px' }}>
          Wave your hands near the camera
        </small>
      </div>

      <div className="hint">
        If the camera doesn't start on iOS, tap once then refresh (browser gesture requirement).
      </div>
    </div>
  );
}
