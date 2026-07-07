import { writable } from "./index.js";
const _eqStateStore = writable({ gains: null, on: true, preset: "Custom" });
const _corsAvailableStore = writable(false);
const _cfOnStore = writable(
  typeof localStorage !== "undefined" ? localStorage.getItem("mbx_cf_v1") === "true" : false
);
const eqState = { subscribe: _eqStateStore.subscribe };
const corsAvailable = { subscribe: _corsAvailableStore.subscribe };
const crossfeedOn = { subscribe: _cfOnStore.subscribe };
const EQ_BANDS = [
  { freq: 32, type: "lowshelf", label: "32" },
  { freq: 64, type: "peaking", label: "64" },
  { freq: 125, type: "peaking", label: "125" },
  { freq: 250, type: "peaking", label: "250" },
  { freq: 500, type: "peaking", label: "500" },
  { freq: 1e3, type: "peaking", label: "1k" },
  { freq: 2e3, type: "peaking", label: "2k" },
  { freq: 4e3, type: "peaking", label: "4k" },
  { freq: 8e3, type: "peaking", label: "8k" },
  { freq: 16e3, type: "highshelf", label: "16k" }
];
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal: [-2, -2, 0, 2, 4, 4, 3, 1, 0, 0],
  treble: [0, 0, 0, 0, 0, 0, 2, 3, 4, 5],
  vshape: [4, 4, 2, 0, -2, -2, 0, 2, 4, 5],
  bollywood: [3, 5, 3, 1, 0, -1, 1, 3, 2, 2],
  punjabi: [5, 6, 4, 2, 0, -1, 0, 2, 3, 3],
  classical: [2, 2, 1, 0, -1, 0, 1, 2, 3, 4],
  podcast: [-3, -4, -2, 0, 3, 5, 4, 2, 0, -1],
  r_and_b: [2, 5, 4, 4, -1, -1, 2, 2, 3, 4]
  // 64Hz +7→+5, 125Hz +6→+4: ref Drake/SZA/Dua Lipa mixes
};
const EQ_KEY = "mbx_eq_v2";
const CF_KEY = "mbx_cf_v1";
const _EQ_DEFAULT = "[0,0,0,-1,0,0,2,3,2,1]";
(function _migrateEqGains() {
  if (typeof localStorage === "undefined") return;
  const stored = localStorage.getItem(EQ_KEY);
  if (stored) {
    try {
      const g = JSON.parse(stored);
      if (g.length !== 10) localStorage.removeItem(EQ_KEY);
    } catch {
      localStorage.removeItem(EQ_KEY);
    }
  }
})();
let _eqNodes = [];
let _eqGains = JSON.parse(typeof localStorage !== "undefined" && localStorage.getItem(EQ_KEY) || _EQ_DEFAULT);
let _eqOn = typeof localStorage !== "undefined" ? localStorage.getItem(EQ_KEY + "_on") !== "false" : true;
typeof localStorage !== "undefined" ? localStorage.getItem(CF_KEY) === "true" : false;
typeof localStorage !== "undefined" ? localStorage.getItem("mbx_ipod_mode") === "1" : false;
function setEqGain(bandIndex, dB) {
  _eqGains[bandIndex] = dB;
  _applyEqGains();
  _saveEqState();
  _pushEqState();
}
function _pushEqState(preset = null) {
  if (!preset) preset = _detectPreset();
  _eqStateStore.set({ gains: [..._eqGains], on: _eqOn, preset });
}
function _detectPreset() {
  for (const [name, gains] of Object.entries(EQ_PRESETS)) {
    if (gains.every((g, i) => Math.abs(g - _eqGains[i]) < 0.01)) return name;
  }
  return "Custom";
}
const _FIXED_POST_EQ_BOOST_DB = 1;
function _rampGain(param, target) {
  if (!param) return;
  param.value = target;
}
function _computeEqHeadroomGain() {
  (_eqOn ? Math.max(0, ..._eqGains) : 0) + _FIXED_POST_EQ_BOOST_DB;
}
function _applyEqGains() {
  _eqNodes.forEach((n, i) => {
    _rampGain(n.gain, _eqOn ? _eqGains[i] : 0);
  });
  _computeEqHeadroomGain();
}
function _saveEqState() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(EQ_KEY, JSON.stringify(_eqGains));
  localStorage.setItem(EQ_KEY + "_on", String(_eqOn));
}
const LOG_KEY = "mbx_logs";
const LOG_MAX = 400;
const GH_CFG_KEY = "mbx_ghcfg";
let _tick = 0;
const _tickListeners = /* @__PURE__ */ new Set();
const logTick = {
  subscribe(fn) {
    _tickListeners.add(fn);
    fn(_tick);
    return () => _tickListeners.delete(fn);
  },
  _notify() {
    _tick++;
    _tickListeners.forEach((fn) => fn(_tick));
  }
};
const Log = {
  _store: [],
  init(version) {
    try {
      this._store = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch {
      this._store = [];
    }
    this.info("App started", { version });
  },
  _write(level, msg, data) {
    const _scrub = (s) => typeof s === "string" ? s.replace(/(ghp_|github_pat_)[A-Za-z0-9_]+/g, "[REDACTED]") : s;
    const _scrubObj = (o) => o ? JSON.parse(JSON.stringify(o, (k, v) => _scrub(v))) : o;
    const entry = { ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg: _scrub(msg), data: _scrubObj(data || null) };
    this._store.push(entry);
    if (this._store.length > LOG_MAX) this._store.shift();
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(this._store));
    } catch {
    }
    logTick._notify();
    const fn = level === "ERROR" || level === "CRITICAL" ? "error" : "log";
    console[fn](`[MB:${level}]`, msg, ...data ? [data] : []);
  },
  info(msg, data) {
    this._write("INFO", msg, data);
  },
  warn(msg, data) {
    this._write("WARN", msg, data);
  },
  error(msg, data) {
    this._write("ERROR", msg, data);
  },
  critical(msg, data) {
    this._write("CRITICAL", msg, data);
  },
  all() {
    return [...this._store];
  },
  clear() {
    this._store = [];
    try {
      localStorage.removeItem(LOG_KEY);
    } catch {
    }
    logTick._notify();
  },
  count() {
    return this._store.length;
  }
};
function getGhCfg() {
  try {
    const legacy = localStorage.getItem(GH_CFG_KEY);
    if (legacy) {
      sessionStorage.setItem(GH_CFG_KEY, legacy);
      localStorage.removeItem(GH_CFG_KEY);
    }
    return JSON.parse(sessionStorage.getItem(GH_CFG_KEY) || "{}");
  } catch {
    return {};
  }
}
function persisted(key, defaultValue) {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  let initial;
  try {
    initial = stored !== null ? JSON.parse(stored) : defaultValue;
  } catch {
    initial = defaultValue;
  }
  const { subscribe, set, update } = writable(initial);
  return {
    subscribe,
    set(value) {
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
        }
      }
      set(value);
    },
    update(fn) {
      update((v) => {
        const next = fn(v);
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
          }
        }
        return next;
      });
    }
  };
}
function decodeHtml(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function fmt(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function bestImg(arr, size = "150x150") {
  if (!arr) return "";
  if (typeof arr === "string") return arr.replace(/\d+x\d+/, size);
  const sorted = [...arr].sort((a, b) => {
    const sizeOf = (u) => {
      const m = (u.link || u.url || u || "").match(/(\d+)x\d+/);
      return m ? parseInt(m[1]) : 0;
    };
    return sizeOf(b) - sizeOf(a);
  });
  const target = parseInt(size);
  const pick = sorted.find((u) => {
    const m = (u.link || u.url || u || "").match(/(\d+)x\d+/);
    return m && parseInt(m[1]) <= target * 2;
  }) || sorted[sorted.length - 1];
  return (pick?.link || pick?.url || pick || "").replace(/\d+x\d+/, size);
}
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
    return c.signal;
  };
}
const APP_VERSION = "5.2.75";
const ENV_KEY = "mbx_env";
const ENVS = {
  production: { sigma: "https://jiosaavn-api-sigma-sandy.vercel.app", saavn: "https://saavn.8man.dev" },
  staging: { sigma: "https://jiosaavn-api-sigma-sandy.vercel.app", saavn: "https://saavn.8man.dev" }
};
function getEnv() {
  return typeof localStorage !== "undefined" && localStorage.getItem(ENV_KEY) || "production";
}
function isStaging() {
  return getEnv() === "staging";
}
function getEnvCfg() {
  return ENVS[getEnv()] || ENVS.production;
}
let SIGMA_API = getEnvCfg().sigma;
getEnvCfg().saavn;
const ALLOWED_LANGUAGES = /* @__PURE__ */ new Set(["english", "hindi", "telugu", "tamil", "punjabi"]);
const LANG_TILES = [
  { lang: "hindi", label: "Hindi" },
  { lang: "english", label: "English" },
  { lang: "telugu", label: "Telugu" },
  { lang: "tamil", label: "Tamil" },
  { lang: "punjabi", label: "Punjabi" }
];
const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
];
async function proxyFetch(url) {
  let last;
  const deadline = AbortSignal.timeout(9e3);
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: deadline });
      if (r.ok) return r;
      last = new Error("proxy_" + r.status);
    } catch (e) {
      last = e;
      if (deadline.aborted) break;
    }
  }
  throw last || new Error("All proxies failed");
}
async function apiFetch(url, { timeout = 7e3, retries = 1 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (r.ok) return r;
      last = new Error("HTTP " + r.status);
    } catch (e) {
      last = e;
      if (i < retries) await new Promise((r) => setTimeout(r, (i + 1) * 1e3));
    }
  }
  throw last;
}
function detectScript(text) {
  if (!text) return null;
  if (/[ऀ-ॿ]/.test(text)) return "devanagari";
  if (/[ఀ-౿]/.test(text)) return "telugu";
  if (/[஀-௿]/.test(text)) return "tamil";
  if (/[਀-੿]/.test(text)) return "gurmukhi";
  return "latin";
}
function classifyLanguage(song) {
  const tag = (song.language || "").toLowerCase().trim();
  if (ALLOWED_LANGUAGES.has(tag)) return tag;
  const script = detectScript(song.name + " " + song.artist);
  if (tag) return script === "latin" ? "english" : null;
  if (script === "telugu") return "telugu";
  if (script === "tamil") return "tamil";
  if (script === "devanagari") return "hindi";
  if (script === "gurmukhi") return "punjabi";
  return script === "latin" ? "english" : null;
}
function safeDuration(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function filterByLanguage(songs, activeLang = "") {
  if (activeLang === "english") return songs.filter((s) => s._lang === "english" || s._lang === null);
  if (activeLang) return songs.filter((s) => s._lang === activeLang);
  return songs.filter((s) => s._lang === null || s._lang && ALLOWED_LANGUAGES.has(s._lang));
}
function normSigmaSong(s) {
  const pa = s.primaryArtists;
  let artist = Array.isArray(pa) ? pa.map((a) => a.name || "").filter(Boolean).join(", ") : decodeHtml(pa || "");
  if (!artist) artist = decodeHtml(s.artistMap?.primary?.[0]?.name || "");
  let featured = "";
  if (s.featuredArtists) {
    featured = Array.isArray(s.featuredArtists) ? s.featuredArtists.map((a) => a.name || "").filter(Boolean).join(", ") : decodeHtml(s.featuredArtists || "");
  }
  const song = {
    id: s.id,
    name: decodeHtml(s.name || s.title || ""),
    artist,
    album: decodeHtml(s.album?.name || s.album || ""),
    language: s.language || "",
    image: bestImg(s.image, "150x150"),
    duration: safeDuration(s.duration),
    // S4.1 Quick Wins: Untapped metadata
    year: s.year ? parseInt(s.year, 10) : null,
    explicit: s.explicitContent === 1 || s.explicitContent === "1",
    featured: featured || null,
    url: s.url || null,
    popularity: {
      plays: parseInt(s.playCount, 10) || 0,
      views: parseInt(s.viewCount, 10) || 0
    },
    available: s.hasAvailableUrl !== false,
    // Default true if field not present
    // S4.2: Availability & geo — region lock detection
    availableCountries: s.availableCountries || s.availableTerritories || null
  };
  song._lang = classifyLanguage(song);
  return song;
}
async function _searchFallback(q, limit = 20) {
  const r = await proxyFetch(
    `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(q)}&_format=json&_marker=0&ctx=wap6dot0`
  );
  if (!r.ok) return [];
  const data = await r.json();
  return (data?.songs?.data || []).slice(0, limit).map((s) => ({
    id: s.id,
    name: decodeHtml(s.title || ""),
    artist: decodeHtml(s.more_info?.primary_artists || s.more_info?.singers || ""),
    album: decodeHtml(s.album || ""),
    image: (s.image || "").replace("50x50", "150x150"),
    duration: safeDuration(s.more_info?.duration),
    // S4.1: Fallback search also includes metadata when available
    year: s.more_info?.year ? parseInt(s.more_info.year, 10) : null,
    explicit: s.more_info?.explicit_content === "1" || s.more_info?.explicit_content === 1,
    featured: decodeHtml(s.more_info?.featured_artists || "") || null,
    url: s.more_info?.song_link || s.url || null,
    popularity: {
      plays: 0,
      // Fallback doesn't have play counts
      views: 0
    },
    available: true,
    // Assume available in fallback
    availableCountries: s.more_info?.availableCountries || null,
    _lang: null
  }));
}
async function searchSongs(q, limit = 20) {
  try {
    const r = await apiFetch(`${SIGMA_API}/search/songs?query=${encodeURIComponent(q)}&page=1&limit=${limit}`, { timeout: 7e3, retries: 1 });
    const data = await r.json();
    const results = data.data?.results;
    if (data.status === "SUCCESS" && results?.length) return results.map(normSigmaSong);
  } catch (e) {
    Log.warn("searchSongs: sigma failed, using fallback", { q, err: e?.message });
  }
  return _searchFallback(q, limit);
}
async function fetchArtistSongs(artistName, limit = 30) {
  return searchSongs(artistName, limit);
}
const streamCache = /* @__PURE__ */ new Map();
const _streamInflight = /* @__PURE__ */ new Map();
const QUALITY_RANK = { "320kbps": 5, "160kbps": 4, "96kbps": 3, "48kbps": 2, "12kbps": 1 };
function getNetworkQuality() {
  const c = navigator.connection;
  if (!c) return "320kbps";
  if (c.saveData) return "96kbps";
  const t = c.effectiveType;
  if (t === "slow-2g" || t === "2g") return "96kbps";
  if (t === "3g" || c.downlink > 0 && c.downlink < 1.5) return "160kbps";
  return "320kbps";
}
async function fetchStream(id) {
  const r = await fetch(`${SIGMA_API}/songs?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(1e4) });
  if (!r.ok) throw new Error("SIGMA stream HTTP " + r.status);
  const data = await r.json();
  const song = Array.isArray(data?.data) ? data.data[0] : null;
  if (!song) throw new Error("No song in SIGMA response");
  const targetTier = QUALITY_RANK[getNetworkQuality()];
  const urls = (song.downloadUrl || []).slice().sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0));
  const best = urls.find((u) => (QUALITY_RANK[u.quality] || 0) <= targetTier) || urls[urls.length - 1];
  if (!best?.link) throw new Error("No stream link in SIGMA response");
  return { url: best.link, quality: best.quality, image: bestImg(song.image, "500x500"), duration: parseInt(song.duration || 0) };
}
async function apiStream(id) {
  if (streamCache.has(id)) {
    const cached = streamCache.get(id);
    if (Date.now() - (cached._fetchedAt || 0) < 12 * 60 * 1e3) {
      streamCache.delete(id);
      streamCache.set(id, cached);
      return cached;
    }
    streamCache.delete(id);
  }
  if (_streamInflight.has(id)) return _streamInflight.get(id);
  const p = (async () => {
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await fetchStream(id);
        result._fetchedAt = Date.now();
        streamCache.set(id, result);
        if (streamCache.size > 15) streamCache.delete(streamCache.keys().next().value);
        return result;
      } catch (e) {
        lastErr = e;
        Log.warn("Stream attempt failed", { id, attempt, err: e.message });
        if (attempt < 2) await new Promise((r) => setTimeout(r, attempt * 1e3));
      }
    }
    throw lastErr;
  })().finally(() => _streamInflight.delete(id));
  _streamInflight.set(id, p);
  return p;
}
const _modulesCache = /* @__PURE__ */ new Map();
async function fetchModules(language = "hindi") {
  const key = `mod_${language}`;
  const cached = _modulesCache.get(key);
  if (cached && Date.now() - cached._ts < 5 * 60 * 1e3) return cached.data;
  try {
    const r = await apiFetch(`${SIGMA_API}/modules?language=${encodeURIComponent(language)}`, { timeout: 8e3, retries: 1 });
    const data = await r.json();
    if (data.status === "SUCCESS") {
      _modulesCache.set(key, { data: data.data, _ts: Date.now() });
      if (_modulesCache.size > 10) _modulesCache.delete(_modulesCache.keys().next().value);
      return data.data;
    }
  } catch (e) {
    Log.warn("fetchModules failed", { language, err: e.message });
  }
  return null;
}
async function fetchCharts(language = "hindi") {
  try {
    const modules = await fetchModules(language);
    return modules?.charts || [];
  } catch (e) {
    Log.warn("fetchCharts failed", { language, err: e.message });
  }
  return [];
}
async function fetchFeaturedPlaylists(language = "hindi") {
  try {
    const r = await apiFetch(`${SIGMA_API}/featured-playlists?page=1&n=20&language=${encodeURIComponent(language)}`, { timeout: 8e3, retries: 1 });
    const data = await r.json();
    if (data.status === "SUCCESS") {
      const list = Array.isArray(data.data) ? data.data : data.data?.playlists || data.data?.results || [];
      return list.map((pl) => ({
        id: pl.id,
        name: decodeHtml(pl.name || pl.title || ""),
        subtitle: pl.subtitle || (pl.songCount ? `${pl.songCount} songs` : ""),
        image: bestImg(pl.image, "150x150")
      }));
    }
  } catch (e) {
    Log.warn("fetchFeaturedPlaylists failed", { language, err: e.message });
  }
  return [];
}
const nowSong = writable(null);
const queue = writable([]);
const qIdx = writable(0);
const playing = writable(false);
const userPaused = writable(false);
const shuffleOn = writable(false);
const repeatMode = writable(0);
const seeking = writable(false);
const loadingUrl = writable(false);
const seekProgress = writable(0);
const duration = writable(0);
const currentTime = writable(0);
const offlineBlobUrl = writable(null);
const activeTab = writable("search");
const npOpen = writable(false);
const eqSheetOpen = writable(false);
const queueOpen = writable(false);
const sheetOpen = writable(false);
const promptOpen = writable(false);
const toastMsg = writable(null);
const isOnline = writable(true);
const sheetData = writable({ title: "", actions: [] });
const promptData = writable({ title: "", value: "", onOk: null });
const updateAvailable = writable(null);
function _loadElder() {
  try {
    return localStorage.getItem("mbx_elder") === "1";
  } catch {
    return false;
  }
}
const elderView = writable(_loadElder());
elderView.subscribe((v) => {
  try {
    localStorage.setItem("mbx_elder", v ? "1" : "0");
  } catch {
  }
  if (typeof document !== "undefined") {
    document.body.classList.toggle("elder-view", v);
  }
});
function _loadIpodMode() {
  try {
    return localStorage.getItem("mbx_ipod_mode") === "1";
  } catch {
    return false;
  }
}
const iPodMode = writable(_loadIpodMode());
iPodMode.subscribe((v) => {
  try {
    localStorage.setItem("mbx_ipod_mode", v ? "1" : "0");
  } catch {
  }
  if (typeof document !== "undefined") {
    document.body.classList.toggle("ipod-mode", v);
  }
});
let _toastTimer = null;
function toast(msg, duration2 = 2800) {
  toastMsg.set(msg);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toastMsg.set(null), duration2);
}
function showSheet(title, actions) {
  sheetData.set({ title, actions });
  sheetOpen.set(true);
}
persisted("mbx_smartplay_on", true);
const smartQueueActive = writable(false);
const whyChip = writable(null);
const playlists = persisted("mbx_playlists", []);
const downloadedIds = writable(/* @__PURE__ */ new Set());
const liked = persisted("mbx_liked_v2", []);
const library = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  downloadedIds,
  liked,
  playlists
}, Symbol.toStringTag, { value: "Module" }));
export {
  APP_VERSION as $,
  toastMsg as A,
  sheetOpen as B,
  sheetData as C,
  promptData as D,
  EQ_BANDS as E,
  promptOpen as F,
  updateAvailable as G,
  userPaused as H,
  offlineBlobUrl as I,
  iPodMode as J,
  elderView as K,
  Log as L,
  filterByLanguage as M,
  fetchArtistSongs as N,
  searchSongs as O,
  showSheet as P,
  toast as Q,
  apiStream as R,
  playlists as S,
  decodeHtml as T,
  LANG_TILES as U,
  fetchModules as V,
  fetchCharts as W,
  fetchFeaturedPlaylists as X,
  logTick as Y,
  crossfeedOn as Z,
  getGhCfg as _,
  isStaging as a,
  setEqGain as a0,
  library as a1,
  playing as b,
  corsAvailable as c,
  currentTime as d,
  seekProgress as e,
  fmt as f,
  npOpen as g,
  liked as h,
  isOnline as i,
  duration as j,
  seeking as k,
  loadingUrl as l,
  downloadedIds as m,
  nowSong as n,
  eqState as o,
  persisted as p,
  eqSheetOpen as q,
  repeatMode as r,
  shuffleOn as s,
  queue as t,
  queueOpen as u,
  qIdx as v,
  whyChip as w,
  bestImg as x,
  smartQueueActive as y,
  activeTab as z
};
