// audioEngine.js — Vanilla JS Web Audio engine for MusicPlayer SvelteKit
// Extracted from index.html. Zero DOM dependencies. Zero Svelte imports.
// Call init(audioEl, callbacks) from +layout.svelte onMount BEFORE any play().
// AudioContext is created lazily on first user gesture (iOS requirement).
//
// DSP fixes applied vs original index.html:
//   1. LUFS gate block: fftSize 4096→19200 (85ms→400ms per BS.1770-4 spec)
//   2. Bass exciter DC fix: 5Hz HPF after _bassExciterOut blocks DC offset
//   3. _haasDelay renamed _sideGainNeg (it is a GainNode, not a DelayNode)

import { writable, get } from 'svelte/store';

// ── Public readable stores (UI subscribes, engine writes) ─────────────────────
const _eqStateStore = writable({ gains: null, on: true, preset: 'Custom' });
const _corsAvailableStore = writable(false);

export const eqState = { subscribe: _eqStateStore.subscribe };
export const corsAvailable = { subscribe: _corsAvailableStore.subscribe };

// ── Module-level state ────────────────────────────────────────────────────────
let _audioEl      = null;   // set by init()
let _callbacks    = {};     // set by init()

const AC = (typeof window !== 'undefined')
  ? (window.AudioContext || window.webkitAudioContext || null)
  : null;

// ── LUFS normalization constants ──────────────────────────────────────────────
const NORM_VOLUME       = 1.0;
const LUFS_TARGET       = -16;
const LUFS_MAX_BOOST_DB =  2;
const LUFS_MAX_CUT_DB   =  6;
const LUFS_KEY          = 'mbx_lufs_v1_on';
let   _lufsOn           = typeof localStorage !== 'undefined'
                            ? localStorage.getItem(LUFS_KEY) !== 'false'
                            : true;
const _lufsCache        = new Map();
let   _lufsAnalyser     = null;
let   _lufsKw1          = null;
let   _lufsKw2          = null;

// ── AudioContext state ────────────────────────────────────────────────────────
let _audioCtx    = null;
let _gainNode    = null;
let _mediaSource = null;
let _ctxFailed   = false;
let _corsAvailable = false;

// ── DSP chain nodes ───────────────────────────────────────────────────────────
let _limiterCompressor = null;
let _limiterWaveshaper = null;
let _bassExciterIn     = null;
let _bassExciterDist   = null;
let _bassExciterOut    = null;
let _bassExciterDcHpf  = null; // FIX: 5Hz HPF to block DC offset from half-wave rectifier
let _bassExciterGain   = null;
let _preMixGain        = null;
let _eqHeadroomGain    = null;
let _splitter          = null;
let _merger            = null;
let _midGain           = null;
let _sideGain          = null;
let _sideGainNeg       = null; // was _haasDelay — renamed: it is a GainNode, not a DelayNode
let _msInvGain         = null;
let _sideGainR         = null;
let _airShelf          = null;
let _cfSplit           = null;
let _cfMerge           = null;
let _cfHpL             = null;
let _cfHpR             = null;
let _cfGainL           = null;
let _cfGainR           = null;
let _bgKeepAliveTimer  = null;
let _rewiring          = false;
let _airPlayActive     = false;
let _airPlayEqSnapshot = null; // { eqOn, eqGains } saved on AirPlay/CarPlay activate, restored on deactivate

