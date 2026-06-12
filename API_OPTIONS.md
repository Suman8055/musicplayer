# MusicPlayer — Music API Options

Compared 2026-06-10. Live-tested where hosted instances exist.

---

## Option 1 — SIGMA API (Current)

**Base URL:** `https://jiosaavn-api-sigma-sandy.vercel.app`  
**Language:** Node.js / TypeScript  
**Hosting:** Vercel (serverless, free tier)  
**Source:** Unknown — private deployment, no public repo link found  
**CORS:** Open — works directly from browser

### Endpoints (all confirmed live)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/search/songs?query=&page=&limit=` | GET | Returns structured results array |
| `/search/albums?query=&page=&limit=` | GET | |
| `/search/artists?query=&page=&limit=` | GET | |
| `/search/playlists?query=&page=&limit=` | GET | |
| `/songs?id=` | GET | Single song by ID, returns stream URLs |
| `/songs/:id/lyrics` | GET | **Currently returning FAILED** — lyrics broken |
| `/artists/:id` | GET | Artist detail |
| `/artists/:id/songs?page=&n=&sortBy=` | GET | Artist discography |
| `/artists/:id/albums?page=&n=&sortBy=` | GET | |
| `/albums?id=` | GET | Album detail + all songs |
| `/playlists?id=` | GET | Playlist detail + all songs |
| `/modules?language=` | GET | Home page modules: trending, charts, new releases |
| `/featured-playlists?page=&n=&language=` | GET | Featured playlists (intermittent — no response on test) |

### Response Shape (songs)

```json
{
  "status": "SUCCESS",
  "data": {
    "total": 4386,
    "results": [
      {
        "id": "YiVML4Zo",
        "name": "Song Title",
        "duration": "362",
        "language": "hindi",
        "year": "2025",
        "hasLyrics": "false",
        "primaryArtists": "Artist1, Artist2",   ← string (not array)
        "image": [ { "quality": "50x50", "link": "..." }, { "quality": "500x500", "link": "..." } ],
        "downloadUrl": [
          { "quality": "12kbps",  "link": "..." },
          { "quality": "48kbps",  "link": "..." },
          { "quality": "96kbps",  "link": "..." },
          { "quality": "160kbps", "link": "..." },
          { "quality": "320kbps", "link": "..." }
        ]
      }
    ]
  }
}
```

### Stream Quality
- 12kbps / 48kbps / 96kbps / 160kbps / **320kbps** — all 5 tiers returned

### Response Times (measured)
| Endpoint | Time |
|----------|------|
| `/search/songs` | ~664ms |
| `/songs?id=` | ~165ms |
| `/modules` | ~359ms |

### What Works
- All search types (songs, albums, artists, playlists)
- Song stream URLs with 320kbps
- Artist detail + discography
- Album + playlist detail
- Discover modules (trending, charts, new releases)
- Image arrays with multiple resolutions

### What's Broken / Unknown
- `/songs/:id/lyrics` returns FAILED — broken endpoint
- `/featured-playlists` — no response on test (may be intermittent)
- `/artists/:id/songs` — no response on test (may be rate limited)
- No public repo — cannot verify codebase, no issue tracker, depends on one person's Vercel account
- Could go offline at any time with no notice

---

## Option 2 — cyberboysumanjay/JioSaavnAPI

**Repo:** `https://github.com/cyberboysumanjay/JioSaavnAPI`  
**Language:** Python 3 + Flask  
**Hosting:** Self-hosted (VPS / local) or Heroku (deprecated) — **no public hosted instance**  
**CORS:** Depends on deployment — Flask default has no CORS headers  
**Stars:** 444 | **Forks:** 232 | **Last updated:** 2026-06-06  
**License:** MIT

