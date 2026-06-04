<script>
  import { activeTab, toast } from '$lib/stores/ui.js';
  import { eqState } from '$lib/stores/eq.js';
  import * as audioEngine from '$lib/audioEngine.js';
  import { EQ_BANDS, EQ_PRESETS } from '$lib/audioEngine.js';
  import { Log, getGhCfg, saveGhCfg, uploadLogsToGithub } from '$lib/logger.js';
  import { APP_VERSION, getEnv, setEnv, isStaging } from '$lib/api.js';
  import { idbGetAll, idbClear } from '$lib/idb.js';
  import { downloadedIds, playlists } from '$lib/stores/library.js';
  import { intelGetStats, intelReset } from '$lib/smartPlay.js';

  $: gains  = $eqState?.gains  ?? new Array(10).fill(0);
  $: eqOn   = $eqState?.on     ?? true;
  $: preset = $eqState?.preset ?? 'Custom';

  let ghPat = getGhCfg().pat || '';
  let logFilter = 'ALL';
  $: logs = Log.all().filter(l => logFilter === 'ALL' || l.level === logFilter).slice(-100).reverse();
  $: stats = intelGetStats();

  function onSliderChange(i, e) { audioEngine.setEqGain(i, parseFloat(e.target.value)); }
  function loadPreset(name) { audioEngine.loadEqPreset(name); }
  function toggleEq() { audioEngine.setEqEnabled(!eqOn); }

  function saveGhPat() {
    const cfg = getGhCfg();
    cfg.pat = ghPat;
    saveGhCfg(cfg);
    toast('Token saved');
  }

  async function clearDownloads() {
    await idbClear();
    downloadedIds.set(new Set());
    toast('Downloads cleared');
  }

  function clearLogs() { Log.clear(); logs = []; toast('Logs cleared'); }
  function exportLogs() {
    const blob = new Blob([JSON.stringify(Log.all(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'musicplayer-logs.json';
    a.click();
  }

  const PRESET_LABELS = { flat:'Flat', bass:'Bass', vocal:'Vocal', treble:'Treble', vshape:'V-Shape', bollywood:'Bollywood', punjabi:'Punjabi', r_and_b:'R&B' };
  const DISPLAY_PRESETS = ['flat', 'bass', 'vocal', 'treble', 'vshape', 'bollywood', 'punjabi', 'r_and_b'];
</script>

<div class="tab-pane" class:active={$activeTab === 'settings'} id="tab-settings">
  <div class="tab-header">Settings</div>

  <!-- EQ Section -->
  <div class="settings-section">
    <div class="section-label">EQUALIZER</div>
    <div id="settings-eq-wrap">
      <div class="seq-header">
        <span>10-Band EQ</span>
        <button id="seq-power" class:active={eqOn} on:click={toggleEq}>⏻</button>
      </div>
      <div class="seq-presets">
        {#each DISPLAY_PRESETS as name}
          <button class="seq-preset-btn" class:active={preset === name} on:click={() => loadPreset(name)}>
            {PRESET_LABELS[name] ?? name}
          </button>
        {/each}
      </div>
      <div class="seq-sliders">
        {#each EQ_BANDS as band, i}
          <div class="seq-band">
            <input
              id="seq-band-{i}"
              class="seq-band-slider"
              type="range" min="-12" max="12" step="0.1"
              value={gains[i] ?? 0}
              disabled={!eqOn}
              on:input={(e) => onSliderChange(i, e)}
              style="writing-mode:vertical-lr;direction:rtl;"
            />
            <div class="seq-band-label">{band.label}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- About -->
  <div class="settings-section">
    <div class="section-label">ABOUT</div>
    <div class="settings-row">
      <span>Version</span><span class="settings-val">v{APP_VERSION}</span>
    </div>
    <div class="settings-row">
      <span>Environment</span>
      <button class="settings-btn sec" on:click={() => { setEnv(isStaging() ? 'production' : 'staging'); window.location.reload(); }}>
        {isStaging() ? 'Switch to Production' : 'Switch to Staging'}
      </button>
    </div>
    <div class="settings-row">
      <span>Data source</span><span class="settings-val">JioSaavn (SIGMA)</span>
    </div>
    <div class="settings-row">
      <span>Logs stored</span><span class="settings-val">{Log.count()}</span>
    </div>
  </div>

  <!-- Memory -->
  <div class="settings-section">
    <div class="section-label">MEMORY</div>
    <div class="settings-row">
      <span>Total plays</span><span class="settings-val">{stats.totalPlays}</span>
    </div>
    {#if stats.topArtist}
      <div class="settings-row">
        <span>Top artist</span><span class="settings-val">{stats.topArtist.name}</span>
      </div>
    {/if}
    <div class="settings-row">
      <span>Listening flows</span><span class="settings-val">{stats.flowCount}</span>
    </div>
    <div class="settings-row">
      <span>Songs tracked</span><span class="settings-val">{stats.songCount}</span>
    </div>
    <button class="settings-btn danger" on:click={() => { intelReset(); toast('Listening history cleared'); }}>
      Clear Listening History
    </button>
  </div>

  <!-- Offline -->
  <div class="settings-section">
    <div class="section-label">OFFLINE STORAGE</div>
    <div class="settings-row">
      <span>Downloaded songs</span><span class="settings-val">{$downloadedIds.size}</span>
    </div>
    <button class="settings-btn danger" on:click={clearDownloads}>Clear All Downloads</button>
  </div>

  <!-- GitHub -->
  <div class="settings-section">
    <div class="section-label">GITHUB LOG UPLOAD</div>
    <div class="settings-row">
      <span>Personal Access Token</span>
    </div>
    <input class="settings-input" type="password" placeholder="ghp_..." bind:value={ghPat} />
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="settings-btn" on:click={saveGhPat}>Save Token</button>
      <button class="settings-btn sec" on:click={() => uploadLogsToGithub(false, t => toast(t))}>Upload Now</button>
    </div>
    <p class="settings-note">Token stored locally only. Never sent to our servers.</p>
  </div>

  <!-- Logs -->
  <div class="settings-section">
    <div class="section-label">DIAGNOSTIC LOGS</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
      <select class="settings-select" bind:value={logFilter}>
        {#each ['ALL','INFO','WARN','ERROR'] as f}<option value={f}>{f}</option>{/each}
      </select>
      <button class="settings-btn sec" on:click={exportLogs}>Export</button>
      <button class="settings-btn danger" on:click={clearLogs}>Clear</button>
    </div>
    <div class="log-view">
      {#each logs as entry}
        <div class="log-entry log-{entry.level.toLowerCase()}">
          <span class="log-ts">{entry.ts.slice(11,19)}</span>
          <span class="log-level">{entry.level}</span>
          <span class="log-msg">{entry.msg}</span>
        </div>
      {/each}
      {#if !logs.length}<div class="empty-wrap" style="height:60px">No logs</div>{/if}
    </div>
  </div>
</div>

<style>
  .tab-header { font-size: 22px; font-weight: 700; padding: 16px 16px 8px; }
  .settings-section { padding: 0 16px 16px; }
  .section-label { font-size: 11px; font-weight: 700; color: var(--fg3); letter-spacing: .08em; padding: 12px 0 6px; }
  .settings-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 14px; }
  .settings-val { color: var(--fg3); font-size: 13px; }
  .settings-btn { padding: 8px 16px; border-radius: var(--radius); background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; margin: 4px 0; }
  .settings-btn.sec { background: var(--bg3); color: var(--fg); }
  .settings-btn.danger { background: rgba(239,68,68,.15); color: #ef4444; }
  .settings-input { width: 100%; background: var(--bg3); border: 1px solid rgba(255,255,255,.12); border-radius: var(--radius); padding: 10px 12px; color: var(--fg); font-size: 14px; margin-top: 4px; }
  .settings-note { font-size: 11px; color: var(--fg3); margin-top: 4px; }
  .settings-select { background: var(--bg3); color: var(--fg); border: 1px solid rgba(255,255,255,.12); border-radius: var(--radius); padding: 6px 10px; font-size: 13px; flex: 1; }
  /* Settings EQ */
  .seq-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  #seq-power { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.08); color: var(--fg3); font-size: 14px; }
  #seq-power.active { background: var(--accent); color: #fff; }
  .seq-presets { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 10px; }
  .seq-preset-btn { flex-shrink: 0; padding: 4px 10px; border-radius: 20px; font-size: 11px; background: var(--bg3); color: var(--fg3); border: 1px solid rgba(255,255,255,.08); }
  .seq-preset-btn.active { background: var(--accent); color: #fff; border-color: transparent; }
  .seq-sliders { display: flex; justify-content: space-between; height: 110px; }
  .seq-band { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
  .seq-band-slider { -webkit-appearance: slider-vertical; appearance: auto; width: 20px; flex: 1; accent-color: var(--accent); }
  .seq-band-slider:disabled { opacity: .3; }
  .seq-band-label { font-size: 8px; color: var(--fg3); }
  /* Log viewer */
  .log-view { max-height: 260px; overflow-y: auto; background: var(--bg3); border-radius: var(--radius); padding: 8px; }
  .log-entry { font-size: 11px; font-family: monospace; padding: 2px 0; display: flex; gap: 6px; }
  .log-ts { color: var(--fg3); flex-shrink: 0; }
  .log-level { font-weight: 700; flex-shrink: 0; width: 36px; }
  .log-entry.log-warn .log-level { color: #f59e0b; }
  .log-entry.log-error .log-level { color: #ef4444; }
  .log-msg { color: var(--fg2); word-break: break-all; }
</style>