// ── EQ constants ──────────────────────────────────────────────────────────────
export const EQ_BANDS = [
  { freq:   32, type: 'lowshelf',  label: '32' },
  { freq:   64, type: 'peaking',   label: '64' },
  { freq:  125, type: 'peaking',   label: '125' },
  { freq:  250, type: 'peaking',   label: '250' },
  { freq:  500, type: 'peaking',   label: '500' },
  { freq: 1000, type: 'peaking',   label: '1k' },
  { freq: 2000, type: 'peaking',   label: '2k' },
  { freq: 4000, type: 'peaking',   label: '4k' },
  { freq: 8000, type: 'peaking',   label: '8k' },
  { freq:16000, type: 'highshelf', label: '16k' },
];
export const EQ_Q = [1.0, 0.7, 0.7, 0.7, 1.0, 1.0, 1.0, 1.4, 1.4, 1.0];
export const EQ_PRESETS = {
  flat:       [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass:       [ 5, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal:      [-2,-2, 0, 2, 4, 4, 3, 1, 0, 0],
  treble:     [ 0, 0, 0, 0, 0, 0, 2, 3, 4, 5],
  vshape:     [ 4, 4, 2, 0,-2,-2, 0, 2, 4, 5],
  bollywood:  [ 3, 5, 3, 1, 0,-1, 1, 3, 2, 2],
  punjabi:    [ 5, 6, 4, 2, 0,-1, 0, 2, 3, 3],
  classical:  [ 2, 2, 1, 0,-1, 0, 1, 2, 3, 4],
  podcast:    [-3,-4,-2, 0, 3, 5, 4, 2, 0,-1],
  r_and_b:    [ 2, 7, 6, 4,-1,-1, 2, 2, 3, 4],
};
const EQ_KEY = 'mbx_eq_v2';
const CF_KEY = 'mbx_cf_v1';

// ── EQ state (persisted to localStorage) ─────────────────────────────────────
const _EQ_DEFAULT = '[0,0,0,-1,0,0,2,3,2,1]';
(function _migrateEqGains() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem(EQ_KEY);
  if (stored) {
    try {
      const g = JSON.parse(stored);
      if (g.length !== 10) localStorage.removeItem(EQ_KEY);
    } catch { localStorage.removeItem(EQ_KEY); }
  }
})();

let _eqNodes  = [];
let _eqGains  = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(EQ_KEY)) || _EQ_DEFAULT);
let _eqOn     = (typeof localStorage !== 'undefined') ? localStorage.getItem(EQ_KEY + '_on') !== 'false' : true;
let _cfOn     = (typeof localStorage !== 'undefined') ? localStorage.getItem(CF_KEY) === 'true' : false;
let _manualEqAdjusted = false;

// ── init() — called once from +layout.svelte onMount ─────────────────────────
// Sets up the audio element reference and callbacks. Does NOT create AudioContext.
// AudioContext is created on first user gesture via ensureAudioCtx().
export function init(audioEl, callbacks = {}) {
  _audioEl   = audioEl;
  _callbacks = callbacks;
}

