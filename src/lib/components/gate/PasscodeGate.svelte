<script>
  import { tryUnlock } from '$lib/stores/gate.js';

  let inputVal = '';
  let errorMsg = '';
  let shaking = false;

  async function attempt() {
    if (!inputVal.trim()) return;
    const ok = await tryUnlock(inputVal);
    if (ok) return; // gate store updates → layout hides gate
    errorMsg = 'Incorrect passcode';
    shaking = true;
    inputVal = '';
    setTimeout(() => { shaking = false; errorMsg = ''; }, 600);
  }

  function onKeydown(e) { if (e.key === 'Enter') attempt(); }
</script>

<div id="gate">
  <div id="gate-icon">🎵</div>
  <div id="gate-title">MusicPlayer</div>
  <div id="gate-sub">Private access — enter your passcode</div>
  <input
    id="gate-input"
    type="password"
    placeholder="••••••••"
    autocomplete="off"
    inputmode="text"
    bind:value={inputVal}
    on:keydown={onKeydown}
    class:shake={shaking}
  />
  <button id="gate-btn" on:click={attempt}>Unlock</button>
  <div id="gate-err">{errorMsg}</div>
</div>

<style>
  #gate {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: var(--bg); gap: 12px; padding: 24px;
  }
  #gate-icon { font-size: 3rem; }
  #gate-title { font-size: 1.4rem; font-weight: 700; color: var(--fg); }
  #gate-sub { font-size: 0.85rem; color: var(--fg3); text-align: center; }
  #gate-input {
    width: 100%; max-width: 280px;
    background: var(--bg3); border: 1px solid rgba(255,255,255,.12);
    border-radius: var(--radius); padding: 12px 16px;
    color: var(--fg); font-size: 1rem; text-align: center;
    letter-spacing: .2em;
  }
  #gate-input:focus { border-color: var(--accent); outline: none; }
  #gate-btn {
    background: var(--accent); color: #fff;
    border-radius: var(--radius); padding: 12px 32px;
    font-size: 0.95rem; font-weight: 600; width: 100%; max-width: 280px;
    transition: opacity .15s;
  }
  #gate-btn:active { opacity: .8; }
  #gate-err { font-size: 0.8rem; color: #ef4444; min-height: 16px; }
  @keyframes shake {
    0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 60%{transform:translateX(8px)}
  }
  .shake { animation: shake .35s ease; }
</style>
