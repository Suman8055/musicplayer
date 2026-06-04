import { writable } from 'svelte/store';
import { persisted } from './persisted.js';

export const playlists     = persisted('mbx_playlists', []);
export const downloadedIds = writable(new Set());
export const openPlId      = writable(null);
export const liked         = persisted('mbx_liked_v2', []);
