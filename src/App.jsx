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
  const [maskCanvas, setMaskCanvas] = useState(null); // <-- segmentation mask canvas

  return (
    <div className="app">
      <div className="badge">SuperParticle Vision · Edge Aura</div>

      <div className="video-wrap">
        <CameraFeed
          ref={videoRef}
          facingMode="user"
          mirror={mirror}
          onReady={() => setRunning(true)}
          onMaskReady={setMaskCanvas}   // <-- receive mask canvas
        />
      </div>

      <ParticleCanvas
        videoRef={videoRef}
        running={running}
        theme={THEMES[themeKey]}
        mirror={mirror}
        maskCanvas={maskCanvas}        // <-- pass mask canvas to particles
      />

      <div className="panel">
        <button onClick={() => setMirror(m => !m)}>
          {mirror ? 'Unmirror' : 'Mirror'}
        </button>

        <label>
          <select value={themeKey} onChange={e => setThemeKey(e.target.value)}>
            {Object.keys(THEMES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>

        <small style={{ opacity: 0.85 }}>Particles cling to your outline. Try waving fingers close to camera.</small>
      </div>

      <div className="hint">
        If the camera doesn’t start on iOS, tap once then refresh (browser gesture requirement).
      </div>
    </div>
  );
}