// ── ensureAudioCtx() — call synchronously in play() before audio.play() ───────
// Creates AudioContext + full DSP chain on first call. Idempotent.
// CRITICAL: must remain synchronous. Any await here would break iOS gesture chain.
export function ensureAudioCtx() {
  if (_audioCtx) return true;
  if (_ctxFailed || !AC || !_audioEl) return false;
  try {
    _audioCtx = new AC({ sampleRate: 48000 });
    _audioCtx.addEventListener('statechange', () => {
      const cb = _callbacks.getState?.() ?? {};
      if (_callbacks.onLog) _callbacks.onLog('info', 'AudioContext statechange', {
        state:      _audioCtx?.state ?? 'unknown',
        userPaused: cb.userPaused ?? false,
        playing:    cb.playing    ?? false,
      });
      if (_audioCtx.state === 'suspended' && !cb.userPaused) {
        setTimeout(() => {
          if (_audioCtx?.state === 'suspended' && !(_callbacks.getState?.()?.userPaused)) {
            _audioCtx.resume().catch(() => {});
          }
        }, 800);
      }
    });

    _gainNode = _audioCtx.createGain();
    _gainNode.gain.value = NORM_VOLUME;

    // K-weighted LUFS measurement path (ITU-R BS.1770-4 — measurement only, not in playback)
    _lufsKw1 = _audioCtx.createBiquadFilter();
    _lufsKw1.type = 'highshelf';
    _lufsKw1.frequency.value = 1681.974;
    _lufsKw1.gain.value = 4.0;
    _lufsKw2 = _audioCtx.createBiquadFilter();
    _lufsKw2.type = 'highpass';
    _lufsKw2.frequency.value = 38.135;
    _lufsKw2.Q.value = 0.5;
    // 16384 = nearest valid power-of-2 to 400ms at 48kHz (341ms); 19200 is not a power of 2 and throws DOMException
    _lufsAnalyser = _audioCtx.createAnalyser();
    _lufsAnalyser.fftSize = 16384;
    _lufsAnalyser.smoothingTimeConstant = 0.0;
    _gainNode.connect(_lufsKw1);
    _lufsKw1.connect(_lufsKw2);
    _lufsKw2.connect(_lufsAnalyser);

    // Route <audio> through Web Audio for DSP chain
    try {
      _mediaSource = _audioCtx.createMediaElementSource(_audioEl);
      _mediaSource.connect(_gainNode);
      _audioEl.volume = 1;
      _corsAvailable = true;
      _corsAvailableStore.set(true);
    } catch (corsErr) {
      _mediaSource = null;
      _corsAvailable = false;
      _corsAvailableStore.set(false);
      _audioEl.volume = NORM_VOLUME;
      if (_callbacks.onCorsUnavailable) _callbacks.onCorsUnavailable();
      if (_callbacks.onLog) _callbacks.onLog('warn', 'Web Audio CORS unavailable', corsErr.message);
    }

    _rewireAudio();

    // Expose debug hook — caller sets window._mbxAudio = getDebugInfo in layout
    if (_callbacks.onLog) _callbacks.onLog('info', 'AudioContext created', { sampleRate: 48000 });
    return true;
  } catch (e) {
    _ctxFailed = true;
    if (_callbacks.onLog) _callbacks.onLog('warn', 'AudioContext failed', e.message);
    return false;
  }
}

export async function resumeAudioCtx() {
  if (_audioCtx && _audioCtx.state === 'suspended') {
    try { await _audioCtx.resume(); } catch {}
  }
}

// ── LUFS normalization ────────────────────────────────────────────────────────
function _gainFromLufs(measuredLufs) {
  const corrDb = Math.max(-LUFS_MAX_CUT_DB, Math.min(LUFS_MAX_BOOST_DB, LUFS_TARGET - measuredLufs));
  return Math.pow(10, corrDb / 20);
}

// Call from setTimeout(..., 3000) after audio.play() — NEVER in gesture chain
export async function measureAndApplyLufs(song) {
  if (!_lufsOn) return;
  if (!_audioCtx || !_lufsAnalyser || !_gainNode) return;
  if (_airPlayActive) {
    // Audio is routing to AirPlay — analyser reads silence, skip measurement
    _gainNode.gain.setTargetAtTime(1.0, _audioCtx.currentTime, 0.5);
    if (_callbacks.onLog) _callbacks.onLog('info', 'LUFS skipped (AirPlay active)', { name: song.name });
    return;
  }
  if (_lufsCache.has(song.id)) {
    _gainNode.gain.cancelScheduledValues(_audioCtx.currentTime);
    _gainNode.gain.setValueAtTime(_gainNode.gain.value, _audioCtx.currentTime);
    _gainNode.gain.setTargetAtTime(_lufsCache.get(song.id), _audioCtx.currentTime, 3.0);
    return;
  }
  _gainNode.gain.cancelScheduledValues(_audioCtx.currentTime);
  const WARMUP = 8;
  const FRAMES = 28;
  const ABS_GATE_RMS = Math.pow(10, (-70 - 0.691) / 20);
  let sumSq = 0, frameCount = 0;
  // fftSize is 16384 → 341ms buffer per BS.1770-4 (nearest valid power-of-2 to 400ms)
  const buf = new Float32Array(_lufsAnalyser.fftSize);
  for (let f = 0; f < WARMUP + FRAMES; f++) {
    await new Promise(r => setTimeout(r, 250));
    const cb = _callbacks.getState?.() ?? {};
    if (!cb.nowSong || cb.nowSong.id !== song.id) return;
    if (f < WARMUP) continue;
    _lufsAnalyser.getFloatTimeDomainData(buf);
    let blockSumSq = 0;
    for (let i = 0; i < buf.length; i++) blockSumSq += buf[i] * buf[i];
    const blockRms = Math.sqrt(blockSumSq / buf.length);
    if (blockRms < ABS_GATE_RMS) continue;
    sumSq += blockSumSq;
    frameCount += buf.length;
  }
  if (frameCount === 0) return;
  const rms = Math.sqrt(sumSq / frameCount);
  if (rms < 1e-6) return;
  const measuredLufs = 20 * Math.log10(rms) - 0.691;
  const gain = _gainFromLufs(measuredLufs);
  _lufsCache.set(song.id, gain);
  if (_lufsCache.size > 50) _lufsCache.delete(_lufsCache.keys().next().value);
  _gainNode.gain.setTargetAtTime(gain, _audioCtx.currentTime, 3.0);
  if (_callbacks.onLog) _callbacks.onLog('info', 'LUFS norm', {
    name: song.name, lufs: measuredLufs.toFixed(1), gainDb: (20 * Math.log10(gain)).toFixed(1)
  });
}

