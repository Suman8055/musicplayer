<script>
  import { promptOpen, promptData, closePrompt } from '$lib/stores/ui.js';
  import { onMount } from 'svelte';

  let inputEl;
  $: if ($promptOpen && inputEl) setTimeout(() => inputEl?.focus(), 100);

  function confirm() {
    const val = $promptData.value?.trim();
    if (val) $promptData.onOk?.(val);
    closePrompt();
  }
  function onKeydown(e) { if (e.key === 'Enter') confirm(); }
</script>

{#if $promptOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div id="prompt-wrap" on:click={closePrompt}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div id="prompt-box" on:click|stopPropagation>
      <div class="prompt-title">{$promptData.title}</div>
      <div class="prompt-body">
        <input
          bind:this={inputEl}
          bind:value={$promptData.value}
          class="prompt-input"
          type="text"
          on:keydown={onKeydown}
        />
      </div>
      <div class="prompt-btns">
        <button class="prompt-btn cancel" on:click={closePrompt}>Cancel</button>
        <button class="prompt-btn ok" on:click={confirm}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  #prompt-wrap {
    position: fixed; inset: 0; z-index: 160;
    background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center;
    animation: fade-in .15s ease;
  }
  #prompt-box {
    background: var(--bg2); border-radius: var(--radius2);
    width: calc(100% - 48px); max-width: 320px;
    padding: 20px 20px 16px;
    animation: scale-in .18s cubic-bezier(.32,.72,0,1);
  }
  .prompt-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .prompt-input {
    width: 100%; background: var(--bg3);
    border: 1px solid rgba(255,255,255,.12); border-radius: var(--radius);
    padding: 10px 12px; color: var(--fg); font-size: 15px;
  }
  .prompt-input:focus { border-color: var(--accent); }
  .prompt-btns { display: flex; gap: 8px; margin-top: 16px; }
  .prompt-btn { flex: 1; padding: 10px; border-radius: var(--radius); font-size: 15px; font-weight: 600; }
  .cancel { background: var(--bg3); color: var(--fg3); }
  .ok { background: var(--accent); color: #fff; }
  @keyframes fade-in { from { opacity: 0 } }
  @keyframes scale-in { from { transform: scale(.9); opacity: 0 } }
</style>