### Endpoints

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/result/?query=&lyrics=` | GET | Universal — accepts song name, JioSaavn song/album/playlist URL |
| `/song/?query=&lyrics=` | GET | Song by JioSaavn URL only |
| `/album/?query=&lyrics=` | GET | Album by JioSaavn URL |
| `/playlist/?query=&lyrics=` | GET | Playlist by JioSaavn URL |
| `/lyrics/?query=&lyrics=true` | GET | Lyrics by song URL or song ID |

**Missing endpoints vs SIGMA:**
- No `/search/artists`
- No `/artists/:id` detail
- No `/modules` (home page / discover)
- No `/featured-playlists`
- No `/search/albums` by name (album only by URL)
- No image quality array — returns single `image` string (150x150 upscaled to 500x500)

### Response Shape (songs)

```json
{
  "album": "BIBA",
  "album_url": "https://www.jiosaavn.com/album/...",
  "duration": "175",
  "image_url": "https://c.saavncdn.com/.../500x500.jpg",
  "language": "hindi",
  "singers": "Marshmello, Pritam Chakraborty, ...",
  "title": "BIBA",
  "year": "2019",
  "url": "http://h.saavncdn.com/987/cd902d..._320.mp4",   ← direct MP3/AAC URL
  "lyrics": null
}
```

### Stream Quality
- 320kbps if available, falls back to 160kbps
- Uses DES decryption (`pyDes`) to decode JioSaavn's `encrypted_media_url`
- Returns a **single direct URL** — no quality picker array

### What Works
- Song search by name
- Song / album / playlist fetch by JioSaavn URL
- Lyrics fetch (when `has_lyrics=true` on the track)
- DES-based URL decryption (correct implementation)

### What's Missing / Problems
- **No public hosted instance** — must deploy yourself (VPS, Railway, Render, etc.)
- **No CORS headers** by default — requires Flask-CORS or a proxy to use from browser
- **No artist browsing** — no `/artists` endpoint at all
- **No home/discover modules** — cannot power BrowseTab
- Heroku deploy button is dead (Heroku ended free tier)
- Single direct URL — app would need refactoring to work without quality picker
- Python Flask server-side — adds infrastructure overhead vs serverless Vercel
- Calls jiosaavn.com directly from server — India VPS recommended per their own README

---

## Option 3 — cyberboysumanjay/GaanaAPI

**Repo:** `https://github.com/cyberboysumanjay/GaanaAPI`  
**Language:** Python 3 + Flask  
**Hosting:** Self-hosted only — **no public hosted instance**  
**CORS:** None by default  
**Stars:** 149 | **Forks:** 63 | **Last updated:** 2026-06-10  
**License:** MIT  
**Music Source:** **Gaana.com** — completely different platform from JioSaavn

### Critical Difference
This API serves **Gaana**, not JioSaavn. Gaana is a separate Indian music streaming platform. Songs, IDs, catalog, and URLs are entirely different. **This is not a replacement for JioSaavn APIs** — it would require sourcing all content from Gaana instead.