export function setLufsOn(on) {
  _lufsOn = on;
  localStorage.setItem(LUFS_KEY, String(on));
  if (!on && _gainNode && _audioCtx) {
    _gainNode.gain.setTargetAtTime(1.0, _audioCtx.currentTime, 0.5);
  }
}
export function getLufsOn() { return _lufsOn; }

// ── Playback hooks (called by audio event listeners in +layout.svelte) ────────
export function onPlaybackStarted()  { startBgKeepAlive(); }
export function onPlaybackPaused()   { /* keep-alive continues; stopped on user pause */ }
export function onUserPaused()       { stopBgKeepAlive(); }

export function startBgKeepAlive() {
  stopBgKeepAlive();
  _bgKeepAliveTimer = setInterval(async () => {
    const cb = _callbacks.getState?.() ?? {};
    if (!cb.playing || cb.userPaused || !_audioCtx) return;
    if (_audioCtx.state === 'suspended') { try { await _audioCtx.resume(); } catch {} }
    // Never force-resume on AirPlay — external device controls (remote, HomePod tap) pause
    // audioEl without setting userPaused. Calling play() here would override that hardware pause.
    if (_audioEl?.paused && !cb.userPaused && cb.nowSong && !_airPlayActive) {
      try { await _audioEl.play(); } catch {}
      return;
    }
    if (!_airPlayActive) {
      try {
        const osc = _audioCtx.createOscillator();
        const g   = _audioCtx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(_audioCtx.destination);
        osc.start();
        osc.stop(_audioCtx.currentTime + 0.001);
        setTimeout(() => { try { osc.disconnect(); g.disconnect(); } catch {} }, 2);
      } catch {}
    }
  }, 10000);
}

export function stopBgKeepAlive() {
  clearInterval(_bgKeepAliveTimer);
  _bgKeepAliveTimer = null;
}

