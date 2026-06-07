// api.js — JioSaavn API layer. Extracted from index.html.
// CORS rules: SIGMA_API is open. SAAVN_API has NO CORS — never use for browser fetches.
import { decodeHtml, bestImg } from './utils.js';
import { Log } from './logger.js';

export const APP_VERSION = '5.2.6';
export const STORE_KEY   = 'mbx_v2';
export const ENV_KEY     = 'mbx_env';
export const DES_KEY     = '38346591';

const ENVS = {
  production: { sigma: 'https://jiosaavn-api-sigma-sandy.vercel.app', saavn: 'https://saavn.8man.dev' },
  staging:    { sigma: 'https://jiosaavn-api-sigma-sandy.vercel.app', saavn: 'https://saavn.8man.dev' },
};

export function getEnv()    { return (typeof localStorage !== 'undefined' && localStorage.getItem(ENV_KEY)) || 'production'; }
export function isStaging() { return getEnv() === 'staging'; }
export function getEnvCfg() { return ENVS[getEnv()] || ENVS.production; }
export function setEnv(env) { if (typeof localStorage !== 'undefined') localStorage.setItem(ENV_KEY, env); }

export let SIGMA_API = getEnvCfg().sigma;
export let SAAVN_API = getEnvCfg().saavn; // NO CORS — never use for browser fetches

export const ALLOWED_LANGUAGES = new Set(['english', 'hindi', 'telugu', 'tamil', 'punjabi']);

export const LANG_TILES = [
  { lang: 'hindi',   label: 'Hindi' },
  { lang: 'english', label: 'English' },
  { lang: 'telugu',  label: 'Telugu' },
  { lang: 'tamil',   label: 'Tamil' },
  { lang: 'punjabi', label: 'Punjabi' },
];

// CORS proxies for JioSaavn autocomplete fallback only
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

export async function proxyFetch(url) {
  let last;
  const deadline = AbortSignal.timeout(9000);
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: deadline });
      if (r.ok) return r;
      last = new Error('proxy_' + r.status);
    } catch (e) { last = e; if (deadline.aborted) break; }
  }
  throw last || new Error('All proxies failed');
}

export async function apiFetch(url, { timeout = 7000, retries = 1 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (r.ok) return r;
      last = new Error('HTTP ' + r.status);
    } catch (e) {
      last = e;
      if (i < retries) await new Promise(r => setTimeout(r, (i + 1) * 1000));
    }
  }
  throw last;
}

// ── Language classification ────────────────────────────────────────────────────
export function detectScript(text) {
  if (!text) return null;
  if (/[ऀ-ॿ]/.test(text)) return 'devanagari';
  if (/[ఀ-౿]/.test(text)) return 'telugu';
  if (/[஀-௿]/.test(text)) return 'tamil';
  if (/[਀-੿]/.test(text)) return 'gurmukhi';
  return 'latin';
}

export function classifyLanguage(song) {
  const tag = (song.language || '').toLowerCase().trim();
  if (ALLOWED_LANGUAGES.has(tag)) return tag;
  if (tag) return null; // known but not in allowlist
  // Only use script as fallback when tag is completely absent
  const script = detectScript(song.name + ' ' + song.artist);
  if (script === 'telugu') return 'telugu';
  if (script === 'tamil')  return 'tamil';
  if (script === 'devanagari') return 'hindi';
  if (script === 'gurmukhi')   return 'punjabi';
  return null; // Latin + no tag = unknown, not English
}

export function filterByLanguage(songs, activeLang = '') {
  if (activeLang === 'english') return songs.filter(s => s._lang === 'english' || s._lang === null);
  if (activeLang) return songs.filter(s => s._lang === activeLang);
  return songs.filter(s => s._lang && ALLOWED_LANGUAGES.has(s._lang));
}

function normSigmaSong(s) {
  const pa = s.primaryArtists;
  const artist = Array.isArray(pa)
    ? pa.map(a => a.name || '').filter(Boolean).join(', ')
    : decodeHtml(pa || s.artistMap?.primary?.[0]?.name || '');
  const song = {
    id:       s.id,
    name:     decodeHtml(s.name || s.title || ''),
    artist,
    album:    decodeHtml(s.album?.name || s.album || ''),
    language: s.language || '',
    image:    bestImg(s.image, '150x150'),
    duration: parseInt(s.duration || 0),
  };
  song._lang = classifyLanguage(song);
  return song;
}

