import { writable } from 'svelte/store';

export function persisted(key, defaultValue) {
  const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
  let initial;
  try { initial = stored !== null ? JSON.parse(stored) : defaultValue; }
  catch { initial = defaultValue; }
  const { subscribe, set, update } = writable(initial);
  return {
    subscribe,
    set(value) {
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      }
      set(value);
    },
    update(fn) {
      update(v => {
        const next = fn(v);
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
        }
        return next;
      });
    }
  };
}