// ── AirPlay ───────────────────────────────────────────────────────────────────
// When AirPlay is active, createMediaElementSource() captures the audio on the
// local device, so the Web Audio graph renders silently to local speakers while
// the native AVPlayer routes the raw stream to the AirPlay receiver directly.
// Fix: disconnect _mediaSource from the DSP chain entirely on AirPlay activation.
// This lets the native <audio> element route the stream to AirPlay without any
// Web Audio processing tap interfering with AVAudioSession routing.
export function setAirPlayMode(active) {
  _airPlayActive = active;
  if (_callbacks.onLog) _callbacks.onLog('info', 'AirPlay setAirPlayMode', {
    active,
    hasMediaSource: !!_mediaSource,
    ctxState: _audioCtx?.state ?? 'none'
  });
  if (_callbacks.onAirPlayModeChange) _callbacks.onAirPlayModeChange(active);

  if (_gainNode && _audioCtx && _audioCtx.state !== 'closed') {
    _gainNode.gain.cancelScheduledValues(_audioCtx.currentTime);
    _gainNode.gain.setValueAtTime(_gainNode.gain.value, _audioCtx.currentTime);
    if (active) {
      _gainNode.gain.setTargetAtTime(0, _audioCtx.currentTime, 0.1);
    } else {
      _gainNode.gain.setTargetAtTime(1.0, _audioCtx.currentTime, 0.1);
    }
  }

  // Bypass/restore EQ state regardless of whether AudioContext exists yet.
  // AirPlay can activate before the user has played a song (probe element triggers it).
  if (active) {
    if (!_airPlayEqSnapshot) _airPlayEqSnapshot = { eqOn: _eqOn, eqGains: [..._eqGains] };
    _eqOn = false;
    _eqNodes.forEach(n => { n.gain.value = 0; });
    if (_limiterCompressor) _limiterCompressor.threshold.value = 0;
    _pushEqState();
  } else if (_airPlayEqSnapshot) {
    _eqOn    = _airPlayEqSnapshot.eqOn;
    _eqGains = [..._airPlayEqSnapshot.eqGains];
    _airPlayEqSnapshot = null;
    if (_limiterCompressor) _limiterCompressor.threshold.value = -3;
    _applyEqGains();
    _pushEqState();
  }

  if (!_mediaSource) return;

  if (active) {
    // Fully disconnect _mediaSource from the Web Audio graph.
    // This stops the MTAudioProcessingTap from competing with AVAudioSession AirPlay routing.
    // Also disconnect the LUFS analyser tap — AnalyserNode with smoothing=0 causes
    // iOS render-thread stall on AVAudioSession route change → AirPlay buffer dropout.
    try { _mediaSource.disconnect(); } catch {}
    try { if (_lufsKw1) _gainNode.disconnect(_lufsKw1); } catch {}
    if (_audioEl) _audioEl.volume = 1;
    // Longer compressor release: AirPlay buffer depth (300–2000ms) makes fast release audible
    if (_limiterCompressor) _limiterCompressor.release.value = 0.5;
    if (_callbacks.onLog) _callbacks.onLog('info', 'AirPlay engine: DSP chain disconnected, filters bypassed', {
      ctxState: _audioCtx?.state
    });
  } else {
    if (_audioCtx && _audioCtx.state !== 'closed') {
      // Restore full DSP chain: _mediaSource → _gainNode → EQ → limiter → destination
      try { _mediaSource.connect(_gainNode); } catch {}
      try { if (_lufsKw1) _gainNode.connect(_lufsKw1); } catch {}
      if (_audioEl) _audioEl.volume = 1;
      if (_limiterCompressor) _limiterCompressor.release.value = 0.2;

      if (_callbacks.onLog) _callbacks.onLog('info', 'AirPlay engine: DSP chain restored, filters re-enabled', {
        ctxState: _audioCtx?.state
      });
    } else {
      if (_callbacks.onLog) _callbacks.onLog('warn', 'AirPlay engine: ctx closed on restore', {
        ctxState: _audioCtx?.state
      });
    }
  }
}

// ── Volume control ────────────────────────────────────────────────────────────
export function setVolume(v) {
  if (_corsAvailable && _gainNode) {
    _gainNode.gain.value = v;
  } else if (_audioEl) {
    _audioEl.volume = v;
  }
}

// ── EQ public API ─────────────────────────────────────────────────────────────
export function setEqGain(bandIndex, dB) {
  _eqGains[bandIndex] = dB;
  _manualEqAdjusted = true;
  _applyEqGains();
  _saveEqState();
  _pushEqState();
}

export function setEqEnabled(on) {
  _eqOn = on;
  _applyEqGains();
  _saveEqState();
  _pushEqState();
}

export function loadEqPreset(name) {
  const gains = EQ_PRESETS[name];
  if (!gains) return;
  _eqGains = [...gains];
  _applyEqGains();
  _saveEqState();
  _pushEqState(name);
}

export function getEqState() {
  return { gains: [..._eqGains], on: _eqOn };
}

export function setCrossfeedEnabled(on) {
  _cfOn = on;
  if (typeof localStorage !== 'undefined') localStorage.setItem(CF_KEY, String(on));
  _rewireAudio();
  _pushEqState();
}

