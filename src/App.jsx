import React, { useRef, useState } from 'react';
import CameraFeed from './components/CameraFeed.jsx';
import ParticleCanvas from './components/ParticleCanvas.jsx';

const THEMES = {
  plasma: { baseHue: 200, saturation: 0.9, glow: 1.7 },
  ember:  { baseHue: 16,  saturation: 0.95, glow: 1.8 },
  neon:   { baseHue: 130, saturation: 1.0, glow: 1.6 },
  aurora: { baseHue: 260, saturation: 0.9, glow: 1.9 },
};

export default function App() {
  const videoRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [themeKey, setThemeKey] = useState('plasma');
  const [mirror, setMirror] = useState(true);

  return (
    <div className="app">
      <div className="badge">SuperParticle Vision · Prototype</div>

      <div className="video-wrap" style={{}}>
        <CameraFeed
          ref={videoRef}
          facingMode="user"
          mirror={mirror}
          onReady={() => setRunning(true)}
        />
      </div>

      <ParticleCanvas
        videoRef={videoRef}
        running={running}
        theme={THEMES[themeKey]}
        mirror={mirror}
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

        <small style={{ opacity: 0.8 }}>
          Tip: wave your hands — particles chase motion.
        </small>
      </div>

      <div className="hint">
        If camera doesn’t start on iOS, tap the page once and refresh (browser requires a user gesture).
      </div>
    </div>
  );
}
