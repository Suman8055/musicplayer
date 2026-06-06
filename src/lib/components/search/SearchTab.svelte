<script>
  import { onMount } from 'svelte';
  import { searchSongs, searchAlbums, searchArtists, searchPlaylists, fetchAlbumSongs, fetchPlaylistSongs, fetchArtistTopSongs, fetchArtistAlbums, fetchArtistMeta, filterByLanguage } from '$lib/api.js';
  import { play } from '$lib/playback.js';
  import { cacheSongs, bestImg } from '$lib/utils.js';
  import { activeTab, showSheet, toast } from '$lib/stores/ui.js';
  import { downloadedIds, playlists } from '$lib/stores/library.js';
  import { downloadSong, removeDownload } from '$lib/idb.js';
  import { apiStream } from '$lib/api.js';
  import { get } from 'svelte/store';
  import SongRow from '$lib/components/shared/SongRow.svelte';

  // Detail slide-in (album / playlist / artist)
  let detailOpen = false;
  let detailTitle = '';
  let detailSongs = [];
  let detailLoading = false;
  let detailType = '';
  let artistMeta = null;
  let artistAlbums = [];

  async function openDetail(id, type, title) {
    detailTitle = title;
    detailSongs = [];
    artistMeta = null;
    artistAlbums = [];
    detailType = type;
    detailOpen = true;
    detailLoading = true;
    try {
      if (type === 'album') {
        const songs = await fetchAlbumSongs(id);
        detailSongs = filterByLanguage(songs);
        cacheSongs(detailSongs);
      } else if (type === 'playlist') {
        const songs = await fetchPlaylistSongs(id);
        detailSongs = filterByLanguage(songs);
        cacheSongs(detailSongs);
      } else if (type === 'artist') {
        const [meta, songs, albums] = await Promise.allSettled([
          fetchArtistMeta(id),
          fetchArtistTopSongs(id, 20),
          fetchArtistAlbums(id, 10),
        ]);
        artistMeta = meta.status === 'fulfilled' ? meta.value : null;
        const rawSongs = songs.status === 'fulfilled' ? songs.value : [];
        detailSongs = rawSongs.length ? rawSongs : await searchSongs(title, 20);
        artistAlbums = albums.status === 'fulfilled' ? albums.value : [];
        cacheSongs(detailSongs);
      }
    } finally { detailLoading = false; }
  }

  // Sub-detail for artist's album
  let subDetailOpen = false;
  let subDetailTitle = '';
  let subDetailSongs = [];
  let subDetailLoading = false;

  async function openAlbumFromArtist(albumId, albumName) {
    subDetailTitle = albumName;
    subDetailSongs = [];
    subDetailOpen = true;
    subDetailLoading = true;
    try {
      const songs = await fetchAlbumSongs(albumId);
      subDetailSongs = songs;
      cacheSongs(songs);
    } finally { subDetailLoading = false; }
  }

  function addToPlaylist(song) {
    const pls = get(playlists);
    if (!pls.length) { toast('No playlists — create one in Library'); return; }
    showSheet(`Add "${song.name}" to…`, pls.map(pl => ({
      label: pl.name,
      action: () => {
        playlists.update(arr => arr.map(p =>
          p.id === pl.id
            ? { ...p, songs: p.songs.some(s => s.id === song.id) ? p.songs : [...p.songs, song] }
            : p
        ));
        toast(`Added to ${pl.name}`);
      }
    })));
  }

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
      { label: 'Add to Playlist', action: () => addToPlaylist(song) },
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
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="song-item" on:click={() => openDetail(album.id, 'album', album.name)}>
            <img class="song-art" src={album.image} alt="" style="border-radius:6px;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{album.name}</div>
              <div class="song-meta">{album.subtitle}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--fg3);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        {/each}
      {/if}

      {#if (filter === 'all' || filter === 'artists') && results.artists.length}
        <div class="section-title">Artists</div>
        {#each results.artists as artist}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="song-item" on:click={() => openDetail(artist.id, 'artist', artist.name)}>
            <img class="song-art" src={artist.image} alt="" style="border-radius:50%;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{artist.name}</div>
              <div class="song-meta">{artist.subtitle}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--fg3);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        {/each}
      {/if}

      {#if (filter === 'all' || filter === 'playlists') && results.playlists.length}
        <div class="section-title">Playlists</div>
        {#each results.playlists as pl}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="song-item" on:click={() => openDetail(pl.id, 'playlist', pl.name)}>
            <img class="song-art" src={pl.image} alt="" style="border-radius:6px;width:44px;height:44px;object-fit:cover;flex-shrink:0"/>
            <div class="song-info" style="flex:1;min-width:0">
              <div class="song-title">{pl.name}</div>
              <div class="song-meta">{pl.subtitle}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--fg3);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Detail slide-in (album / playlist / artist) -->
  <div id="search-detail" class:open={detailOpen}>
    <div class="detail-hdr">
      <button class="back-btn" on:click={() => detailOpen = false}>‹ Search</button>
      <div class="detail-title">{detailType !== 'artist' ? detailTitle : ''}</div>
      <div></div>
    </div>
    {#if detailLoading}
      <div class="empty-wrap"><div class="spinner"></div></div>
    {:else if detailType === 'artist'}
      <!-- Artist hero -->
      {#if artistMeta?.image}
        <div class="artist-hero">
          <img class="artist-hero-img" src={artistMeta.image} alt={artistMeta.name} />
          <div class="artist-hero-overlay">
            <div class="artist-hero-name">{artistMeta.name}</div>
            {#if artistMeta.followers}<div class="artist-followers">{artistMeta.followers} followers</div>{/if}
          </div>
        </div>
      {:else}
        <div class="artist-hero-text">{detailTitle}</div>
      {/if}
      <!-- Top Songs -->
      {#if detailSongs.length}
        <div class="detail-section-title">Top Songs</div>
        {#each detailSongs as song, i}
          <SongRow {song} onPlay={() => play(song, detailSongs, i)} onMore={(s) => onMore(s)} />
        {/each}
      {/if}
      <!-- Albums -->
      {#if artistAlbums.length}
        <div class="detail-section-title">Albums</div>
        <div class="h-scroll" style="padding: 0 16px 16px; gap: 10px;">
          {#each artistAlbums as album}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openAlbumFromArtist(album.id, album.name)}>
              <img src={album.image} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{album.name}</div>
              <div class="card-sub">{album.subtitle}</div>
            </div>
          {/each}
        </div>
      {/if}
      {#if !detailSongs.length && !artistAlbums.length}
        <div class="empty-wrap">No content found</div>
      {/if}
    {:else if !detailSongs.length}
      <div class="empty-wrap">No songs found</div>
    {:else}
      {#each detailSongs as song, i}
        <SongRow {song} onPlay={() => play(song, detailSongs, i)} onMore={(s) => onMore(s)} />
      {/each}
    {/if}
  </div>

  <!-- Sub-detail: album from artist view -->
  <div id="search-subdetail" class:open={subDetailOpen}>
    <div class="detail-hdr">
      <button class="back-btn" on:click={() => subDetailOpen = false}>‹ {detailTitle}</button>
      <div class="detail-title">{subDetailTitle}</div>
      <div></div>
    </div>
    {#if subDetailLoading}
      <div class="empty-wrap"><div class="spinner"></div></div>
    {:else}
      {#each subDetailSongs as song, i}
        <SongRow {song} onPlay={() => play(song, subDetailSongs, i)} onMore={(s) => onMore(s)} />
      {/each}
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

  #search-detail {
    position: fixed; inset: 0; z-index: 50;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #search-detail.open { transform: translateX(0); }
  #search-subdetail {
    position: fixed; inset: 0; z-index: 55;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #search-subdetail.open { transform: translateX(0); }
  .detail-hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; padding-top: calc(16px + env(safe-area-inset-top)); }
  .back-btn { font-size: 15px; color: var(--accent); }
  .detail-title { font-size: 16px; font-weight: 700; text-align: center; flex: 1; }
  .empty-wrap { display: flex; align-items: center; justify-content: center; padding: 60px 16px; color: var(--fg3); font-size: 14px; }
  .detail-section-title { font-size: 13px; font-weight: 600; color: var(--fg3); padding: 12px 16px 4px; text-transform: uppercase; letter-spacing: .05em; }
  .artist-hero { position: relative; width: 100%; aspect-ratio: 1; max-height: 260px; overflow: hidden; }
  .artist-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .artist-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 50%); display: flex; flex-direction: column; justify-content: flex-end; padding: 16px; }
  .artist-hero-name { font-size: 26px; font-weight: 800; color: #fff; }
  .artist-followers { font-size: 13px; color: rgba(255,255,255,.6); }
  .artist-hero-text { font-size: 26px; font-weight: 800; padding: 20px 16px 8px; }
  .h-scroll { display: flex; overflow-x: auto; }
  .h-scroll::-webkit-scrollbar { display: none; }
  .content-card { flex-shrink: 0; width: 120px; cursor: pointer; }
  .card-img { width: 120px; height: 120px; border-radius: 10px; object-fit: cover; display: block; }
  .card-name { font-size: 12px; font-weight: 600; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-sub { font-size: 11px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