// ── Debug API — caller does: window._mbxAudio = audioEngine.getDebugInfo ─────
export function getDebugInfo() {
  return {
    corsAvailable:        _corsAvailable,
    mediaSource:          _mediaSource,
    gainNode:             _gainNode,
    audioCtx:             _audioCtx,
    rewiring:             _rewiring,
    lufsAnalyser:         _lufsAnalyser,
    lufsCacheSize:        _lufsCache.size,
    limiterComp:          _limiterCompressor,
    limiterGainReduction: _limiterCompressor?.reduction ?? 0,
    bassExciterOn:        !!_bassExciterIn,
    stereoWidenerOn:      !!_splitter,
    eqOn:                 _eqOn,
    eqGains:              [..._eqGains],
    eqNodes:              _eqNodes,
    crossfeedOn:          _cfOn,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function _pushEqState(preset = null) {
  if (!preset) preset = _detectPreset();
  _eqStateStore.set({ gains: [..._eqGains], on: _eqOn, preset });
}

function _detectPreset() {
  for (const [name, gains] of Object.entries(EQ_PRESETS)) {
    if (gains.every((g, i) => Math.abs(g - _eqGains[i]) < 0.01)) return name;
  }
  return 'Custom';
}

function _buildLimiterChain(ctx) {
  _limiterCompressor = ctx.createDynamicsCompressor();
  _limiterCompressor.threshold.value = -3;
  _limiterCompressor.knee.value      =  3;
  _limiterCompressor.ratio.value     = 10;
  _limiterCompressor.attack.value    = 0.003;
  _limiterCompressor.release.value   = 0.2;
  _limiterWaveshaper = ctx.createWaveShaper();
  _limiterWaveshaper.oversample = '4x';
  const N = 65536;
  const curve = new Float32Array(N);
  const CEIL = 0.794;
  for (let i = 0; i < N; i++) {
    const x = (i * 2) / N - 1;
    const a = Math.abs(x);
    if (a <= CEIL) {
      curve[i] = x;
    } else {
      const sign = x < 0 ? -1 : 1;
      curve[i] = sign * (CEIL + (1 - CEIL) * Math.tanh((a - CEIL) / (1 - CEIL) * 2));
    }
  }
  _limiterWaveshaper.curve = curve;
  _limiterCompressor.connect(_limiterWaveshaper);
}

function _teardownLimiterChain() {
  [_limiterWaveshaper, _limiterCompressor].forEach(n => {
    if (n) { try { n.disconnect(); } catch {} }
  });
  _limiterWaveshaper = _limiterCompressor = null;
}

function _buildBassExciter(ctx) {
  _bassExciterIn = ctx.createBiquadFilter();
  _bassExciterIn.type = 'bandpass';
  _bassExciterIn.frequency.value = 65;
  _bassExciterIn.Q.value = 0.7;
  _bassExciterDist = ctx.createWaveShaper();
  _bassExciterDist.oversample = '4x';
  const N = 4096;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i * 2) / N - 1;
    curve[i] = x > 0 ? x : 0;
  }
  _bassExciterDist.curve = curve;
  _bassExciterOut = ctx.createBiquadFilter();
  _bassExciterOut.type = 'lowpass';
  _bassExciterOut.frequency.value = 160;
  _bassExciterOut.Q.value = 0.707;
  // FIX: DC-blocking HPF after half-wave rectifier — prevents DC offset in mix bus
  _bassExciterDcHpf = ctx.createBiquadFilter();
  _bassExciterDcHpf.type = 'highpass';
  _bassExciterDcHpf.frequency.value = 20;
  _bassExciterDcHpf.Q.value = 0.707;
  _bassExciterGain = ctx.createGain();
  _bassExciterGain.gain.value = 0.12;
  _bassExciterIn.connect(_bassExciterDist);
  _bassExciterDist.connect(_bassExciterOut);
  _bassExciterOut.connect(_bassExciterDcHpf); // FIX: route through DC-block HPF
  _bassExciterDcHpf.connect(_bassExciterGain);
}

