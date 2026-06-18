<script>
  import { EQ_BANDS } from '$lib/audioEngine.js';

  export let gains = [];
  export let eqOn = true;
  export let onSliderChange = (i, e) => {};
</script>

<!-- D26: extracted from SettingsTab — reusable EQ band sliders -->
<div class="eq-sliders">
  {#each EQ_BANDS as band, i}
    <div class="eq-band">
      <input
        id="eq-band-{i}"
        class="eq-band-slider"
        type="range" min="-12" max="12" step="0.1"
        value={gains[i] ?? 0}
        disabled={!eqOn}
        on:input={(e) => onSliderChange(i, e)}
        aria-label="{band.label} EQ band"
        aria-valuemin="-12" aria-valuemax="12"
        aria-valuenow={gains[i] ?? 0}
        style="writing-mode:vertical-lr;direction:rtl;"
      />
      <div class="eq-band-label">{band.label}</div>
    </div>
  {/each}
</div>

<style>
  .eq-sliders { display: flex; justify-content: space-between; padding: 8px 4px 4px; gap: 2px; }
  .eq-band { display: flex; flex-direction: column; align-items: center; flex: 1; }
  .eq-band-slider {
    -webkit-appearance: none; appearance: none;
    width: 100px; height: 4px;
    background: rgba(255,255,255,.15);
    border-radius: 2px; cursor: pointer;
    touch-action: none;
  }
  .eq-band-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: var(--accent);
    box-shadow: 0 0 4px rgba(0,0,0,.4);
  }
  .eq-band-slider:disabled { opacity: 0.35; cursor: default; }
  .eq-band-label { font-size: 9px; color: var(--fg3); margin-top: 4px; text-align: center; }
</style>
