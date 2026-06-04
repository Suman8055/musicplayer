import { writable } from 'svelte/store';
import { persisted } from './persisted.js';

export const smartPlayOn      = persisted('mbx_smartplay_on', true);
export const smartQueueActive = writable(false);
export const injectedIds      = writable(new Set());
export const whyChip          = writable(null);   // { reason, label } | null
export const moodBadgeText    = writable(null);   // shown 3s then cleared