// ── Search ────────────────────────────────────────────────────────────────────
async function _searchFallback(q, limit = 20) {
  const r = await proxyFetch(
    `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(q)}&_format=json&_marker=0&ctx=wap6dot0`
  );
  const data = await r.json();
  return (data?.songs?.data || []).slice(0, limit).map(s => ({
    id:       s.id,
    name:     decodeHtml(s.title || ''),
    artist:   decodeHtml(s.more_info?.primary_artists || s.more_info?.singers || ''),
    album:    decodeHtml(s.album || ''),
    image:    (s.image || '').replace('50x50', '150x150'),
    duration: parseInt(s.more_info?.duration || 0),
    _lang:    null,
  }));
}

export async function searchSongs(q, limit = 20) {
  try {
    const r = await apiFetch(`${SIGMA_API}/search/songs?query=${encodeURIComponent(q)}&page=1&limit=${limit}`, { timeout: 7000, retries: 1 });
    const data = await r.json();
    const results = data.data?.results;
    if (data.status === 'SUCCESS' && results?.length) return results.map(normSigmaSong);
  } catch {}
  return _searchFallback(q, limit);
}

export async function searchAlbums(q, limit = 15) {
  try {
    const r = await apiFetch(`${SIGMA_API}/search/albums?query=${encodeURIComponent(q)}&page=1&limit=${limit}`, { timeout: 7000, retries: 1 });
    const data = await r.json();
    const results = data.data?.results;
    if (data.status === 'SUCCESS' && results?.length) {
      return results.map(al => ({
        id:       al.id,
        name:     decodeHtml(al.name || ''),
        subtitle: Array.isArray(al.primaryArtists) ? al.primaryArtists.map(a => a.name).join(', ') : decodeHtml(al.primaryArtists || al.language || 'Album'),
        image:    bestImg(al.image, '150x150'),
      }));
    }
  } catch {}
  return [];
}

export async function searchArtists(q, limit = 10) {
  try {
    const r = await apiFetch(`${SIGMA_API}/search/artists?query=${encodeURIComponent(q)}&page=1&limit=${limit}`, { timeout: 7000, retries: 1 });
    const data = await r.json();
    const results = data.data?.results;
    if (data.status === 'SUCCESS' && results?.length) {
      return results.map(a => ({ id: a.id, name: decodeHtml(a.name || ''), subtitle: a.role || 'Artist', image: bestImg(a.image, '150x150') }));
    }
  } catch {}
  return [];
}

export async function searchPlaylists(q, limit = 15) {
  try {
    const r = await apiFetch(`${SIGMA_API}/search/playlists?query=${encodeURIComponent(q)}&page=1&limit=${limit}`, { timeout: 7000, retries: 1 });
    const data = await r.json();
    const results = data.data?.results;
    if (data.status === 'SUCCESS' && results?.length) {
      return results.map(pl => ({ id: pl.id, name: decodeHtml(pl.name || ''), subtitle: pl.songCount ? `${pl.songCount} songs` : (pl.language || 'Playlist'), image: bestImg(pl.image, '150x150') }));
    }
  } catch {}
  return [];
}

export async function fetchArtistSongs(artistName, limit = 30) {
  return searchSongs(artistName, limit);
}