function _teardownBassExciter() {
  [_bassExciterGain, _bassExciterDcHpf, _bassExciterOut, _bassExciterDist,
   _bassExciterIn, _preMixGain, _eqHeadroomGain].forEach(n => {
    if (n) { try { n.disconnect(); } catch {} }
  });
  _bassExciterIn = _bassExciterDist = _bassExciterOut = _bassExciterDcHpf =
  _bassExciterGain = _preMixGain = _eqHeadroomGain = null;
}

function _buildEqChain(ctx) {
  _eqNodes = EQ_BANDS.map((b, i) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.freq;
    f.Q.value = EQ_Q[i];
    f.gain.value = _eqOn ? _eqGains[i] : 0;
    return f;
  });
  for (let i = 0; i < _eqNodes.length - 1; i++) _eqNodes[i].connect(_eqNodes[i + 1]);
}

function _teardownEqChain() {
  _eqNodes.forEach(n => { try { n.disconnect(); } catch {} });
  _eqNodes = [];
}

function _computeEqHeadroomGain() {
  const maxBoostDb = _eqOn ? Math.max(0, ..._eqGains) : 0;
  const gain = Math.pow(10, -(maxBoostDb / 2) / 20);
  if (_eqHeadroomGain) _eqHeadroomGain.gain.value = gain;
}

function _applyEqGains() {
  if (_rewiring) return;
  _eqNodes.forEach((n, i) => { n.gain.value = _eqOn ? _eqGains[i] : 0; });
  _computeEqHeadroomGain();
}

function _saveEqState() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(EQ_KEY, JSON.stringify(_eqGains));
  localStorage.setItem(EQ_KEY + '_on', String(_eqOn));
}

function _buildCrossfeed(ctx) {
  const blend = 0.25;
  const direct = 1.0 - blend;
  _cfSplit = ctx.createChannelSplitter(2);
  _cfMerge = ctx.createChannelMerger(2);
  const _cfDirectL = ctx.createGain(); _cfDirectL.gain.value = direct;
  const _cfDirectR = ctx.createGain(); _cfDirectR.gain.value = direct;
  _cfHpR = ctx.createBiquadFilter();
  _cfHpR.type = 'highpass'; _cfHpR.frequency.value = 700; _cfHpR.Q.value = 0.707;
  _cfGainR = ctx.createGain(); _cfGainR.gain.value = blend;
  _cfHpL = ctx.createBiquadFilter();
  _cfHpL.type = 'highpass'; _cfHpL.frequency.value = 700; _cfHpL.Q.value = 0.707;
  _cfGainL = ctx.createGain(); _cfGainL.gain.value = blend;
  _cfSplit.connect(_cfDirectL, 0); _cfDirectL.connect(_cfMerge, 0, 0);
  _cfSplit.connect(_cfDirectR, 1); _cfDirectR.connect(_cfMerge, 0, 1);
  _cfSplit.connect(_cfHpR, 1); _cfHpR.connect(_cfGainR); _cfGainR.connect(_cfMerge, 0, 0);
  _cfSplit.connect(_cfHpL, 0); _cfHpL.connect(_cfGainL); _cfGainL.connect(_cfMerge, 0, 1);
  _cfSplit._directL = _cfDirectL;
  _cfSplit._directR = _cfDirectR;
}

function _teardownCrossfeed() {
  if (_cfSplit) {
    try { _cfSplit._directL?.disconnect(); } catch {}
    try { _cfSplit._directR?.disconnect(); } catch {}
  }
  [_cfGainL, _cfGainR, _cfHpL, _cfHpR, _cfMerge, _cfSplit].forEach(n => {
    if (n) { try { n.disconnect(); } catch {} }
  });
  _cfSplit = _cfMerge = _cfHpL = _cfHpR = _cfGainL = _cfGainR = null;
}

