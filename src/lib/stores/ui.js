import { writable } from 'svelte/store';
import { persisted } from './persisted.js';

export const activeTab   = writable('search');
export const npOpen      = writable(false);
export const eqSheetOpen = writable(false);
export const spInfoOpen  = writable(false);
export const queueOpen   = writable(false);
export const sheetOpen   = writable(false);
export const promptOpen  = writable(false);
export const toastMsg    = writable(null);
export const isOnline    = writable(true);
export const accentH     = writable(187);
export const accentS     = writable('100%');
export const accentL     = writable('45%');
export const moodBadge   = writable(null);
export const airPlayDspWarn      = writable(false);
export const airPlayAvailable    = writable(false); // true when AirPlay devices are discoverable
export const airPlayActive       = writable(false); // true when currently routing to AirPlay

// Sheet store — populated by showSheet()
export const sheetData = writable({ title: '', actions: [] });
export const promptData = writable({ title: '', value: '', onOk: null });

// env banner height (CSS var --env-banner-h)
export const envBannerH = writable('0px');

// Update available — set when a newer SW is waiting { waiting: ServiceWorker, newVersion: string }
export const updateAvailable = writable(null);

// Elder View — large bold text mode
function _loadElder() { try { return localStorage.getItem('mbx_elder') === '1'; } catch { return false; } }
export const elderView = writable(_loadElder());
elderView.subscribe(v => {
  try { localStorage.setItem('mbx_elder', v ? '1' : '0'); } catch {}
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('elder-view', v);
  }
});

// Toast helper
let _toastTimer = null;
export function toast(msg, duration = 2800) {
  toastMsg.set(msg);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toastMsg.set(null), duration);
}

export function showSheet(title, actions) {
  sheetData.set({ title, actions });
  sheetOpen.set(true);
}

export function closeSheet() { sheetOpen.set(false); }

export function openPrompt(title, onOk, defaultVal = '') {
  promptData.set({ title, value: defaultVal, onOk });
  promptOpen.set(true);
}

export function closePrompt() { promptOpen.set(false); }
