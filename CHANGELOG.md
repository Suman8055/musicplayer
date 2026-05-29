# MusicPlayer Changelog

All notable changes to this project are documented here.

---

## v3.8.1 — Spatial Audio CORS fix (2026-05-28)

**Bugfix:** Audio was silenced after the v3.8.0 Web Audio graph changes.

**Root cause:** `createMediaElementSource()` on JioSaavn CDN streams
(`aac.saavncdn.com`) triggers CORS enforcement — Chrome outputs silence
("MediaElementAudioSource outputs zeroes due to CORS access restrictions")
while the `<audio>` element technically plays. The v3.8.0 build routed
all playback through the Web Audio graph unconditionally, silencing audio
for all users with Spatial OFF (the default).

**Fix:** Web Audio graph is now only initialised when the user enables
Spatial Audio. When Spatial is OFF (default), playback uses the native
`audio.volume` path with zero CORS risk — identical to v3.7.0 behaviour.
When Spatial is ON, the HRTF graph is created on-demand; this works
correctly on Android/iOS PWA installs where CORS is not enforced.

**Files changed:** `index.html` (version → 3.8.1), `sw.js` (cache → mbx-shell-v3.8.1)

---

## v3.8.0 — Spatial Audio / Headphone Mode (2026-05-28)

**Feature:** Spatial Audio — an HRTF-based stereo widening mode that makes music feel like it's playing around you, similar to what Dolby Atmos does on headphones.

### How it works
- Web Audio API graph: `<audio>` → `MediaElementSourceNode` → `ChannelSplitterNode` → L/R `PannerNode(HRTF)` → `ChannelMergerNode` → `GainNode(0.794)` → `destination`
- Left channel panned left+behind; right channel panned right+behind — creates an out-of-head concert-hall effect
- Two intensity levels: **Subtle** (±0.6x, −0.3z) and **Full** (±1.0x, −0.8z)
- `AudioContext` with `sampleRate: 48000` — matches device hardware rate to avoid 44.1→48 kHz resampling artefacts (root cause of the v2.9.1 distortion episode)
- Toggle/intensity changes rewire the graph mid-playback with no audio interruption

### UI
- **Spatial** button in Now Playing footer (headphones icon, accent glow when active)
- **Settings → Sound** card with on/off checkbox and Subtle / Full intensity buttons
- Toast on toggle: "Spatial on" / "Spatial off"

### Platform notes
- Default is **OFF** — zero audible change unless user enables it
- `GainNode.gain.value` is used for loudness normalisation instead of `audio.volume`; this makes the **volume slider functional on iOS** (previously replaced with "Use volume buttons" note)
- HRTF effect present on iOS 15+; older iOS falls back to equal-power panning silently
- State persists across sessions via `localStorage` keys `mbx_spatial` (bool) and `mbx_spatial_intensity` (1=Subtle, 2=Full)
- `AudioContext` is a singleton — created once per session, never recreated per song
- Falls back silently to `audio.volume` path if `AudioContext` is not supported

### Stage breakdown
- **Stage 1:** Web Audio graph foundation — lazy `AudioContext` singleton, `MediaElementSourceNode`, `GainNode`, `_resumeAudioCtx()` wired into all play paths
- **Stage 2:** HRTF engine — `ChannelSplitterNode`, dual `PannerNode(HRTF)`, `ChannelMergerNode`, `setSpatial()`, toggle mid-playback by disconnect/reconnect
- **Stage 3:** Now Playing "Spatial" button — headphones SVG, accent glow, toast
- **Stage 4:** Settings → Sound card — checkbox, intensity segmented control, explanatory note, two-way sync with NP button
- **Stage 5:** Full audit, `_audioGraphFailed` guard, iOS volume slider consolidated, version bump

### Files changed
- `index.html` — all feature code
- `sw.js` — cache bumped to `mbx-shell-v3.8.0`

---

