/**
 * MusicBox — Cloudflare Worker
 * Proxies JioSaavn API with CORS + decrypts stream URLs
 *
 * Deploy: paste this into Cloudflare Workers dashboard → Save & Deploy
 * Endpoints:
 *   GET /search?q=QUERY&limit=20
 *   GET /stream?id=SONG_ID
 */

'use strict';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  'Referer': 'https://www.jiosaavn.com/',
};
const DES_KEY = '38346591';

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);

    if (url.pathname === '/search') {
      const q = url.searchParams.get('q') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 40);
      return handleSearch(q, limit);
    }

    if (url.pathname === '/stream') {
      const id = url.searchParams.get('id') || '';
      return handleStream(id);
    }

    return new Response(JSON.stringify({ status: 'MusicBox API OK' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },
};

// ─── Search ───────────────────────────────────────────────────────────────────

async function handleSearch(q, limit) {
  if (!q) return json({ songs: [] });
  try {
    const r = await fetch(
      `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(q)}&_format=json&_marker=0&ctx=wap6dot0`,
      { headers: HEADERS }
    );
    const data = await r.json();
    const raw = (data?.songs?.data || []).slice(0, limit);
    const songs = raw.map(s => ({
      id: s.id,
      name: decodeHtml(s.title || ''),
      artist: decodeHtml(s.more_info?.primary_artists || s.more_info?.singers || ''),
      album: decodeHtml(s.album || ''),
      image: (s.image || '').replace('50x50', '150x150'),
      duration: parseInt(s.more_info?.duration || 0),
    }));
    return json({ songs });
  } catch (e) {
    return json({ error: 'Search failed', songs: [] }, 500);
  }
}

// ─── Stream URL ───────────────────────────────────────────────────────────────

async function handleStream(id) {
  if (!id) return json({ error: 'Missing id' }, 400);
  try {
    const r = await fetch(
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_format=json&pids=${encodeURIComponent(id)}`,
      { headers: HEADERS }
    );
    const data = await r.json();
    const key = Object.keys(data)[0];
    const song = data[key];
    if (!song?.encrypted_media_url) return json({ error: 'No stream' }, 404);

    const url96 = desDecrypt(song.encrypted_media_url, DES_KEY);
    if (!url96) return json({ error: 'Decrypt failed' }, 500);

    const is320 = song['320kbps'] === 'true';
    const streamUrl = is320
      ? url96.replace('_96.', '_320.').replace('_96_p.', '_320_p.').replace(/(_\d{1,3})\.mp4/, '_320.mp4')
      : url96;

    return json({
      url: streamUrl,
      image: (song.image || '').replace('50x50', '500x500').replace('150x150', '500x500'),
      duration: parseInt(song.duration || 0),
    });
  } catch (e) {
    return json({ error: 'Stream fetch failed: ' + e.message }, 500);
  }
}

function decodeHtml(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Pure-JS DES-ECB Decryption ───────────────────────────────────────────────
// Standard DES algorithm (FIPS 46-3), ECB mode, decryption only

const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const IP  = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const FP  = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const E   = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const P   = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const SB  = [
  [[14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7],[0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8],[4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0],[15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13]],
  [[15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10],[3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5],[0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15],[13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9]],
  [[10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8],[13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1],[13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7],[1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12]],
  [[7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15],[13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9],[10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4],[3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14]],
  [[2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9],[14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6],[4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14],[11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3]],
  [[12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11],[10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8],[9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6],[4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13]],
  [[4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1],[13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6],[1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2],[6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12]],
  [[13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7],[1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2],[7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8],[2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]],
];
const SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function perm(bits, tbl) { return tbl.map(i => bits[i - 1]); }
function xorArr(a, b) { return a.map((x, i) => x ^ b[i]); }
function toBits(bytes) {
  const b = [];
  for (const byte of bytes) for (let i = 7; i >= 0; i--) b.push((byte >> i) & 1);
  return b;
}
function toBytes(bits) {
  const b = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    b.push(v);
  }
  return b;
}

function genSubKeys(keyBytes) {
  let kp = perm(toBits(keyBytes), PC1);
  let C = kp.slice(0, 28), D = kp.slice(28);
  const ks = [];
  for (let r = 0; r < 16; r++) {
    const s = SHIFTS[r];
    C = [...C.slice(s), ...C.slice(0, s)];
    D = [...D.slice(s), ...D.slice(0, s)];
    ks.push(perm([...C, ...D], PC2));
  }
  return ks;
}

function fFunc(R, K) {
  const exp = perm(R, E);
  const xd  = xorArr(exp, K);
  const out  = [];
  for (let i = 0; i < 8; i++) {
    const ch  = xd.slice(i * 6, i * 6 + 6);
    const row = (ch[0] << 1) | ch[5];
    const col = (ch[1] << 3) | (ch[2] << 2) | (ch[3] << 1) | ch[4];
    const val = SB[i][row][col];
    for (let b = 3; b >= 0; b--) out.push((val >> b) & 1);
  }
  return perm(out, P);
}

function desBlock(block, ks, encrypt) {
  let bits = perm(toBits(block), IP);
  let L = bits.slice(0, 32), R = bits.slice(32);
  const rounds = encrypt ? ks : [...ks].reverse();
  for (const k of rounds) {
    const t = R;
    R = xorArr(L, fFunc(R, k));
    L = t;
  }
  return toBytes(perm([...R, ...L], FP));
}

function desDecrypt(encBase64, keyStr) {
  try {
    const key = Array.from(keyStr).map(c => c.charCodeAt(0));
    const ks  = genSubKeys(key);
    const b64 = encBase64.replace(/-/g, '+').replace(/_/g, '/');
    const pad  = (4 - b64.length % 4) % 4;
    const enc  = Array.from(atob(b64 + '='.repeat(pad))).map(c => c.charCodeAt(0));
    const out  = [];
    for (let i = 0; i < enc.length; i += 8) out.push(...desBlock(enc.slice(i, i + 8), ks, false));
    return String.fromCharCode(...out).replace(/\0/g, '').trim();
  } catch { return ''; }
}