export async function fetchArtistTopSongs(artistId, limit = 20) {
  try {
    const r = await apiFetch(`${SIGMA_API}/artists/${encodeURIComponent(artistId)}/songs?page=0&n=${limit}&sortBy=popularity`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') return (data.data?.songs || data.data?.results || []).map(normSigmaSong);
  } catch (e) { Log.warn('fetchArtistTopSongs failed', { artistId, err: e.message }); }
  return [];
}

export async function fetchArtistAlbums(artistId, limit = 10) {
  try {
    const r = await apiFetch(`${SIGMA_API}/artists/${encodeURIComponent(artistId)}/albums?page=0&n=${limit}&sortBy=popularity`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') {
      return (data.data?.albums || data.data?.results || []).map(al => ({
        id:       al.id,
        name:     decodeHtml(al.name || al.title || ''),
        subtitle: decodeHtml(al.description || al.year || ''),
        image:    bestImg(al.image, '150x150'),
        type:     'album',
      }));
    }
  } catch (e) { Log.warn('fetchArtistAlbums failed', { artistId, err: e.message }); }
  return [];
}

export async function fetchArtistMeta(artistId) {
  try {
    const r = await apiFetch(`${SIGMA_API}/artists/${encodeURIComponent(artistId)}`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') {
      const a = data.data;
      return {
        name:      decodeHtml(a.name || ''),
        image:     bestImg(a.image, '500x500'),
        bio:       a.bio ? decodeHtml(Array.isArray(a.bio) ? a.bio.map(b => b.text).join(' ') : String(a.bio)) : '',
        followers: a.followerCount || a.fans || '',
      };
    }
  } catch (e) { Log.warn('fetchArtistMeta failed', { artistId, err: e.message }); }
  return null;
}

// ── Stream URL ────────────────────────────────────────────────────────────────
const streamCache = new Map();
const QUALITY_RANK = { '320kbps': 5, '160kbps': 4, '96kbps': 3, '48kbps': 2, '12kbps': 1 };

export function getNetworkQuality() {
  const c = navigator.connection;
  if (!c) return '320kbps';
  if (c.saveData) return '96kbps';
  const t = c.effectiveType;
  if (t === 'slow-2g' || t === '2g') return '96kbps';
  if (t === '3g' || (c.downlink > 0 && c.downlink < 1.5)) return '160kbps';
  return '320kbps';
}

async function fetchStream(id) {
  const r = await fetch(`${SIGMA_API}/songs?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('SIGMA stream HTTP ' + r.status);
  const data = await r.json();
  const song = Array.isArray(data?.data) ? data.data[0] : null;
  if (!song) throw new Error('No song in SIGMA response');
  const targetTier = QUALITY_RANK[getNetworkQuality()];
  const urls = (song.downloadUrl || []).slice().sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0));
  const best = urls.find(u => (QUALITY_RANK[u.quality] || 0) <= targetTier) || urls[urls.length - 1];
  if (!best?.link) throw new Error('No stream link in SIGMA response');
  return { url: best.link, quality: best.quality, image: bestImg(song.image, '500x500'), duration: parseInt(song.duration || 0) };
}

export async function apiStream(id) {
  if (streamCache.has(id)) {
    const cached = streamCache.get(id);
    if (Date.now() - (cached._fetchedAt || 0) < 25 * 60 * 1000) return cached;
    streamCache.delete(id);
  }
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
      Log.warn('Stream attempt failed', { id, attempt, err: e.message });
      if (attempt < 2) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  throw lastErr;
}

// ── Browse / Modules ──────────────────────────────────────────────────────────
const _modulesCache = new Map();

export async function fetchModules(language = 'hindi') {
  const key = `mod_${language}`;
  const cached = _modulesCache.get(key);
  if (cached && Date.now() - cached._ts < 5 * 60 * 1000) return cached.data;
  try {
    const r = await apiFetch(`${SIGMA_API}/modules?language=${encodeURIComponent(language)}`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') {
      _modulesCache.set(key, { data: data.data, _ts: Date.now() });
      return data.data;
    }
  } catch (e) { Log.warn('fetchModules failed', { language, err: e.message }); }
  return null;
}

export async function fetchAlbumSongs(albumId) {
  try {
    const r = await apiFetch(`${SIGMA_API}/albums?id=${encodeURIComponent(albumId)}`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') return (data.data?.songs || []).map(normSigmaSong);
  } catch (e) { Log.warn('fetchAlbumSongs failed', { albumId, err: e.message }); }
  return [];
}

export async function fetchPlaylistSongs(playlistId) {
  try {
    const r = await apiFetch(`${SIGMA_API}/playlists?id=${encodeURIComponent(playlistId)}`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') return (data.data?.songs || []).map(normSigmaSong);
  } catch (e) { Log.warn('fetchPlaylistSongs failed', { playlistId, err: e.message }); }
  return [];
}

export async function fetchCharts(language = 'hindi') {
  try {
    // /charts endpoint does not exist on SIGMA — charts are inside /modules response
    const modules = await fetchModules(language);
    return modules?.charts || [];
  } catch (e) { Log.warn('fetchCharts failed', { language, err: e.message }); }
  return [];
}

export async function fetchFeaturedPlaylists(language = 'hindi') {
  try {
    const r = await apiFetch(`${SIGMA_API}/featured-playlists?page=1&n=20&language=${encodeURIComponent(language)}`, { timeout: 8000, retries: 1 });
    const data = await r.json();
    if (data.status === 'SUCCESS') {
      const list = Array.isArray(data.data) ? data.data : (data.data?.playlists || data.data?.results || []);
      return list.map(pl => ({
        id:       pl.id,
        name:     decodeHtml(pl.name || pl.title || ''),
        subtitle: pl.subtitle || (pl.songCount ? `${pl.songCount} songs` : ''),
        image:    bestImg(pl.image, '150x150'),
      }));
    }
  } catch (e) { Log.warn('fetchFeaturedPlaylists failed', { language, err: e.message }); }
  return [];
}

// DES-ECB decrypt (for legacy stream URLs) — preserved verbatim
export function desDecrypt(enc64, keyStr) {
  try {
    const _PC1=[57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
    const _PC2=[14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
    const _IP=[58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
    const _FP=[40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
    const _E=[32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
    const _P=[16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
    const _SB=[[[14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7],[0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8],[4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0],[15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13]],[[15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10],[3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5],[0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15],[13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9]],[[10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8],[13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1],[13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7],[1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12]],[[7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15],[13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9],[10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4],[3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14]],[[2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9],[14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6],[4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14],[11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3]],[[12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11],[10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8],[9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6],[4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13]],[[4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1],[13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6],[1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2],[6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12]],[[13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7],[1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2],[7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8],[2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]]];
    const _SH=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
    const perm=(b,t)=>t.map(i=>b[i-1]);
    const xor=(a,b)=>a.map((x,i)=>x^b[i]);
    const toBits=bytes=>{const b=[];for(const y of bytes)for(let i=7;i>=0;i--)b.push((y>>i)&1);return b;};
    const toBytes=bits=>{const b=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];b.push(v);}return b;};
    const genKS=key=>{let kp=perm(toBits(key),_PC1),C=kp.slice(0,28),D=kp.slice(28);const ks=[];for(let r=0;r<16;r++){const s=_SH[r];C=[...C.slice(s),...C.slice(0,s)];D=[...D.slice(s),...D.slice(0,s)];ks.push(perm([...C,...D],_PC2));}return ks;};
    const fFunc=(R,K)=>{const exp=perm(R,_E),xd=xor(exp,K),out=[];for(let i=0;i<8;i++){const ch=xd.slice(i*6,i*6+6),row=(ch[0]<<1)|ch[5],col=(ch[1]<<3)|(ch[2]<<2)|(ch[3]<<1)|ch[4],val=_SB[i][row][col];for(let b=3;b>=0;b--)out.push((val>>b)&1);}return perm(out,_P);};
    const desBlock=(block,ks)=>{let bits=perm(toBits(block),_IP),L=bits.slice(0,32),R=bits.slice(32);for(const k of [...ks].reverse()){const t=R;R=xor(L,fFunc(R,k));L=t;}return toBytes(perm([...R,...L],_FP));};
    const key=Array.from(keyStr).map(c=>c.charCodeAt(0)),ks=genKS(key),b64=enc64.replace(/-/g,'+').replace(/_/g,'/'),pad=(4-b64.length%4)%4,enc=Array.from(atob(b64+'='.repeat(pad))).map(c=>c.charCodeAt(0)),out=[];
    for(let i=0;i<enc.length;i+=8)out.push(...desBlock(enc.slice(i,i+8),ks));
    return String.fromCharCode(...out).replace(/\0/g,'').trim();
  } catch { return ''; }
}