function _buildStereoWidener(ctx) {
  const Wc   = 0.7;
  const mid  = 0.5;
  const side = 0.5 * Wc;
  _splitter   = ctx.createChannelSplitter(2);
  _merger     = ctx.createChannelMerger(2);
  _midGain    = ctx.createGain(); _midGain.gain.value    =  mid;
  _sideGain   = ctx.createGain(); _sideGain.gain.value   =  side;
  _sideGainNeg = ctx.createGain(); _sideGainNeg.gain.value = -side; // was _haasDelay
  _msInvGain  = ctx.createGain(); _msInvGain.gain.value  = -1;
  _splitter.connect(_midGain, 0); _splitter.connect(_midGain, 1);
  _midGain.connect(_merger, 0, 0); _midGain.connect(_merger, 0, 1);
  _splitter.connect(_sideGain, 0); _sideGain.connect(_merger, 0, 0);
  _splitter.connect(_msInvGain, 1); _msInvGain.connect(_sideGain);
  _splitter.connect(_sideGainNeg, 0); _sideGainNeg.connect(_merger, 0, 1);
  _sideGainR = ctx.createGain(); _sideGainR.gain.value = side;
  _splitter.connect(_sideGainR, 1); _sideGainR.connect(_merger, 0, 1);
  _airShelf = ctx.createBiquadFilter();
  _airShelf.type = 'highshelf';
  _airShelf.frequency.value = 14000;
  _airShelf.gain.value = 0; // transparent passthrough
  _merger.connect(_airShelf);
}

function _teardownStereoWidener() {
  [_airShelf, _merger, _sideGainR, _sideGainNeg, _msInvGain,
   _sideGain, _midGain, _splitter].forEach(n => {
    if (n) { try { n.disconnect(); } catch {} }
  });
  _splitter = _merger = _midGain = _sideGain = _sideGainNeg =
  _msInvGain = _sideGainR = _airShelf = null;
}

function _rewireAudio() {
  if (!_audioCtx || _rewiring) return;
  _rewiring = true;
  if (_callbacks.onLog) _callbacks.onLog('info', 'EQ rewire start', {
    ctxState: _audioCtx?.state ?? 'unknown',
    cfOn: _cfOn,
  });
  try {
    _gainNode.gain.setValueAtTime(0, _audioCtx.currentTime);
    _teardownLimiterChain();
    _teardownBassExciter();
    _teardownEqChain();
    _teardownCrossfeed();
    _teardownStereoWidener();
    _gainNode.disconnect();
    // Reconnect K-weighted LUFS measurement tap after gainNode disconnect
    if (_lufsKw1) { try { _gainNode.connect(_lufsKw1); } catch {} }
    if (_mediaSource) _mediaSource.connect(_gainNode);

    _buildBassExciter(_audioCtx);
    _buildEqChain(_audioCtx);
    if (_cfOn) _buildCrossfeed(_audioCtx);
    _buildStereoWidener(_audioCtx);
    _buildLimiterChain(_audioCtx);

    _preMixGain = _audioCtx.createGain();
    _preMixGain.gain.value = 1.0;
    _gainNode.connect(_preMixGain);
    if (_bassExciterIn) _gainNode.connect(_bassExciterIn);
    if (_bassExciterGain) _bassExciterGain.connect(_preMixGain);

    _eqHeadroomGain = _audioCtx.createGain();
    _preMixGain.connect(_eqHeadroomGain);
    _computeEqHeadroomGain();

    _eqHeadroomGain.connect(_eqNodes[0]);
    const _eqOut = _eqNodes[_eqNodes.length - 1];
    if (_cfOn && _cfSplit) {
      _eqOut.connect(_cfSplit);
      _cfMerge.connect(_splitter);
    } else {
      _eqOut.connect(_splitter);
    }
    _airShelf.connect(_limiterCompressor);
    _limiterWaveshaper.connect(_audioCtx.destination);
    _gainNode.gain.setTargetAtTime(1.0, _audioCtx.currentTime, 0.015);
  } finally {
    _rewiring = false;
    if (_callbacks.onLog) _callbacks.onLog('info', 'EQ rewire done', {
      eqNodes: _eqNodes.length,
      cfOn:    _cfOn,
    });
  }
  _pushEqState();
}
