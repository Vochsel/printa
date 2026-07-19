export function createModelWidgetHtml(origin: string) {
  const ORIGIN = JSON.stringify(origin);
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{color-scheme:light;--bg:#ffffff;--card:#fafafa;--field:#ffffff;--ink:#1c1c1f;--muted:#74747c;--line:#e6e6e9;--line-soft:#efeff1;--accent:#ff5d2e;--accent-ink:#fff;--stage:#131315;--radius:10px;--good:#16a34a;--warn:#d97706}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:transparent;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px}
    button,input,select,textarea{font:inherit;color:inherit}
    .app{position:relative;display:flex;height:min(600px,100dvh);overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--bg)}
    .app.is-fullscreen{height:100dvh;border:0;border-radius:0}
    /* Sidebar */
    aside{position:relative;z-index:5;display:flex;flex-direction:column;width:var(--side,300px);min-width:210px;max-width:440px;flex:0 0 auto;border-right:1px solid var(--line);background:var(--bg)}
    .app.side-collapsed aside{display:none}
    .side-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid var(--line)}
    .logo{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--ink);color:#fff}
    .name{flex:1;min-width:0;height:30px;padding:0 8px;border:0;border-radius:7px;background:transparent;font-size:13px;font-weight:600;outline:none}.name:hover,.name:focus{background:var(--card)}
    .side-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
    .sec{padding:13px 14px;border-bottom:1px solid var(--line-soft)}
    .sec-title{display:flex;align-items:center;justify-content:space-between;height:24px;font-size:12px;font-weight:600;color:rgba(28,28,31,.8)}
    .layers{margin-top:8px;display:grid;gap:2px}
    .layer{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:transparent;text-align:left;cursor:pointer;color:rgba(28,28,31,.72)}
    .layer:hover{background:var(--card)}.layer.active{background:#f0f0f2;color:var(--ink)}
    .layer .lt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600}
    .layer .lk{font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
    .field{display:grid;gap:6px;margin-bottom:11px}.field:last-child{margin-bottom:0}
    label.lbl,.lbl{font-size:11px;font-weight:500;color:var(--muted)}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    input.txt,select.sel,textarea.ta{width:100%;min-width:0;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--field);font-size:12.5px;font-weight:500;outline:none;transition:border-color .12s,box-shadow .12s}
    select.sel{height:34px;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2374747c' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;padding-right:30px;cursor:pointer}
    input.txt:focus,select.sel:focus,textarea.ta:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,93,46,.16)}
    input.num{font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace;font-size:11.5px}
    .num-wrap{position:relative}.num-wrap .u{position:absolute;right:9px;top:50%;transform:translateY(-50%);font:600 9px ui-monospace,monospace;color:var(--muted);pointer-events:none}
    .ta{height:auto;min-height:80px;padding:9px 10px;font:500 11px/1.5 ui-monospace,monospace;resize:vertical}
    .toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0;cursor:pointer}
    .toggle .tl{font-size:12px;font-weight:500}
    .sw{position:relative;width:34px;height:20px;flex:0 0 auto;border-radius:99px;background:var(--line);transition:.15s}.sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:.15s}
    .toggle input{position:absolute;opacity:0;pointer-events:none}.toggle input:checked+.sw{background:var(--accent)}.toggle input:checked+.sw::after{transform:translateX(14px)}
    .mat-dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;border:1px solid rgba(0,0,0,.12)}
    .mat-row{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--field)}
    .adv{margin-top:2px}.adv summary{list-style:none;display:flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--muted);cursor:pointer}.adv summary::-webkit-details-marker{display:none}.adv summary .ch{transition:transform .12s}.adv[open] summary .ch{transform:rotate(90deg)}.adv[open] summary{margin-bottom:10px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s;white-space:nowrap}
    .btn:hover{background:var(--card)}.btn svg{width:15px;height:15px}
    .btn.solid{border-color:var(--ink);background:var(--ink);color:#fff}.btn.solid:hover{background:#333}
    .btn.accent{border-color:var(--accent);background:var(--accent);color:#fff}.btn.accent:hover{filter:brightness(1.05)}
    .btn.ghost{border-color:transparent;background:transparent}.btn.ghost:hover{background:var(--card)}
    .btn.icon{width:34px;padding:0}.btn:disabled{opacity:.5;cursor:default}
    /* Stage */
    main{position:relative;flex:1;min-width:0;min-height:0;background:var(--stage);overflow:hidden}
    .topbar{position:absolute;z-index:4;top:0;left:0;right:0;display:flex;align-items:center;gap:8px;padding:10px 12px;pointer-events:none}
    .topbar>*{pointer-events:auto}
    .grow{flex:1}
    .pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:99px;background:rgba(20,20,22,.55);color:rgba(255,255,255,.72);font:600 11px ui-monospace,monospace;backdrop-filter:blur(10px)}
    .gbtn{display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(20,20,22,.5);color:rgba(255,255,255,.8);cursor:pointer;backdrop-filter:blur(10px)}.gbtn:hover{background:rgba(40,40,44,.7);color:#fff}.gbtn svg{width:16px;height:16px}
    .gbtn.on{border-color:var(--accent);background:rgba(255,93,46,.22);color:#ff8a63}
    .canvas{position:absolute;inset:0}.canvas canvas{display:block;width:100%;height:100%}
    .hint{position:absolute;z-index:2;top:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:99px;background:rgba(20,20,22,.5);color:rgba(255,255,255,.55);font:600 10px ui-monospace,monospace;backdrop-filter:blur(10px);pointer-events:none}
    .stats{position:absolute;z-index:2;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;max-width:calc(100% - 90px);overflow-x:auto;height:32px;padding:0 15px;border-radius:99px;background:rgba(20,20,22,.55);color:rgba(255,255,255,.72);font:600 10px ui-monospace,monospace;white-space:nowrap;backdrop-filter:blur(10px)}
    .stats b{color:rgba(255,255,255,.45);font-weight:600}.stats .ok{color:#4ade80}.stats .bad{color:#fbbf24}
    .slice{position:absolute;z-index:3;right:12px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
    .slice-track{height:150px;width:34px;display:none;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);border-radius:99px;background:rgba(20,20,22,.5);backdrop-filter:blur(10px)}
    .app.slicing .slice-track{display:flex}
    .slice-track input{writing-mode:vertical-lr;direction:rtl;width:20px;height:126px;accent-color:var(--accent);cursor:pointer}
    .foc{position:absolute;z-index:3;left:12px;bottom:12px}
    .loading{position:absolute;z-index:6;inset:0;display:grid;place-items:center;background:rgba(19,19,21,.72);color:rgba(255,255,255,.75);font:600 12px ui-monospace,monospace;backdrop-filter:blur(3px)}.loading[hidden]{display:none}
    .spin{width:15px;height:15px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:sp .8s linear infinite;display:inline-block;vertical-align:-2px;margin-right:7px}@keyframes sp{to{transform:rotate(360deg)}}
    /* Popover + modal */
    .pop{position:absolute;z-index:20;top:50px;right:12px;width:250px;border:1px solid var(--line);border-radius:14px;background:var(--bg);box-shadow:0 18px 45px rgba(0,0,0,.22);overflow:hidden}.pop[hidden]{display:none}
    .pop-h{padding:11px 14px 9px;border-bottom:1px solid var(--line-soft)}.pop-h b{font-size:13px}.pop-h p{margin:2px 0 0;font-size:10.5px;color:var(--muted)}
    .pop-b{padding:12px 14px;display:grid;gap:11px}
    .seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:9px;background:var(--card)}
    .seg button{height:28px;border:0;border-radius:6px;background:transparent;font-size:11.5px;font-weight:600;color:var(--muted);cursor:pointer;text-transform:capitalize}.seg button.on{background:var(--bg);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
    .backdrop{position:absolute;z-index:30;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.35);backdrop-filter:blur(2px)}.backdrop[hidden]{display:none}
    .modal{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:16px;background:var(--bg);box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden}
    .modal-h{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}.modal-h b{font-size:15px}.modal-h p{margin:3px 0 0;font-size:11.5px;color:var(--muted)}
    .modal-b{padding:16px 18px;overflow-y:auto}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .demo{display:flex;gap:11px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);text-align:left;cursor:pointer;transition:.12s}.demo:hover{border-color:#c9c9cf;background:var(--card)}.demo.on{border-color:rgba(255,93,46,.5);background:rgba(255,93,46,.05)}
    .demo .di{display:grid;place-items:center;width:30px;height:30px;flex:0 0 auto;border-radius:8px;background:var(--card);color:rgba(28,28,31,.7)}.demo.on .di{background:var(--accent);color:#fff}
    .demo b{font-size:12.5px}.demo span{display:block;margin-top:2px;font-size:10.5px;line-height:1.35;color:var(--muted)}
    .saved-row{display:flex;align-items:center;gap:8px;padding:3px;border-radius:9px}.saved-row:hover{background:var(--card)}
    .saved-row .sn{flex:1;min-width:0;display:flex;align-items:center;gap:9px;padding:7px 6px;border:0;background:transparent;text-align:left;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink)}
    .saved-row .st{font:500 10px ui-monospace,monospace;color:var(--muted)}
    .save-bar{display:flex;gap:8px;padding:13px 18px;border-bottom:1px solid var(--line);background:var(--card)}
    .kicker{margin:0 0 9px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--muted)}
    .err{margin-top:9px;padding:9px 11px;border-radius:9px;background:#fef2f2;color:#b91c1c;font-size:11px;line-height:1.4}.err[hidden]{display:none}
    .resizer{position:absolute;z-index:6;top:0;bottom:0;left:calc(var(--side,300px) - 3px);width:6px;cursor:col-resize}.app.side-collapsed .resizer{display:none}
    .muted-note{padding:9px 14px;border-top:1px solid var(--line-soft);font-size:10px;color:var(--muted)}
    @media(max-width:640px){.app{--side:250px}aside{position:absolute;inset:0 auto 0 0;box-shadow:12px 0 40px rgba(0,0,0,.12)}.resizer{display:none}}
  </style>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/"}}</script>
</head>
<body>
  <div class="app side-collapsed" id="app">
    <aside id="side">
      <div class="side-head">
        <span class="logo" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg></span>
        <input id="name" class="name" value="Model" aria-label="Model name" />
      </div>
      <div class="side-scroll" id="scroll">
        <div class="sec">
          <div class="sec-title"><span>Layers</span></div>
          <div class="layers" id="layers"></div>
        </div>
        <div class="sec" id="inspector"></div>
        <div class="muted-note">Every change re-runs <b>create_procedural_model</b>, so the chat result and STL stay in sync.</div>
      </div>
    </aside>
    <div class="resizer" id="resizer"></div>
    <main>
      <div class="canvas" id="canvas"></div>
      <div class="hint">Drag to orbit · scroll to zoom</div>
      <div class="topbar">
        <button class="gbtn" id="menu" aria-label="Show panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <span class="grow"></span>
        <span class="pill" id="state">Ready</span>
        <button class="gbtn" id="open" aria-label="Open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg></button>
        <button class="gbtn" id="view" aria-label="View settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <a class="gbtn" id="dl" href="#" aria-label="Download STL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg></a>
        <button class="gbtn" id="full" aria-label="Fullscreen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H4a1 1 0 0 0-1 1v4m18 0V4a1 1 0 0 0-1-1h-4M3 16v4a1 1 0 0 0 1 1h4m12-5v4a1 1 0 0 1-1 1h-4"/></svg></button>
      </div>
      <div class="slice">
        <button class="gbtn" id="slice" aria-label="Slice model"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></svg></button>
        <div class="slice-track"><input id="slice-range" type="range" min="0.02" max="1" step="0.005" value="1" aria-label="Slice height" /></div>
      </div>
      <button class="gbtn foc" id="focus" aria-label="Frame model"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="2.5"/></svg></button>
      <div class="loading" id="loading"><span><span class="spin"></span>Evaluating model…</span></div>

      <div class="pop" id="view-pop" hidden>
        <div class="pop-h"><b>View settings</b><p>Only changes the preview, never the print.</p></div>
        <div class="pop-b">
          <div class="field"><span class="lbl">Shading</span><div class="seg" id="shade"><button data-v="smooth" class="on">Smooth</button><button data-v="flat">Flat</button></div></div>
          <label class="toggle"><span class="tl">Print bed</span><input id="d-floor" type="checkbox" checked><span class="sw"></span></label>
          <label class="toggle"><span class="tl">Grid</span><input id="d-grid" type="checkbox" checked><span class="sw"></span></label>
          <label class="toggle"><span class="tl">Measurements</span><input id="d-dims" type="checkbox" checked><span class="sw"></span></label>
          <label class="toggle" style="border-top:1px solid var(--line-soft);padding-top:11px"><span class="tl">Interface sounds</span><input id="d-sfx" type="checkbox" checked><span class="sw"></span></label>
        </div>
      </div>

      <div class="backdrop" id="open-modal" hidden>
        <div class="modal">
          <div class="modal-h"><div><b>Open a model</b><p>Start from a demo, or reopen one you saved.</p></div><button class="btn ghost icon" id="open-x" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
          <div class="save-bar"><input id="save-name" class="txt" placeholder="Name this model…" /><button class="btn solid" id="save-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg><span>Save</span></button></div>
          <div class="modal-b">
            <div id="saved-wrap" hidden><p class="kicker">Saved models</p><div id="saved" style="margin-bottom:16px"></div></div>
            <p class="kicker">Starter models</p>
            <div class="grid2" id="demos"></div>
          </div>
        </div>
      </div>

      <div class="backdrop" id="spec-modal" hidden>
        <div class="modal">
          <div class="modal-h"><div><b>Model spec</b><p>The whole model as JSON or YAML.</p></div><button class="btn ghost icon" id="spec-x" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
          <div class="modal-b">
            <textarea id="spec" class="ta" style="min-height:300px;background:var(--stage);color:#f6f0e4;border-color:#2a2a2c" spellcheck="false"></textarea>
            <div id="spec-err" class="err" hidden></div>
            <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn accent" id="spec-apply"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg><span>Apply spec</span></button></div>
          </div>
        </div>
      </div>
    </main>
  </div>
  <script type="module">
    import * as THREE from "three";
    import {OrbitControls} from "three/addons/controls/OrbitControls.js";
    import {STLLoader} from "three/addons/loaders/STLLoader.js";
    const ORIGIN=${ORIGIN},el=id=>document.getElementById(id),app=el("app");

    /* ---- subtle sfx ---- */
    let actx=null,sfxOn=localStorage.getItem("printa.sfx-enabled")!=="false",lastTick=0;
    function ac(){if(!actx){const C=window.AudioContext||window.webkitAudioContext;if(C)actx=new C()}if(actx&&actx.state==="suspended")actx.resume();return actx}
    function tone(f,f2,d,g,t){if(!sfxOn)return;const c=ac();if(!c)return;const o=c.createOscillator(),ga=c.createGain(),lp=c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=Math.max(1200,f*2.4);o.type=t||"sine";o.frequency.setValueAtTime(f,c.currentTime);if(f2)o.frequency.exponentialRampToValueAtTime(f2,c.currentTime+d);ga.gain.setValueAtTime(0,c.currentTime);ga.gain.linearRampToValueAtTime(g,c.currentTime+.004);ga.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d);o.connect(lp).connect(ga).connect(c.destination);o.start();o.stop(c.currentTime+d+.02)}
    const sfx={tap:()=>tone(620,480,.05,.05,"triangle"),tick:()=>{const n=performance.now();if(n-lastTick<55)return;lastTick=n;tone(1150,950,.025,.022,"sine")},toggle:on=>tone(on?520:430,on?700:330,.07,.045,"triangle"),open:()=>tone(340,560,.09,.035,"sine"),close:()=>tone(540,320,.08,.03,"sine"),ok:()=>{tone(660,0,.06,.03,"sine");setTimeout(()=>tone(880,0,.09,.03,"sine"),55)},err:()=>tone(220,150,.14,.04,"triangle")};

    /* ---- three.js scene ---- */
    const scene=new THREE.Scene();scene.background=new THREE.Color("#131315");const camera=new THREE.PerspectiveCamera(34,1,.1,4000);camera.up.set(0,0,1);camera.position.set(150,-190,130);
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.localClippingEnabled=true;el("canvas").appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,0,45);
    scene.add(new THREE.HemisphereLight("#fff7e8","#182241",2.5));const key=new THREE.DirectionalLight("#fff0d5",5.2);key.position.set(-120,-150,240);key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);scene.add(key.target);const rim=new THREE.DirectionalLight("#748cff",4);rim.position.set(150,100,150);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(95,96),new THREE.MeshStandardMaterial({color:"#1c1c1a",roughness:.9,metalness:.05}));floor.position.z=-.25;floor.receiveShadow=true;scene.add(floor);
    const grid=new THREE.GridHelper(190,38,"#333","#242424");grid.rotation.x=Math.PI/2;grid.position.z=.03;scene.add(grid);
    let mesh=null,dims=null,token=0,zRange=[0,100],slice=1,shading="smooth",curMat="pla-orange";
    const MAT={"pla-orange":["#ff6b5a",.4,.03,.15],"pla-matte":["#ebe6d6",.8,0,.04],"pla-silk":["#b8a4ed",.22,.36,.5],petg:["#a4d4c5",.2,0,.4],resin:["#ffb084",.16,0,.7]};
    function makeMat(id){const p=MAT[id]||MAT["pla-orange"];return new THREE.MeshPhysicalMaterial({color:p[0],roughness:p[1],metalness:p[2],clearcoat:p[3],flatShading:shading==="flat"})}
    function applySlice(v){slice=v;if(!mesh)return;if(v>=1){mesh.material.clippingPlanes=[];mesh.material.side=THREE.FrontSide}else{const z=zRange[0]+(zRange[1]-zRange[0])*v;mesh.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,-1),z)];mesh.material.clipShadows=true;mesh.material.side=THREE.DoubleSide}mesh.material.needsUpdate=true}
    function fitEnv(m){const b=new THREE.Box3().setFromObject(m),s=b.getBoundingSphere(new THREE.Sphere()),r=Math.max(30,s.radius);key.position.set(s.center.x-r*1.1,s.center.y-r*1.4,s.center.z+r*2.1);key.target.position.copy(s.center);key.target.updateMatrixWorld();const sc=key.shadow.camera,e=r*1.75;sc.left=-e;sc.right=e;sc.top=e;sc.bottom=-e;sc.near=r*.2;sc.far=r*8;sc.updateProjectionMatrix();key.shadow.bias=-.0002;key.shadow.normalBias=r*.004;const es=Math.max(1,r/95);floor.scale.setScalar(es);grid.scale.setScalar(es);scene.fog=new THREE.Fog("#131315",Math.max(440,r*7),Math.max(900,r*16))}
    function frame(){if(!mesh)return;const b=new THREE.Box3().setFromObject(mesh);if(dims)b.expandByObject(dims);const s=b.getBoundingSphere(new THREE.Sphere()),d=Math.max(38,s.radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.15);camera.position.set(s.center.x+d*.75,s.center.y-d,s.center.z+d*.62);camera.near=Math.max(.1,d/150);camera.far=d*20;camera.updateProjectionMatrix();controls.target.copy(s.center);controls.update()}
    function disp(o){if(!o)return;o.traverse(c=>{if(c.geometry)c.geometry.dispose();const l=c.material?(Array.isArray(c.material)?c.material:[c.material]):[];l.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})})}
    function dimLabel(t,col,sz){const cv=document.createElement("canvas");cv.width=512;cv.height=128;const c=cv.getContext("2d");c.fillStyle="rgba(10,26,25,.92)";c.beginPath();c.roundRect(3,3,506,122,24);c.fill();c.strokeStyle=col;c.lineWidth=5;c.stroke();c.fillStyle="#fffaf0";c.font="700 48px ui-monospace,monospace";c.textAlign="center";c.textBaseline="middle";c.fillText(t,256,65);const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;const l=new THREE.Mesh(new THREE.PlaneGeometry(sz*4,sz),new THREE.MeshBasicMaterial({map:tx,transparent:true,depthTest:false,toneMapped:false}));l.renderOrder=12;return l}
    function ground(box,s,units){const g=new THREE.Group(),w=box.max.x-box.min.x,h=box.max.y-box.min.y,lg=Math.max(w,h),sc=units==="cm"?10:units==="in"?25.4:1,mg=Math.max((s.offset||9)*sc,lg*.045),ar=THREE.MathUtils.clamp(lg*.025,2.5,9),sz=THREE.MathUtils.clamp(lg*.035,4,10),z=.32,wy=box.min.y-mg,hx=box.min.x-mg,pr=s.precision??1;function ln(pts,col){const ge=new THREE.BufferGeometry().setFromPoints(pts),li=new THREE.LineSegments(ge,new THREE.LineBasicMaterial({color:col,depthTest:false}));li.renderOrder=10;g.add(li)}const v=(x,y)=>new THREE.Vector3(x,y,z);if(s.width!==false){ln([v(box.min.x,wy),v(box.max.x,wy),v(box.min.x,wy),v(box.min.x+ar,wy+ar*.52),v(box.min.x,wy),v(box.min.x+ar,wy-ar*.52),v(box.max.x,wy),v(box.max.x-ar,wy+ar*.52),v(box.max.x,wy),v(box.max.x-ar,wy-ar*.52)],"#ff6b8f");const l=dimLabel("W  "+(w/sc).toFixed(pr)+" "+units,"#ff6b8f",sz);l.position.set((box.min.x+box.max.x)/2,wy-sz*1.05,z+.03);g.add(l)}if(s.height!==false){ln([v(hx,box.min.y),v(hx,box.max.y),v(hx,box.min.y),v(hx+ar*.52,box.min.y+ar),v(hx,box.min.y),v(hx-ar*.52,box.min.y+ar),v(hx,box.max.y),v(hx+ar*.52,box.max.y-ar),v(hx,box.max.y),v(hx-ar*.52,box.max.y-ar)],"#b8a4ed");const l=dimLabel("H  "+(h/sc).toFixed(pr)+" "+units,"#b8a4ed",sz);l.rotation.z=Math.PI/2;l.position.set(hx-sz*1.05,(box.min.y+box.max.y)/2,z+.03);g.add(l)}return g}

    let displaySettings={floor:true,grid:true,dimensions:{visible:true,width:true,height:true,offset:9,precision:1}},curUnits="mm";
    async function show(data,replaceSpec){if(!data||!data.stlUrl)return;const cur=++token;el("loading").hidden=false;el("name").value=data.name||"Model";curUnits=data.units||"mm";curMat=data.materialPreset||"pla-orange";if(data.display)displaySettings=data.display;el("dl").href=data.stlUrl;el("spec").value=(replaceSpec&&data.spec)?data.spec:el("spec").value;setState(false,"Ready");
      el("stats-size").textContent=Number(data.widthMm).toFixed(1)+" × "+Number(data.depthMm).toFixed(1)+" × "+Number(data.heightMm).toFixed(1)+" mm";el("stats-tri").textContent=Number(data.triangles).toLocaleString()+" tris";el("stats-fit").className=data.exceedsBuildVolume?"bad":"ok";el("stats-fit").textContent=data.exceedsBuildVolume?"⚠ Too big":"✓ Fits printer";
      try{const r=await fetch(data.stlUrl);if(!r.ok)throw new Error("Model could not be loaded");const geo=new STLLoader().parse(await r.arrayBuffer());if(cur!==token){geo.dispose();return}geo.computeVertexNormals();geo.computeBoundingBox();if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()}if(dims){scene.remove(dims);disp(dims);dims=null}mesh=new THREE.Mesh(geo,makeMat(curMat));mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);if(geo.boundingBox)zRange=[geo.boundingBox.min.z,geo.boundingBox.max.z];applySlice(slice);fitEnv(mesh);applyDisplay();frame();currentDoc=data;renderInspector()}catch(e){setState(false,"Error");sfx.err()}finally{if(cur===token)el("loading").hidden=true}}
    function applyDisplay(){floor.visible=displaySettings.floor!==false;grid.visible=displaySettings.grid!==false;if(dims){scene.remove(dims);disp(dims);dims=null}if(mesh&&displaySettings.dimensions&&displaySettings.dimensions.visible!==false&&mesh.geometry.boundingBox){dims=ground(mesh.geometry.boundingBox,displaySettings.dimensions,curUnits);scene.add(dims)}}
    function setState(busy,txt){el("state").innerHTML=(busy?'<span class="spin" style="width:11px;height:11px"></span>':"")+txt}

    /* ---- host tool calls ---- */
    let seq=0;const pending=new Map();
    function reqHost(method,params,timeout=45000){return new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});parent.postMessage({jsonrpc:"2.0",id,method,params},"*");setTimeout(()=>{if(pending.has(id)){pending.delete(id);rej(new Error("Host request timed out"))}},timeout)})}
    function callTool(name,args){return reqHost("tools/call",{name,arguments:args})}
    async function run(args,replaceSpec){setState(true,"Building…");el("loading").hidden=false;try{const r=await callTool("create_procedural_model",args),d=r&&r.structuredContent;if(d){await show(d,replaceSpec!==false);sfx.ok()}}catch(e){setState(false,"Error");el("spec-err").textContent=e.message||"Could not build this spec.";el("spec-err").hidden=false;el("loading").hidden=true;sfx.err()}}

    /* ---- lightweight inspector (name/material/units + spec entry) ---- */
    let currentDoc=null;
    function nodeKindLabel(n){if(n.kind!=="shape")return n.kind;return n.source&&n.source.type||"shape"}
    function walk(node,depth,out){out.push({node,depth});if(node.kind==="assembly")node.children.forEach(c=>walk(c,depth+1,out));if(node.kind==="repeat")walk(node.child,depth+1,out);return out}
    function renderInspector(){const doc=currentDoc;if(!doc||!doc.spec){el("layers").innerHTML='<div style="padding:8px;color:var(--muted);font-size:11px">Open a model to begin.</div>';el("inspector").innerHTML="";return}
      let parsed=null;try{parsed=window.__lastParsed}catch{}
      // Layers come from the document if we can read it; otherwise show the single generated solid.
      el("layers").innerHTML="";const entries=(parsed&&parsed.root)?walk(parsed.root,0,[]):[{node:{id:doc.name||"model",kind:"shape",source:{type:"solid"}},depth:0}];
      entries.forEach(({node,depth})=>{const b=document.createElement("button");b.className="layer";b.style.paddingLeft=(8+depth*12)+"px";b.innerHTML='<span class="lt"></span><span class="lk"></span>';b.children[0].textContent=node.id;b.children[1].textContent=nodeKindLabel(node);el("layers").appendChild(b)});
      el("inspector").innerHTML='<div class="sec-title"><span>Model</span></div>'+
        '<div class="field" style="margin-top:8px"><span class="lbl">Material preview</span><div class="mat-row"><span class="mat-dot" style="background:'+(MAT[curMat]||MAT["pla-orange"])[0]+'"></span><span style="font-size:12.5px;font-weight:500;text-transform:capitalize">'+curMat.replace(/-/g," ")+'</span></div></div>'+
        '<div class="row2"><div class="field"><span class="lbl">Units</span><div class="mat-row" style="justify-content:center;font-weight:600">'+curUnits+'</div></div><div class="field"><span class="lbl">Volume</span><div class="mat-row" style="justify-content:center;font-family:ui-monospace,monospace;font-size:11px">'+(currentDoc?(Number(currentDoc.volumeEstimateMm3)/1000).toFixed(1)+" cm³":"—")+'</div></div></div>'+
        '<button class="btn" id="edit-spec" style="width:100%;margin-top:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/></svg>Edit full spec</button>';
      const es=el("edit-spec");if(es)es.onclick=()=>{sfx.open();el("spec-modal").hidden=false};
    }

    /* ---- demos + saved models ---- */
    const DEMOS=[["type-specimen","Type specimen","text"],["contour-spiral-vase","Contour spiral vase","form"],["zenith-twist","Zenith twist vase","form"],["fluted-bud-vase","Fluted bud vase","form"],["ripple-column-vase","Ripple column vase","form"],["spline-petal-dish","Spline petal dish","form"],["primitive-totem","Primitive totem","form"],["water-ripple-tile","Water ripple tile","sim"],["cloth-drape-study","Cloth drape study","sim"]];
    const ICON={text:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',sim:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"/></svg>',form:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>'};
    function renderDemos(active){el("demos").innerHTML="";DEMOS.forEach(([id,name,fam])=>{const b=document.createElement("button");b.className="demo"+(id===active?" on":"");b.innerHTML='<span class="di">'+ICON[fam]+'</span><span><b>'+name+'</b></span>';b.onclick=()=>{sfx.tap();el("open-modal").hidden=true;run({demo:id})};el("demos").appendChild(b)})}
    const SKEY="printa.saved-models";
    function loadSaved(){try{const a=JSON.parse(localStorage.getItem(SKEY)||"[]");return Array.isArray(a)?a.sort((x,y)=>y.savedAt-x.savedAt):[]}catch{return[]}}
    function renderSaved(){const s=loadSaved();el("saved-wrap").hidden=s.length===0;el("saved").innerHTML="";s.forEach(it=>{const r=document.createElement("div");r.className="saved-row";r.innerHTML='<button class="sn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+it.name+'</span><span class="st">'+timeAgo(it.savedAt)+'</span></button><button class="btn ghost icon" aria-label="Delete"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>';r.children[0].onclick=()=>{sfx.tap();el("open-modal").hidden=true;window.__lastParsed=it.document;run({spec:JSON.stringify(it.document)})};r.children[1].onclick=()=>{sfx.tap();const n=loadSaved().filter(x=>x.id!==it.id);localStorage.setItem(SKEY,JSON.stringify(n));renderSaved()};el("saved").appendChild(r)})}
    function timeAgo(t){const m=Math.round((Date.now()-t)/60000);if(m<1)return"just now";if(m<60)return m+"m";const h=Math.round(m/60);if(h<24)return h+"h";return new Date(t).toLocaleDateString()}
    function saveCurrent(){if(!currentDoc)return;const name=(el("save-name").value.trim()||currentDoc.name||"Untitled");let docObj=window.__lastParsed;try{if(!docObj&&currentDoc.spec)docObj=JSON.parse(currentDoc.spec)}catch{}if(!docObj)docObj={__spec:currentDoc.spec,name};const entry={id:"s"+Date.now().toString(36),name,savedAt:Date.now(),document:docObj};const n=[entry,...loadSaved().filter(x=>x.name!==name)].slice(0,60);localStorage.setItem(SKEY,JSON.stringify(n));sfx.ok();renderSaved();const sb=el("save-btn").querySelector("span");sb.textContent="Saved";setTimeout(()=>sb.textContent="Save",1400)}

    /* ---- wiring ---- */
    el("menu").onclick=()=>{sfx.tap();app.classList.toggle("side-collapsed")};
    el("name").addEventListener("input",()=>{if(currentDoc)currentDoc.name=el("name").value});
    el("focus").onclick=()=>{sfx.tap();frame()};
    el("open").onclick=()=>{sfx.open();el("save-name").value=currentDoc?currentDoc.name:"";renderDemos(null);renderSaved();el("open-modal").hidden=false};
    el("open-x").onclick=()=>{sfx.close();el("open-modal").hidden=true};
    el("save-btn").onclick=saveCurrent;
    el("spec-x").onclick=()=>{sfx.close();el("spec-modal").hidden=true};
    el("spec-apply").onclick=()=>{const s=el("spec").value.trim();if(!s)return;sfx.tap();el("spec-err").hidden=true;try{window.__lastParsed=JSON.parse(s)}catch{window.__lastParsed=null}run({spec:s}).then(()=>{if(el("state").textContent.indexOf("Error")<0)el("spec-modal").hidden=true})};
    el("dl").onclick=()=>sfx.tap();
    el("view").onclick=()=>{const p=el("view-pop");const o=p.hidden;p.hidden=!o;if(o)sfx.open();else sfx.close()};
    document.addEventListener("pointerdown",e=>{if(!el("view-pop").hidden&&!el("view-pop").contains(e.target)&&e.target!==el("view")&&!el("view").contains(e.target))el("view-pop").hidden=true},true);
    el("shade").querySelectorAll("button").forEach(b=>b.onclick=()=>{shading=b.dataset.v;sfx.toggle(shading==="smooth");el("shade").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));if(mesh){const pv=mesh.material;mesh.material=makeMat(curMat);pv.dispose();applySlice(slice)}});
    function bindDisp(id,key){el(id).onchange=()=>{sfx.toggle(el(id).checked);if(key==="dims")displaySettings.dimensions.visible=el(id).checked;else displaySettings[key]=el(id).checked;applyDisplay()}}
    bindDisp("d-floor","floor");bindDisp("d-grid","grid");bindDisp("d-dims","dims");
    el("d-sfx").checked=sfxOn;el("d-sfx").onchange=()=>{sfxOn=el("d-sfx").checked;localStorage.setItem("printa.sfx-enabled",String(sfxOn));if(sfxOn)sfx.toggle(true)};
    el("slice").onclick=()=>{const on=!app.classList.contains("slicing");app.classList.toggle("slicing",on);el("slice").classList.toggle("on",on);sfx.toggle(on);if(!on){slice=1;el("slice-range").value=1;applySlice(1)}};
    el("slice-range").addEventListener("input",e=>{sfx.tick();applySlice(Number(e.target.value))});

    /* ---- resizable sidebar ---- */
    const rz=el("resizer");let dragging=false;rz.addEventListener("pointerdown",e=>{dragging=true;rz.setPointerCapture(e.pointerId)});rz.addEventListener("pointermove",e=>{if(!dragging)return;const w=Math.max(210,Math.min(440,e.clientX-app.getBoundingClientRect().left));app.style.setProperty("--side",w+"px")});rz.addEventListener("pointerup",e=>{dragging=false;rz.releasePointerCapture(e.pointerId)});

    /* ---- fullscreen ---- */
    let dm="inline";function setDM(m){dm=m==="fullscreen"?"fullscreen":"inline";app.classList.toggle("is-fullscreen",dm==="fullscreen");requestAnimationFrame(()=>{resize();reportH()})}
    async function toggleFull(){const t=dm==="fullscreen"?"inline":"fullscreen";sfx.tap();try{let r;if(window.openai&&window.openai.requestDisplayMode)r=await window.openai.requestDisplayMode({mode:t});else r=await reqHost("ui/request-display-mode",{mode:t},4000);setDM(r&&r.mode||t)}catch{try{if(t==="fullscreen"&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();setDM(t)}catch{}}}
    el("full").onclick=toggleFull;document.addEventListener("fullscreenchange",()=>setDM(document.fullscreenElement?"fullscreen":"inline"));
    function reportH(){if(dm!=="inline")return;const h=600;if(window.openai&&window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight(h);parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:Math.ceil(innerWidth),height:h}},"*")}

    window.addEventListener("message",e=>{if(e.source!==parent)return;const m=e.data;if(!m||m.jsonrpc!=="2.0")return;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result);return}const d=m.params&&m.params.structuredContent;if(d&&(m.method==="ui/notifications/tool-result"||m.method==="ui/notifications/tool-input"))show(d,true);if(m.method==="ui/notifications/host-context-changed"&&m.params&&m.params.displayMode)setDM(m.params.displayMode)});

    function resize(){const b=el("canvas").getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/Math.max(b.height,1);camera.updateProjectionMatrix()}
    new ResizeObserver(resize).observe(el("canvas"));resize();
    (function loop(){requestAnimationFrame(loop);controls.update();renderer.render(scene,camera)})();

    // stats spans injected into the stats bar
    const statsBar=document.createElement("div");statsBar.className="stats";statsBar.innerHTML='<span><b>Size</b> <span id="stats-size">—</span></span><span><b>Mesh</b> <span id="stats-tri">—</span></span><span id="stats-fit" class="ok">✓ Fits printer</span>';document.querySelector("main").appendChild(statsBar);

    renderInspector();
    const initial=(window.openai&&window.openai.toolOutput)||(window.openai&&window.openai.toolInput);if(initial)show(initial,true);else run({demo:"type-specimen"});
    requestAnimationFrame(reportH);
  </script>
</body>
</html>`;
}