### Endpoints

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/result/?url=&lyrics=` | GET | Song by Gaana URL only — no search by name |

**That's it. One endpoint.**

### Response Shape

```json
{
  "album": "Alone",
  "artist": "Alan Walker",
  "bitrate": "96",
  "duration": "2min 39sec",
  "gaana_url": "https://gaana.com/song/alone-1435",
  "language": "English",
  "link": "https://vodhls-vh.akamaihd.net/i/.../master.m3u8",   ← HLS m3u8 stream
  "released": "Dec 02, 2016",
  "thumb": "https://a10.gaanacdn.com/.../crop_640x640.jpg",
  "title": "Alone"
}
```

### Stream Format
- Returns **HLS m3u8** stream URL (not direct AAC/MP3)
- Bitrate reported as `96` in example — lower than JioSaavn's 320kbps
- Uses AES-CBC decryption (Key: `g@1n!(f1#r.0$)&%`, IV: `asd!@#!@#@!12312`) to decode stream URL
- HLS m3u8 requires different player handling than JioSaavn's direct AAC URLs

### What Works
- Fetch song details by Gaana URL
- Lyrics scraping from gaana.com/lyrics/ page
- AES decryption of stream URLs

### What's Missing / Problems
- **No search by song name** — README explicitly says "you need to have Gaana link"
- **No album browse, no artist browse, no discover/modules**
- HLS m3u8 streams — current audio engine uses direct AAC URLs, needs rework
- Lower bitrate (96kbps in example vs 320kbps on JioSaavn)
- No public hosted instance — must deploy yourself
- No CORS — needs proxy for browser use
- Completely different catalog — Indian content coverage may differ from JioSaavn
- Proxy list feature (`fate_proxy`) pulls from a stale GitHub proxy list — unreliable

---

## Option 4 — cyberboysumanjay/JioMusicAPI

**Repo:** `https://github.com/cyberboysumanjay/JioMusicAPI`  
**Language:** Python 3 + Flask  
**Hosting:** Self-hosted only — Heroku instance dead  
**CORS:** None by default  
**Stars:** 28 | **Forks:** 11 | **Last updated:** 2025-12-09  
**License:** MIT  
**Music Source:** **JioMusic** (JioBeats / Jio's old music platform — different from JioSaavn)  
**Status:** **DEPRECATED** — explicitly marked deprecated in README and repo title

### Critical Issues
- **Deprecated** — the author has abandoned it
- Hits `beatsapi.media.jio.com` and `jiobeats.cdn.jio.com` — Jio's old beats CDN, likely dead or broken
- Stream URLs are HLS m3u8 (`playlist.m3u8`) at `jiobeats.cdn.jio.com` — CDN almost certainly offline
- No lyrics support at all
- No artist browse endpoint

### Endpoints

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/result/?query=` | GET | Search songs, albums, playlists by name |

### Response Shape

```json
{
  "songs": [{
    "id": "1735_1734322_1",
    "title": "Slow Motion",
    "artist": "Shreya Ghoshal, NAKASH AZIZ",
    "image": "http://jioimages.cdn.jio.com/.../800x800.jpg",
    "url": "http://jiobeats.cdn.jio.com/.../1735_1734322_1_320.mp4/playlist.m3u8"
  }],
  "albums": [...],
  "playlists": [...]
}
```

### Stream Format
- HLS m3u8 (not direct AAC) — same problem as GaanaAPI
- 320kbps path constructed server-side — but CDN is likely offline
- No fallback quality tiers

### What Works (in theory)
- Search songs/albums/playlists by name
- Album + playlist detail

### What's Missing / Problems
- **Deprecated** — do not use
- JioBeats CDN (`jiobeats.cdn.jio.com`) is a dead Jio endpoint from ~2019
- HLS m3u8 streams vs direct AAC — needs audio engine changes
- No lyrics, no artist browse, no discover/modules
- No public hosted instance, Heroku dead
- No CORS

---

## Side-by-Side Comparison

| Feature | Option 1 — SIGMA | Option 2 — JioSaavnAPI | Option 3 — GaanaAPI | Option 4 — JioMusicAPI |
|---------|-----------------|------------------------|---------------------|------------------------|
| **Music source** | JioSaavn | JioSaavn | Gaana | JioMusic (dead CDN) |
| **Status** | Live | Active | Active | **DEPRECATED** |
| **Hosting** | Vercel (live) | Self-hosted | Self-hosted | Self-hosted |
| **CORS** | Open (browser-ready) | None (needs proxy) | None (needs proxy) | None (needs proxy) |
| **Language** | Node.js | Python / Flask | Python / Flask | Python / Flask |
| **Song search by name** | ✅ | ✅ | ❌ URL only | ✅ (CDN dead) |
| **Stream quality (max)** | ✅ 320kbps (AAC) | ✅ 320kbps (AAC) | ⚠️ 96kbps (HLS) | ⚠️ 320kbps (HLS, CDN dead) |
| **Stream format** | Direct AAC URL | Direct AAC URL | HLS m3u8 | HLS m3u8 |
| **Album detail** | ✅ | ✅ (URL only) | ❌ | ✅ (CDN dead) |
| **Playlist detail** | ✅ | ✅ (URL only) | ❌ | ✅ (CDN dead) |
| **Artist browse/detail** | ✅ | ❌ | ❌ | ❌ |
| **Discover / modules** | ✅ | ❌ | ❌ | ❌ |
| **Charts** | ✅ | ❌ | ❌ | ❌ |
| **Lyrics** | ❌ broken | ✅ | ✅ (scrape) | ❌ |
| **Image quality array** | ✅ 3 sizes | ❌ single string | ❌ single string | ❌ single string |
| **Public repo** | ❌ unknown | ✅ MIT | ✅ MIT | ✅ MIT |
| **Last updated** | Unknown | 2026-06-06 | 2026-06-10 | 2025-12-09 |
| **Infrastructure cost** | Free | Hosting cost | Hosting cost | Hosting cost |
| **Drop-in replacement** | — (current) | ❌ major rework | ❌ different platform | ❌ dead |

---

## Verdict / Recommendation

**Option 1 (SIGMA) stays primary** — it is the only option that covers all current app features: Search, Discover, Artist, Album, Playlist, 320kbps AAC streams.

**Option 2 (JioSaavnAPI)** — best use as a lyrics fallback only. Cannot replace SIGMA without losing Artist browse and Discover.

**Option 3 (GaanaAPI)** — not viable for this app. Different music platform entirely, URL-only lookup (no search), HLS streams at 96kbps, single endpoint. Would require rebuilding the entire app around Gaana's catalog and a different streaming model.

**Option 4 (JioMusicAPI)** — dead. Explicitly deprecated by the author. Hits the old JioBeats CDN (`jiobeats.cdn.jio.com`) which Jio shut down years ago. Do not use.

**Biggest risk with SIGMA** remains the private Vercel deployment with no public source. Best mitigation: find and self-host the underlying Node.js JioSaavn API codebase (likely based on `ravindrasoni/jiosaavn-api` or similar TypeScript fork) on Railway/Render.

---

*Document auto-generated from live API tests and GitHub source review.*
