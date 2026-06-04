<script>
  import { eqSheetOpen } from '$lib/stores/ui.js';
  import { eqState } from '$lib/stores/eq.js';
  import * as audioEngine from '$lib/audioEngine.js';
  import { EQ_BANDS, EQ_PRESETS } from '$lib/audioEngine.js';

  const PRESET_LABELS = { flat: 'Flat', bass: 'Bass', vocal: 'Vocal', treble: 'Treble', vshape: 'V-Shape', bollywood: 'Bollywood', punjabi: 'Punjabi', classical: 'Classical', podcast: 'Podcast', r_and_b: 'R&B' };
  const DISPLAY_PRESETS = ['flat', 'bass', 'vocal', 'treble', 'vshape', 'bollywood', 'punjabi', 'r_and_b'];

  $: gains  = $eqState?.gains  ?? new Array(10).fill(0);
  $: eqOn   = $eqState?.on     ?? true;
  $: preset = $eqState?.preset ?? 'Custom';

  function onSliderChange(i, e) {
    audioEngine.setEqGain(i, parseFloat(e.target.value));
  }

  function onToggle() { audioEngine.setEqEnabled(!eqOn); }
  function loadPreset(name) { audioEngine.loadEqPreset(name); }
  function close() { eqSheetOpen.set(false); }
</script>

{#if $eqSheetOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div id="eq-sheet">
    <div id="eq-backdrop" on:click={close}></div>
    <div id="eq-box">
      <div class="eq-handle"></div>
      <div id="eq-header">
        <span id="eq-title">Equalizer</span>
        <button id="eq-power" class:active={eqOn} on:click={onToggle}>⏻</button>
      </div>
      <div id="eq-presets">
        {#each DISPLAY_PRESETS as name}
          <button class="eq-preset-btn" class:active={preset === name} on:click={() => loadPreset(name)}>
            {PRESET_LABELS[name] ?? name}
          </button>
        {/each}
      </div>
      <div id="eq-sliders">
        {#each EQ_BANDS as band, i}
          <div class="eq-band">
            <input
              id="eq-slider-{i}"
              class="eq-band-slider"
              type="range" min="-12" max="12" step="0.1"
              value={gains[i] ?? 0}
              disabled={!eqOn}
              on:input={(e) => onSliderChange(i, e)}
              style="writing-mode: vertical-lr; direction: rtl;"
            />
            <div class="eq-band-label">{band.label}</div>
          </div>
        {/each}
      </div>
      <button id="eq-close-btn" on:click={close}>Done</button>
    </div>
  </div>
{/if}

<style>
  #eq-sheet {
    position: fixed; inset: 0; z-index: 90;
    display: flex; align-items: flex-end;
  }
  #eq-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
  #eq-box {
    position: relative; z-index: 1;
    width: 100%; background: var(--bg2);
    border-radius: var(--radius2) var(--radius2) 0 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    animation: slide-up .25s cubic-bezier(.32,.72,0,1);
  }
  .eq-handle { width: 36px; height: 4px; background: rgba(255,255,255,.2); border-radius: 2px; margin: 0 auto 14px; }
  #eq-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  #eq-title { font-size: 15px; font-weight: 700; }
  #eq-power { width: 30px; height: 30px; border-radius: 50%; font-size: 16px; background: rgba(255,255,255,.08); color: var(--fg3); transition: background .15s, color .15s; }
  #eq-power.active { background: var(--accent); color: #fff; }
  #eq-presets { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; }
  .eq-preset-btn { flex-shrink: 0; padding: 5px 12px; border-radius: 20px; font-size: 12px; background: var(--bg3); color: var(--fg3); border: 1px solid rgba(255,255,255,.08); transition: background .15s, color .15s; }
  .eq-preset-btn.active { background: var(--accent); color: #fff; border-color: transparent; }
  #eq-sliders { display: flex; justify-content: space-between; height: 130px; padding: 8px 0; }
  .eq-band { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
  .eq-band-slider {
    -webkit-appearance: slider-vertical; appearance: auto;
    width: 22px; flex: 1; cursor: pointer; accent-color: var(--accent);
    opacity: 1; transition: opacity .15s;
  }
  .eq-band-slider:disabled { opacity: .3; }
  .eq-band-label { font-size: 9px; color: var(--fg3); }
  #eq-close-btn {
    display: block; width: 100%; margin-top: 14px;
    padding: 12px; border-radius: var(--radius);
    background: var(--bg3); color: var(--fg); font-size: 15px; font-weight: 600;
  }
  @keyframes slide-up { from { transform: translateY(100%) } }
</style>
