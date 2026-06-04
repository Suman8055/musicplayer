<script>
  import { onMount } from 'svelte';
  import { searchSongs, searchAlbums, searchArtists, searchPlaylists } from '$lib/api.js';
  import { play } from '$lib/playback.js';
  import { cacheSongs } from '$lib/utils.js';
  import { activeTab, showSheet, toast } from '$lib/stores/ui.js';
  import { downloadedIds } from '$lib/stores/library.js';
  import { idbGetAll, downloadSong, removeDownload } from '$lib/idb.js';
  import { apiStream } from '$lib/api.js';
  import SongRow from '$lib/components/shared/SongRow.svelte';

  let query = '';
  let results = { songs: [], albums: [], artists: [], playlists: [] };
  let filter  = 'all'; // all | songs | albums | artists | playlists
  let loading = false;
  let debounceTimer;
  const searchCache = new Map();

  const FILTERS = ['all', 'songs', 'albums', 'artists', 'playlists'];

  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 420);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) { results = { songs: [], albums: [], artists: [], playlists: [] }; return; }
    if (searchCache.has(q)) { results = searchCache.get(q); return; }
    loading = true;
    try {
      const [songs, albums, artists, playlists] = await Promise.allSettled([
        searchSongs(q, 20),
        searchAlbums(q, 10),
        searchArtists(q, 8),
        searchPlaylists(q, 8),
      ]);
      const r = {
        songs:     songs.status     === 'fulfilled' ? songs.value     : [],
        albums:    albums.status    === 'fulfilled' ? albums.value    : [],
        artists:   artists.status   === 'fulfilled' ? artists.value   : [],
        playlists: playlists.status === 'fulfilled' ? playlists.value : [],
      };
      cacheSongs(r.songs);
      searchCache.set(q, r);
      if (searchCache.size > 30) searchCache.delete(searchCache.keys().next().value);
      results = r;
    } finally { loading = false; }
  }

  function playSong(song, idx) {
    play(song, results.songs, idx);
  }

  function onMore(song) {
    const dl = $downloadedIds.has(song.id);
    showSheet(song.name, [
      { label: 'Play Next',         action: () => {} },
      { label: dl ? 'Remove Download' : 'Download', action: () => {
        if (dl) removeDownload(song, toast, null).catch(() => {});
        else    downloadSong(song, toast, apiStream).catch(() => {});
      }},
    ]);
  }

  $: visible = $activeTab === 'search';
</script>

<div class="tab-pane" class:active={visible} id="tab-search">
  <div class="tab-header">Search</div>
  <div class="search-wrap">
    <div class="search-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        id="search-input"
        type="search"
        placeholder="Songs, artists, albums…"
        autocomplete="off" autocorrect="off" spellcheck="false"
        bind:value={query}
        on:input={onInput}
      />
    </div>
    <div id="search-chips">
      {#each FILTERS as f}
        <button class="chip" class:active={filter === f} on:click={() => filter = f}>
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      {/each}
    </div>
  </div>

  <div id="search-results">
    {#if loading}
      <div class="empty-wrap"><div class="spinner"></div></div>
    {:else if query && results.songs.length === 0 && results.albums.length === 0}
      <div class="empty-wrap">No results for "{query}"</div>
    {:else}
      {#if (filter === 'all' || filter === 'songs') && results.songs.length}
        {#if filter === 'all'}<div class="section-title">Songs</div>{/if}
        {#each results.songs as song, i}
          <SongRow {song} onPlay={() => playSong(song, i)} onMore={(s) => onMore(s)} />
        {/each}
      {/if}

      {#if (filter === 'all' || filter === 'albums') && results.albums.length}
        <div class="section-title">Albums</div>
        {#each results.albums as album}
          <div class="song-item">
            <img class="song-art" src={album.image} alt="" style="border-radius:6px;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{album.name}</div>
              <div class="song-meta">{album.subtitle}</div>
            </div>
          </div>
        {/each}
      {/if}

      {#if (filter === 'all' || filter === 'artists') && results.artists.length}
        <div class="section-title">Artists</div>
        {#each results.artists as artist}
          <div class="song-item">
            <img class="song-art" src={artist.image} alt="" style="border-radius:50%;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{artist.name}</div>
              <div class="song-meta">{artist.subtitle}</div>
            </div>
          </div>
        {/each}
      {/if}

      {#if (filter === 'all' || filter === 'playlists') && results.playlists.length}
        <div class="section-title">Playlists</div>
        {#each results.playlists as pl}
          <div class="song-item">
            <img class="song-art" src={pl.image} alt="" style="border-radius:6px;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{pl.name}</div>
              <div class="song-meta">{pl.subtitle}</div>
            </div>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .tab-header { font-size: 22px; font-weight: 700; padding: 16px 16px 8px; }
  .search-wrap { padding: 0 16px 8px; }
  .search-bar {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg3); border-radius: var(--radius);
    padding: 10px 12px; margin-bottom: 10px;
  }
  .search-bar input { flex: 1; background: none; color: var(--fg); font-size: 15px; }
  .search-bar input::placeholder { color: var(--fg3); }
  #search-chips { display: flex; gap: 6px; overflow-x: auto; }
  .chip { padding: 5px 12px; border-radius: 20px; font-size: 12px; background: var(--bg3); color: var(--fg3); border: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
  .chip.active { background: var(--accent); color: #fff; border-color: transparent; }
  .section-title { font-size: 13px; font-weight: 600; color: var(--fg3); padding: 10px 16px 4px; text-transform: uppercase; letter-spacing: .05em; }
  .song-item { display: flex; align-items: center; gap: 10px; padding: 8px 16px; cursor: pointer; }
  .song-item:active { background: rgba(255,255,255,.05); }
  .song-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song-meta { font-size: 12px; color: var(--fg3); }
</style>