## v3.5.3 — Bluetooth album art fix (2026-05-27)

**Problem:** Album art not showing on Bluetooth speaker displays even after the v3.5.2 fix.

**Root cause of v3.5.2 failure:** `blob:` URLs are handles that live inside the browser
process only. Bluetooth speaker firmware (AVRCP) fetches artwork via its own HTTP client
that runs *outside* the browser — so `blob:` URLs always return 404 and the speaker
renders nothing.

**Fix — canvas → `data:` URL pipeline:**
1. `_fetchArtDataUrl(url)` fetches the 500×500 CDN image via `fetch()`
2. Draws it onto a 128×128 `<canvas>` element
3. Exports as `data:image/jpeg;base64,...` via `canvas.toDataURL('image/jpeg', 0.85)`
4. Sets that string as `MediaMetadata.artwork[0].src`

A `data:` URL embeds the entire image as base64 in the string itself. The OS passes
the bytes directly to the speaker over AVRCP — no HTTP request is made at all.
Canvas resize to 128×128 keeps the output ~3–15 KB (AVRCP-friendly; also the size
iOS uses for lock screen and notification shade).

**Also works for:** CarPlay, AirPlay, Android lock screen, notification shade.
Safari handles `data:` URLs natively for all of these.

**Fallback:** If the image fetch fails (network error, CDN down), raw CDN URLs are
set instead — CarPlay/AirPlay still work via Safari in this case; Bluetooth may not.

**Race guard:** If the user skips to another song while the image is being fetched,
the artwork update is silently dropped (title mismatch check prevents stale art).

**Removed:** `_fetchArtBlob()` function and `_artBlobUrl` module-level variable
(the old v3.5.2 blob approach, now fully replaced).

**Files changed:** `index.html`, `sw.js` (cache bump to `mbx-shell-v3.5.3`)

**Tests:** 19/19 Playwright tests passing (`/tmp/bt-artwork-test.js`)

---

## v3.5.2 — Bluetooth album art attempt (superseded by v3.5.3)

**Problem:** Album art not showing on Bluetooth speaker displays.

**Root cause:** JioSaavn CDN image URLs are cross-origin. Bluetooth speaker firmware
fetches the MediaSession `artwork` URL using its own HTTP client — CORS is irrelevant
there, but the CDN serves different content or blocks non-browser user agents.

**Fix attempted:** `updateMediaSession()` fetches the 500×500 CDN image in-browser,
converts it to a `blob:` URL via `URL.createObjectURL()`, and passes that as artwork.
Title/artist set immediately without waiting for the fetch.

**Why it failed:** `blob:` URLs are browser-process-local handles. AVRCP firmware
fetching the URL from outside the browser always gets a 404.

**Files changed:** `index.html`, `sw.js`

---

## v3.5.1 — Search always returned only 3 results (2026-05)

**Root cause:** `saavn.8man.dev` has no `Access-Control-Allow-Origin` header — all
browser fetch calls silently failed CORS and fell through to a JioSaavn autocomplete
proxy that caps results at 3 per section.

**Fix:** All 4 search functions (`searchSongs`, `searchAlbums`, `searchPlaylists`,
`searchArtists`) switched to `SIGMA_API` (`jiosaavn-api-sigma-sandy.vercel.app`)
which returns `Access-Control-Allow-Origin: *`. Removed dead `saavn.8man.dev`
unified search call. `topHit` now derived from first name-matching song in results.

**Critical rule:** Never use `saavn.8man.dev` for browser-side search — CORS-blocked
in all browsers. Use only for album/playlist/artist detail fetches via `saavnFetch()`
(which goes through `proxyFetch` fallback).

**Tests:** 14/14 live Playwright tests passing against production URL.

---

## v3.5.0 — Rich search (2026-05)

Parallel high-limit fetches + section counts + "See all" expand. Previously the
unified `/api/search` endpoint capped every section at ~3–5 items.

