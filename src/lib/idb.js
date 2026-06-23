// idb.js — IndexedDB offline blob storage. Extracted from index.html.
// v2 schema: 'songs' store (metadata only) + 'blobs' store (audio Blob).
// v1 records still readable via lazy blob field — no migration needed.
import { Log } from './logger.js';

const IDB_NAME  = 'mbx_offline';
const IDB_STORE = 'songs';
const IDB_BLOBS = 'blobs';
let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(IDB_NAME, 2); }
    catch {
      // Private Browsing on iOS/Safari throws synchronously when IDB is blocked
      return reject(new DOMException('Downloads unavailable in Private Browsing mode', 'SecurityError'));
    }
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(IDB_BLOBS)) db.createObjectStore(IDB_BLOBS, { keyPath: 'id' });
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror = () => {
      const err = req.error;
      // SecurityError = Private Browsing on iOS — give a clear user-facing message
      if (err?.name === 'SecurityError') {
        reject(new DOMException('Downloads unavailable in Private Browsing mode', 'SecurityError'));
      } else {
        reject(err);
      }
    };
  });
}

export async function idbGet(id) {
  const db = await openIDB();
  const [meta, blobRec] = await Promise.all([
    new Promise((res, rej) => { const req = db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error); }),
    new Promise((res, rej) => { const req = db.transaction(IDB_BLOBS,'readonly').objectStore(IDB_BLOBS).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error); }),
  ]);
  if (!meta) return null;
  const blob = blobRec?.blob ?? meta.blob ?? null;
  return blob ? { ...meta, blob } : null;
}

export async function idbSave(record) {
  const db = await openIDB();
  const { blob, ...meta } = record;
  // Re-estimate storage right before write — iOS stale quota bug
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (blob && quota - usage < blob.size + 5 * 1024 * 1024) throw new Error('insufficient_storage');
  } catch (e) { if (e.message === 'insufficient_storage') throw e; }
  return new Promise((res, rej) => {
    const tx = db.transaction([IDB_STORE, IDB_BLOBS], 'readwrite');
    tx.objectStore(IDB_STORE).put(meta);
    if (blob) tx.objectStore(IDB_BLOBS).put({ id: meta.id, blob });
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
    tx.onabort    = () => rej(tx.error || new Error('transaction_aborted'));
  });
}

export async function idbDelete(id) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction([IDB_STORE, IDB_BLOBS], 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.objectStore(IDB_BLOBS).delete(id);
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
    tx.onabort    = () => rej(tx.error || new Error('transaction_aborted'));
  });
}

export async function idbGetAll() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}

export async function exportAllDownloads(toastFn) {
  const db = await openIDB();
  const songs = await new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
  if (!songs.length) { toastFn('No downloaded songs'); return 0; }

  let exported = 0;
  for (const meta of songs) {
    const blobRec = await new Promise((res, rej) => {
      const req = db.transaction(IDB_BLOBS,'readonly').objectStore(IDB_BLOBS).get(meta.id);
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => rej(req.error);
    });
    const blob = blobRec?.blob ?? meta.blob ?? null;
    if (!blob) continue;

    const safe = s => (s || '').replace(/[/\\:*?"<>|]/g, '').trim();
    const filename = `MusicPlayer - ${safe(meta.name)} - ${safe(meta.artist)}.mp3`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay between triggers — iOS Safari queues downloads sequentially
    await new Promise(r => setTimeout(r, 600));
    URL.revokeObjectURL(url);
    exported++;
    toastFn(`Exporting ${exported} / ${songs.length}…`);
  }
  return exported;
}

export async function idbClear() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction([IDB_STORE, IDB_BLOBS], 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.objectStore(IDB_BLOBS).clear();
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
    tx.onabort    = () => rej(tx.error || new Error('transaction_aborted'));
  });
}

export async function downloadSong(song, toastFn, apiStreamFn, signal) {
  const { downloadedIds } = await import('./stores/library.js');
  const { get } = await import('svelte/store');
  if (get(downloadedIds).has(song.id)) { toastFn('Already downloaded'); return; }

  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota - usage < 30 * 1024 * 1024) { toastFn('Not enough storage — free up space in Settings'); return; }
  } catch {}

  // Fail-fast if IDB is unavailable (Private Browsing)
  try { await openIDB(); } catch (e) {
    if (e?.name === 'SecurityError') { toastFn('Downloads unavailable in Private Browsing'); return; }
    throw e;
  }

  toastFn('Starting download…');
  try {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    let blob = null, lastStream = null, lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const stream = await apiStreamFn(song.id);
        lastStream = stream;
        const resp = await fetch(stream.url, signal ? { signal } : undefined);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const total = parseInt(resp.headers.get('content-length') || '0');
        const reader = resp.body.getReader();
        const chunks = []; let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); loaded += value.byteLength;
          if (total) toastFn(`Downloading… ${Math.round(loaded / total * 100)}%`);
        }
        blob = new Blob(chunks, { type: 'audio/mpeg' }); break;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) { toastFn(`Retrying download (${attempt + 1}/3)…`); await new Promise(r => setTimeout(r, attempt * 1000)); }
      }
    }
    if (!blob) throw lastErr;
    await idbSave({ id: song.id, name: song.name, artist: song.artist, album: song.album || '', image: song.image || lastStream?.image, quality: song.quality || lastStream?.quality, duration: song.duration || lastStream?.duration, blob, downloadedAt: Date.now() });
    downloadedIds.update(s => { s.add(song.id); return new Set(s); });
    Log.info('Downloaded', { id: song.id, name: song.name, bytes: blob.size });
    toastFn('Downloaded: ' + (song.name || 'Song'));
  } catch (e) {
    Log.error('Download failed', { id: song.id, err: e.message });
    toastFn('Download failed — try again');
  }
}

export async function removeDownload(song, toastFn, currentBlobUrl) {
  await idbDelete(song.id);
  const { downloadedIds } = await import('./stores/library.js');
  downloadedIds.update(s => { s.delete(song.id); return new Set(s); });
  if (currentBlobUrl) {
    // Delay revoke by 500ms — revoking a blob URL while audio.src still points to it
    // causes immediate silence on Chrome/Firefox. Audio ends naturally within the delay window.
    setTimeout(() => { try { URL.revokeObjectURL(currentBlobUrl); } catch {} }, 500);
  }
  Log.info('Download removed', { id: song.id });
  toastFn('Download removed');
}
