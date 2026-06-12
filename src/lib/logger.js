// Logger — extracted from index.html
const LOG_KEY     = 'mbx_logs';
const LOG_MAX     = 400;
const GH_REPO     = 'Suman8055/musicplayer';
const GH_LOG_PATH = 'logs/musicplayer-log.json';
const GH_CFG_KEY  = 'mbx_ghcfg';

// Lightweight observable tick — no svelte/store import so logger stays SSR-safe
let _tick = 0;
const _tickListeners = new Set();
export const logTick = {
  subscribe(fn) { _tickListeners.add(fn); fn(_tick); return () => _tickListeners.delete(fn); },
  _notify()     { _tick++; _tickListeners.forEach(fn => fn(_tick)); },
};

export const Log = {
  _store: [],
  init(version) {
    try { this._store = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { this._store = []; }
    this.info('App started', { version });
  },
  _write(level, msg, data) {
    const entry = { ts: new Date().toISOString(), level, msg, data: data || null };
    this._store.push(entry);
    if (this._store.length > LOG_MAX) this._store.shift();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(this._store)); } catch {}
    logTick._notify();
    const fn = (level === 'ERROR' || level === 'CRITICAL') ? 'error' : 'log';
    console[fn](`[MB:${level}]`, msg, ...(data ? [data] : []));
  },
  info(msg, data)     { this._write('INFO', msg, data); },
  warn(msg, data)     { this._write('WARN', msg, data); },
  error(msg, data)    { this._write('ERROR', msg, data); },
  critical(msg, data) { this._write('CRITICAL', msg, data); },
  all()               { return [...this._store]; },
  clear()             { this._store = []; try { localStorage.removeItem(LOG_KEY); } catch {} logTick._notify(); },
  count()             { return this._store.length; },
};

// PAT stored in sessionStorage (not localStorage) — cleared on tab close, never persists
// across sessions. Reduces XSS credential-theft window vs localStorage.
export function getGhCfg() {
  try {
    // Migrate any PAT left in localStorage from prior versions
    const legacy = localStorage.getItem(GH_CFG_KEY);
    if (legacy) {
      sessionStorage.setItem(GH_CFG_KEY, legacy);
      localStorage.removeItem(GH_CFG_KEY);
    }
    return JSON.parse(sessionStorage.getItem(GH_CFG_KEY) || '{}');
  } catch { return {}; }
}
export function saveGhCfg(cfg) {
  try {
    // PAT lives in sessionStorage only — non-PAT state (lastUpload, lastStatus) is safe in localStorage
    const { pat, ...meta } = cfg;
    if (pat) sessionStorage.setItem(GH_CFG_KEY, JSON.stringify(cfg));
    else sessionStorage.setItem(GH_CFG_KEY, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(GH_CFG_KEY) || '{}'), ...meta }));
    localStorage.removeItem(GH_CFG_KEY); // ensure old key is always cleared
  } catch {}
}

export async function uploadLogsToGithub(silent = false, toastFn) {
  const cfg = getGhCfg();
  const pat = cfg.pat;
  if (!pat) { if (!silent) toastFn?.('No GitHub token — save one in Settings'); return; }
  const logs = Log.all();
  if (!logs.length) { if (!silent) toastFn?.('No logs to upload'); return; }
  try {
    let sha;
    const getR = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${GH_LOG_PATH}`,
      { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' } }
    ).catch(() => null);
    if (getR?.ok) { const j = await getR.json(); sha = j.sha; }
    const payload = { uploadedAt: new Date().toISOString(), device: navigator.userAgent.slice(0, 200), entries: logs };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
    const body = { message: `logs: ${new Date().toISOString().slice(0, 16)} (${logs.length} entries)`, content, ...(sha ? { sha } : {}) };
    const putR = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_LOG_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${cfg.pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!putR.ok) throw new Error('HTTP ' + putR.status);
    cfg.lastUpload = new Date().toISOString();
    cfg.lastStatus = `OK — ${logs.length} entries`;
    saveGhCfg(cfg);
    if (!silent) toastFn?.('Logs uploaded to GitHub');
  } catch (e) {
    cfg.lastStatus = 'Failed: ' + e.message;
    saveGhCfg(cfg);
    if (!silent) toastFn?.('Upload failed: ' + e.message);
  }
}