- `runSearch` fires 4 parallel calls: songs×20, albums×15, playlists×15, artists×10
- New `searchArtists()` function
- "All" view shows `SEARCH_PREVIEW_COUNT=5` rows per section with a "See all N more"
  expand row (no extra API call); filter chips show everything uncapped
- Section headers show item count badge (e.g. `Songs 20`)
- Albums keep full horizontal carousel
- Section lists have `.sr-songs`, `.sr-artists`, `.sr-playlists` CSS classes

---

## v3.4.1 — Play/pause frozen at end of queue (2026-04)

When the last song in an album queue ended naturally, `audio.ended = true` caused
`audio.play()` in `togglePlay()` to silently no-op on most browsers, leaving buttons
visually stuck. Fix: `if (audio.ended) audio.currentTime = 0` before `play()`.

---

## v3.4.0 — Full SmartPlay UI layer (2026-04)

- Why chip shows `✦` sparkle prefix; tapping opens `#sp-info-sheet` bottom sheet
- Info sheet shows: mode, time context, queue reason, flow chain (A→B + count),
  suppressed artists, top 5 artists with play/score stats
- Smart Queue badge (`#sq-badge`) gets animated pulse dot (`.sq-pulse-dot`)
- SmartPlay button (`#np-smartplay-btn`) gets CSS glow pulse animation when active
- 8 new Playwright tests (T5.9–T5.16), 58 total all passing

---

## v3.3.0 — Flow memory upgrade (2026-03)

Flow pairs stored as `{count, lastPlayed}` objects. `intelPrune` applies 20% decay
to flows not reinforced in 30 days; drops pairs below count 1. Why chip shows flow
strength: "Follows your Arijit Singh session (7x)". 8 new Playwright tests, 50 total.

---

## v3.2.0 — Mood shift upgrade (2026-03)

`_showMoodShiftBadge()` shows artist name. `_refreshSuppressedRow()` renders live
"Skipping this session" row in Settings → Memory with Clear button. "Not Now"
long-press toast shows artist name. 13 Stage 3 Playwright tests, all passing.

---

## v3.1.0 — Time/context awareness (2026-03)

`_refreshTimeContext()` centralises slot-label updates across For You greeting,
For You slot label, and Trending India slot label. Auto-refreshes every 60s while
Discover tab is active. 8 Stage 2 Playwright tests (T2.1–T2.8), all passing.

---

## v3.0.0 — SmartPlay 2.0 / Intel Engine (2026-02)

Intel v2 schema: fastSkips, flows, streaks, language decay. Time-of-day slot scoring.
Contextual SmartQueue. Skip-streak mood shift detection (2 fast skips). Session artist
suppression. "Not Now" long-press. Song flow memory (A→B transitions). Smart Radio.
Weekly Recap card (Mondays). 35 Playwright tests across 5 stages, all passing.

---

## v2.9.1 — Fix distortion / remove Web Audio (2026-01)

Removed Web Audio graph (`createMediaElementSource` + GainNode + DynamicsCompressor).
Root cause of distortion: Web Audio resamples 44.1kHz AAC to 48kHz in real-time,
introducing inter-sample artefacts on bass-heavy tracks. Loudness normalisation now
via `audio.volume = 0.794` (−2 dB, OS hardware mixer, zero resampling). Confirmed
clean by Playwright 60s test: 10/10 checks, 0.16% decode drift.

---

## v2.8.0 — Fix CarPlay distortion (2026-01)

Removed `crossorigin="anonymous"` from `<audio>` — it was forcing audio through
a CORS decode pipeline causing distortion on CarPlay handoff. Throttled
`setPositionState` from 60Hz to 1Hz to stop stalling the CarPlay media remote.

---

## v1.0.0 — Initial release

JioSaavn streaming PWA. Fully serverless (in-browser DES decrypt + CORS proxy).
Hayasaka × Apple Music dark UI. Passcode-gated. iPhone Add to Home Screen.
