import { persisted } from './persisted.js';

const ACCESS_HASH = '278b0ebf70ec6ed8b4c6480de49a1650ace8d513d277e1374801564e49186d37';
const GATE_KEY    = 'mbx_gate';

export const gateToken = persisted(GATE_KEY, null);

export function isUnlocked() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(GATE_KEY) === ACCESS_HASH;
}

export async function tryUnlock(input) {
  const encoded = new TextEncoder().encode(input.trim());
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex === ACCESS_HASH) {
    gateToken.set(ACCESS_HASH);
    return true;
  }
  return false;
}

export function lock() {
  gateToken.set(null);
}
