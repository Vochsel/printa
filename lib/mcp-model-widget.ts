// The interactive MCP App shown inside ChatGPT (and any other MCP Apps host)
// for `create_procedural_model`.
//
// Hosts differ in how they hand a widget its data, and getting any one of them
// wrong used to leave the frame blank. This widget therefore accepts data from
// every path at once and never lets a single failure take the whole UI down:
//
//   1. `window.openai.toolOutput` — ChatGPT injects this global. It is NOT
//      guaranteed to exist when the module first evaluates, so we also listen
//      for the `openai:set_globals` event and poll briefly. Reading it once at
//      startup (the previous behaviour) is what left the widget spinning.
//   2. `@modelcontextprotocol/ext-apps` — the MCP Apps SDK handshake. Loaded
//      dynamically: if the CDN is blocked the widget still works.
//   3. Raw `postMessage` JSON-RPC — the same wire protocol as (2), implemented
//      inline as a fallback so we never depend on the SDK being reachable.
//   4. `/api/model/inspect` on our own origin — a last-resort self-bootstrap so
//      an embedded widget always shows a model instead of a dead spinner.
//
// Sizing matters just as much: an MCP host sizes the iframe from what the
// widget reports. Reporting nothing collapses the frame, which reads as
// "nothing rendered". We report an intrinsic height on load, on resize, and
// whenever the display mode changes.
export function createModelWidgetHtml(origin: string) {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Printa — printable model</title>
  <style>
    :root{
      color-scheme:light dark;
      --stage:#0d0f11;
      --surface:#ffffff;
      --surface-sunk:#f6f6f7;
      --line:#e4e4e7;
      --ink:#18181b;
      --body:#3f3f46;
      --muted:#71717a;
      --accent:#6e56cf;
      --accent-ink:#ffffff;
      --pink:#ff4d8b;
      --ok:#0f9d63;
      --warn:#b45309;
      --danger:#dc2626;
      --danger-bg:#fef2f2;
      --code-bg:#17171a;
      --code-ink:#ededf0;
      --radius:14px;
      --shadow:0 18px 44px -22px rgba(9,9,11,.5);
      --frame-h:520px;
    }
    @media (prefers-color-scheme: dark){
      :root:not([data-theme="light"]){
        --surface:#1c1c1f;--surface-sunk:#242428;--line:#33333a;
        --ink:#f4f4f5;--body:#d4d4d8;--muted:#a1a1aa;
        --danger-bg:#2a1416;--danger:#fca5a5;--ok:#34d399;--warn:#fbbf24;
        --code-bg:#111114;--code-ink:#e4e4e7;
        --shadow:0 18px 44px -22px rgba(0,0,0,.75);
      }
    }
    :root[data-theme="dark"]{
      --surface:#1c1c1f;--surface-sunk:#242428;--line:#33333a;
      --ink:#f4f4f5;--body:#d4d4d8;--muted:#a1a1aa;
      --danger-bg:#2a1416;--danger:#fca5a5;--ok:#34d399;--warn:#fbbf24;
      --code-bg:#111114;--code-ink:#e4e4e7;
      --shadow:0 18px 44px -22px rgba(0,0,0,.75);
    }

    *{box-sizing:border-box;min-width:0}
    html,body{height:100%}
    body{margin:0;background:transparent;color:var(--ink);
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;
      -webkit-font-smoothing:antialiased}
    button{font:inherit;color:inherit;cursor:pointer}
    svg{display:block;flex:0 0 auto}

    /* The whole widget is one stage; every control floats over it, so toggling
       a panel never reflows the WebGL canvas. */
    .app{position:relative;height:var(--frame-h);overflow:hidden;border-radius:var(--radius);
      background:var(--stage);isolation:isolate}
    .app.is-fullscreen{height:100dvh;border-radius:0}
    .canvas{position:absolute;inset:0}
    .canvas canvas{display:block;width:100%;height:100%}

    /* ---- top bar ---- */
    .bar{position:absolute;z-index:3;inset:10px 10px auto;display:flex;align-items:center;gap:8px;
      pointer-events:none}
    .id{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 12px 7px 8px;border-radius:999px;
      border:1px solid rgba(255,255,255,.12);background:rgba(10,10,12,.55);backdrop-filter:blur(12px)}
    .mark{display:grid;place-items:center;width:22px;height:22px;flex:0 0 auto;border-radius:7px;
      background:var(--pink);color:#fff;font-size:11px;font-weight:800}
    .id b{overflow:hidden;color:#fff;font-size:12.5px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
    .id span{flex:0 0 auto;color:rgba(255,255,255,.55);font-size:11.5px;font-variant-numeric:tabular-nums}
    .id span::before{content:"·";margin-right:7px;color:rgba(255,255,255,.3)}
    .tools{margin-left:auto;display:flex;align-items:center;gap:6px;pointer-events:auto}
    .icon{display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.12);
      border-radius:10px;background:rgba(10,10,12,.55);color:rgba(255,255,255,.8);
      backdrop-filter:blur(12px);transition:background .15s,color .15s}
    .icon:hover{background:rgba(30,30,36,.8);color:#fff}
    .icon.is-on{border-color:transparent;background:var(--accent);color:var(--accent-ink)}
    .stl{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;
      background:#fff;color:#18181b;text-decoration:none;font-size:12.5px;font-weight:650}
    .stl:hover{background:rgba(255,255,255,.88)}

    /* ---- bottom stat bar ---- */
    .stats{position:absolute;z-index:3;left:10px;right:10px;bottom:10px;display:flex;flex-wrap:wrap;
      align-items:center;gap:6px;pointer-events:none;transition:left .22s ease}
    /* Slide clear of the spec sheet instead of being sliced in half by it. */
    .app.sheet-open .stats{left:calc(min(340px,86%) + 20px)}
    .chip{display:inline-flex;align-items:baseline;gap:6px;padding:6px 11px;border-radius:999px;
      border:1px solid rgba(255,255,255,.12);background:rgba(10,10,12,.55);color:rgba(255,255,255,.85);
      font-size:11.5px;font-variant-numeric:tabular-nums;backdrop-filter:blur(12px)}
    .chip small{color:rgba(255,255,255,.45);font-size:10px;font-weight:600;letter-spacing:.04em;
      text-transform:uppercase}
    .chip.ok{border-color:rgba(52,211,153,.32);color:#a7f3d0}
    .chip.warn{border-color:rgba(251,191,36,.38);color:#fde68a}
    .chip.link{margin-left:auto;pointer-events:auto;text-decoration:none}
    .chip.link:hover{background:rgba(30,30,36,.8);color:#fff}

    /* ---- spec sheet (slides over the stage) ---- */
    .sheet{position:absolute;z-index:5;inset:0 auto 0 0;width:min(340px,86%);display:flex;
      flex-direction:column;border-right:1px solid var(--line);background:var(--surface);
      box-shadow:var(--shadow);transform:translateX(-101%);transition:transform .22s ease;
      visibility:hidden}
    .sheet.is-open{transform:none;visibility:visible}
    .sheet-head{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}
    .sheet-head strong{font-size:13px;font-weight:650}
    .sheet-head p{margin:2px 0 0;color:var(--muted);font-size:11.5px;line-height:1.4}
    .close{display:grid;place-items:center;width:28px;height:28px;margin-left:auto;align-self:flex-start;
      border:0;border-radius:8px;background:var(--surface-sunk);color:var(--muted)}
    .close:hover{color:var(--ink)}
    .sheet-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:4px 14px 14px;
      overflow:auto}
    .label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;
      color:var(--body);font-size:11.5px;font-weight:600}
    .label small{color:var(--muted);font-size:10.5px;font-weight:500}
    .presets{display:flex;flex-wrap:wrap;gap:6px}
    .presets button{padding:6px 11px;border:1px solid var(--line);border-radius:999px;
      background:var(--surface);color:var(--body);font-size:11.5px;font-weight:550;
      transition:border-color .15s,background .15s,color .15s}
    .presets button:hover{border-color:var(--accent);color:var(--ink)}
    .presets button.is-on{border-color:transparent;background:var(--accent);color:var(--accent-ink)}
    .editor{display:flex;flex-direction:column;flex:1;min-height:0}
    textarea{width:100%;flex:1;min-height:170px;resize:none;padding:11px;border:1px solid transparent;
      border-radius:11px;outline:0;background:var(--code-bg);color:var(--code-ink);caret-color:var(--pink);
      font:500 11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2}
    textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(110,86,207,.22)}
    .error{display:none;padding:9px 11px;border-radius:10px;background:var(--danger-bg);color:var(--danger);
      font-size:11.5px;line-height:1.45}
    .error.is-shown{display:block}
    .apply{display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;border:0;
      border-radius:11px;background:var(--ink);color:var(--surface);font-size:12.5px;font-weight:650}
    .apply:hover{opacity:.9}
    .apply:disabled{opacity:.55;cursor:progress}
    .apply i{display:none;width:13px;height:13px;border:2px solid currentColor;border-top-color:transparent;
      border-radius:50%;animation:spin .8s linear infinite}
    .apply.is-busy i{display:block}
    @keyframes spin{to{transform:rotate(360deg)}}

    /* ---- view settings popover ---- */
    .panel{position:absolute;z-index:6;top:52px;right:10px;display:none;width:214px;padding:12px;
      border:1px solid var(--line);border-radius:13px;background:var(--surface);box-shadow:var(--shadow)}
    .panel.is-open{display:grid;gap:11px}
    .panel h4{margin:0;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.08em;
      text-transform:uppercase}
    .seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:9px;
      background:var(--surface-sunk)}
    .seg button{padding:6px 4px;border:0;border-radius:7px;background:transparent;color:var(--muted);
      font-size:11.5px;font-weight:600}
    .seg button.is-on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
    .row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:26px;
      color:var(--body);font-size:12px;cursor:pointer}
    .row input{position:absolute;opacity:0;pointer-events:none}
    .row i{position:relative;width:30px;height:17px;flex:0 0 auto;border-radius:99px;background:#c7c7cf;
      transition:background .15s}
    .row i::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;
      background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s}
    .row input:checked + i{background:var(--accent)}
    .row input:checked + i::after{transform:translateX(13px)}

    /* ---- veil: loading + hard failures ---- */
    .veil{position:absolute;z-index:8;inset:0;display:none;flex-direction:column;align-items:center;
      justify-content:center;gap:12px;padding:24px;background:rgba(10,11,13,.72);text-align:center;
      backdrop-filter:blur(3px)}
    .veil.is-shown{display:flex}
    .veil i{width:22px;height:22px;border:2px solid rgba(255,255,255,.28);border-top-color:#fff;
      border-radius:50%;animation:spin .85s linear infinite}
    .veil p{margin:0;max-width:34ch;color:rgba(255,255,255,.82);font-size:12.5px;line-height:1.5}
    .veil.is-fatal i{display:none}
    .veil a{color:#fff;font-weight:600}

    @media (max-width:640px){
      .id span{display:none}
      .stl span{display:none}
      .stl{padding:0 11px}
      .sheet{width:100%}
    }
  </style>
</head>
<body>
  <div class="app" id="app">
    <div class="canvas" id="canvas"></div>

    <div class="bar">
      <div class="id">
        <span class="mark">P</span>
        <b id="title">Printable model</b>
        <span id="dims">—</span>
      </div>
      <div class="tools">
        <button id="toggleSpec" class="icon" type="button" aria-label="Edit model spec" title="Edit model spec">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6M15 6l6 6-6 6"/></svg>
        </button>
        <button id="view" class="icon" type="button" aria-label="View settings" title="View settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg>
        </button>
        <button id="focus" class="icon" type="button" aria-label="Fit model in view" title="Fit model in view">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>
        </button>
        <button id="expand" class="icon" type="button" aria-label="Toggle fullscreen" title="Toggle fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>
        </button>
        <a id="download" class="stl" href="#" download>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 20h14"/></svg>
          <span>STL</span>
        </a>
      </div>
    </div>

    <div class="stats" id="stats"></div>

    <div id="panel" class="panel">
      <h4>Shading</h4>
      <div class="seg" id="shading">
        <button type="button" data-mode="smooth" class="is-on">Smooth</button>
        <button type="button" data-mode="flat">Flat</button>
      </div>
      <h4>Scene</h4>
      <label class="row">Floor<input id="floor" type="checkbox" checked /><i></i></label>
      <label class="row">Grid<input id="gridToggle" type="checkbox" checked /><i></i></label>
      <label class="row">Size labels<input id="dimsToggle" type="checkbox" checked /><i></i></label>
      <label class="row">Sounds<input id="sound" type="checkbox" checked /><i></i></label>
    </div>

    <aside id="sheet" class="sheet" aria-label="Model spec editor">
      <div class="sheet-head">
        <div>
          <strong>Model spec</strong>
          <p>Edits re-run the tool, so chat and STL stay in sync.</p>
        </div>
        <button id="closeSpec" class="close" type="button" aria-label="Close spec editor">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="sheet-body">
        <div>
          <span class="label">Start from<small id="presetCount">9 presets</small></span>
          <div class="presets" id="presets"></div>
        </div>
        <label class="editor">
          <span class="label">JSON / YAML<small id="chars">0 chars</small></span>
          <textarea id="spec" spellcheck="false" aria-label="Procedural model JSON or YAML spec"></textarea>
        </label>
        <div id="error" class="error" role="alert"></div>
        <button id="apply" class="apply" type="button"><i></i><span>Apply spec</span></button>
      </div>
    </aside>

    <div id="veil" class="veil is-shown">
      <i></i>
      <p id="veilCopy">Evaluating model graph…</p>
    </div>
  </div>

  <script type="importmap">
    {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/"}}
  </script>
  <script type="module">
    const ORIGIN=${JSON.stringify(origin)};
    const TOOL="create_procedural_model";
    const el=id=>document.getElementById(id);
    const PRESETS=[
      ["type-specimen","Type specimen"],["contour-spiral-vase","Spiral vase"],["zenith-twist","Zenith twist"],
      ["fluted-bud-vase","Bud vase"],["ripple-column-vase","Ripple column"],["spline-petal-dish","Petal dish"],
      ["primitive-totem","Totem"],["voronoi-shell-lamp","Voronoi lamp"],["organic-coral","Coral"],
      ["cellular-lattice","Lattice"],["water-ripple-tile","Water tile"],["cloth-drape-study","Cloth drape"]
    ];

    const store={
      get(key){try{return localStorage.getItem(key)}catch{return null}},
      set(key,value){try{localStorage.setItem(key,value)}catch{}}
    };

    /* ---------- theme ---------------------------------------------------- */
    /* Hosts render widgets in light or dark chrome; follow whichever we are
       given so the sheet never appears as a white slab on a dark thread. */
    function applyTheme(theme){
      if(theme==="dark"||theme==="light")document.documentElement.dataset.theme=theme;
      else delete document.documentElement.dataset.theme;
    }
    applyTheme(window.openai&&window.openai.theme);

    /* ---------- host bridge ---------------------------------------------- */
    /* One JSON-RPC channel to the parent frame. window.openai (ChatGPT) is
       preferred when present; the raw postMessage path is the MCP Apps wire
       protocol and works with the SDK absent. */
    let seq=0;
    const pending=new Map();
    function post(message){try{window.parent.postMessage(message,"*")}catch{}}
    function request(method,params,timeout=60000){
      return new Promise((resolve,reject)=>{
        const id="printa-"+(++seq);
        pending.set(id,{resolve,reject});
        post({jsonrpc:"2.0",id,method,params});
        setTimeout(()=>{if(pending.delete(id))reject(new Error("The host did not respond in time."))},timeout);
      });
    }
    function errorText(error,fallback){
      if(error instanceof Error&&error.message)return error.message;
      if(error&&typeof error==="object"&&"message" in error)return String(error.message);
      return fallback||"Something went wrong building this model.";
    }

    /* ---------- frame sizing --------------------------------------------- */
    /* A host sizes the iframe from what the widget reports. Reporting nothing
       collapses the frame to zero height, which looks exactly like "the widget
       did not render" — so always report, on every mode change and resize. */
    const INLINE_HEIGHT=520;
    let displayMode=(window.openai&&window.openai.displayMode)||"inline";
    function reportHeight(){
      const height=displayMode==="fullscreen"?Math.ceil(window.innerHeight):INLINE_HEIGHT;
      try{if(window.openai&&window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight(height)}catch{}
      post({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:Math.ceil(window.innerWidth),height}});
      post({jsonrpc:"2.0",method:"ui/size-changed",params:{width:Math.ceil(window.innerWidth),height}});
    }
    function setDisplayMode(mode){
      displayMode=mode==="fullscreen"||mode==="pip"?mode:"inline";
      el("app").classList.toggle("is-fullscreen",displayMode==="fullscreen");
      requestAnimationFrame(()=>{scheduleResize();reportHeight()});
    }
    async function toggleFullscreen(){
      const target=displayMode==="fullscreen"?"inline":"fullscreen";
      try{
        let result;
        if(window.openai&&window.openai.requestDisplayMode)result=await window.openai.requestDisplayMode({mode:target});
        else result=await request("ui/request-display-mode",{mode:target},4000);
        setDisplayMode((result&&result.mode)||target);
      }catch{
        try{
          if(target==="fullscreen"&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
          else if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();
          setDisplayMode(target);
        }catch{}
      }
    }
    el("expand").addEventListener("click",toggleFullscreen);
    document.addEventListener("fullscreenchange",()=>setDisplayMode(document.fullscreenElement?"fullscreen":"inline"));
    window.addEventListener("resize",()=>{scheduleResize();reportHeight()});
    reportHeight();

    /* ---------- sounds (never allowed to break the widget) --------------- */
    let sound={play(){},setEnabled(){}};
    let soundOn=store.get("printa:sound")!=="off";
    el("sound").checked=soundOn;
    import("https://cdn.jsdelivr.net/npm/cuelume@0.1.2/+esm")
      .then(module=>{sound=module;module.setEnabled(soundOn);module.bind&&module.bind()})
      .catch(()=>{});
    const play=name=>{try{sound.play(name)}catch{}};
    el("sound").addEventListener("change",event=>{
      soundOn=event.target.checked;
      store.set("printa:sound",soundOn?"on":"off");
      try{sound.setEnabled(soundOn)}catch{}
      if(soundOn)play("toggle");
    });

    /* ---------- chrome wiring (works before three.js loads) -------------- */
    const sheet=el("sheet"),panel=el("panel");
    function setSheet(open){
      sheet.classList.toggle("is-open",open);
      el("app").classList.toggle("sheet-open",open);
      el("toggleSpec").classList.toggle("is-on",open);
      el("toggleSpec").setAttribute("aria-label",open?"Hide model spec":"Edit model spec");
      if(open)play("page");
    }
    el("toggleSpec").addEventListener("click",()=>setSheet(!sheet.classList.contains("is-open")));
    el("closeSpec").addEventListener("click",()=>setSheet(false));
    el("view").addEventListener("click",()=>{
      const open=!panel.classList.contains("is-open");
      panel.classList.toggle("is-open",open);
      el("view").classList.toggle("is-on",open);
      if(open)play("page");
    });
    document.addEventListener("pointerdown",event=>{
      if(!panel.classList.contains("is-open"))return;
      if(panel.contains(event.target)||el("view").contains(event.target))return;
      panel.classList.remove("is-open");
      el("view").classList.remove("is-on");
    });
    el("presetCount").textContent=PRESETS.length+" presets";
    el("presets").replaceChildren(...PRESETS.map(([id,label])=>{
      const button=document.createElement("button");
      button.type="button";
      button.dataset.demo=id;
      button.textContent=label;
      button.addEventListener("click",()=>{play("droplet");run({demo:id})});
      return button;
    }));
    function markPreset(id){
      for(const button of el("presets").children)button.classList.toggle("is-on",button.dataset.demo===id);
    }
    el("spec").addEventListener("input",event=>{
      el("chars").textContent=event.target.value.length.toLocaleString()+" chars";
    });
    el("apply").addEventListener("click",()=>{
      const spec=el("spec").value.trim();
      if(!spec)return;
      play("press");
      markPreset(null);
      run({spec});
    });

    function setBusy(busy,buttonLabel,veilCopy){
      el("apply").disabled=busy;
      el("apply").classList.toggle("is-busy",busy);
      el("apply").querySelector("span").textContent=buttonLabel||"Apply spec";
      if(veilCopy)el("veilCopy").textContent=veilCopy;
      el("veil").classList.toggle("is-shown",busy);
      el("veil").classList.remove("is-fatal");
    }
    function showError(message){
      clearTimeout(resultTimer);
      el("error").textContent=message;
      el("error").classList.add("is-shown");
      setBusy(false);
      setSheet(true);
      play("error");
    }
    /* A terminal message with an optional escape hatch link. Built as DOM
       rather than innerHTML so tool-supplied text can never inject markup. */
    function showFatal(message,link){
      const veil=el("veil"),copy=el("veilCopy");
      copy.replaceChildren(document.createTextNode(message));
      if(link){
        const anchor=document.createElement("a");
        anchor.href=link.href;
        anchor.target="_blank";
        anchor.rel="noopener";
        anchor.textContent=link.label;
        copy.append(" ",anchor);
      }
      veil.classList.add("is-shown","is-fatal");
    }

    /* ---------- renderer -------------------------------------------------
       three.js is loaded dynamically so a blocked CDN degrades to "no 3D
       preview" with a working download link, instead of killing the module and
       leaving an empty frame. */
    let three=null,renderFrame=()=>{},showMesh=async()=>{},frameModel=()=>{},setShading=()=>{},
        setSceneVisibility=()=>{},scheduleResize=()=>{};
    let rendererReady=false;

    async function bootRenderer(){
      const [THREE,controlsModule,loaderModule,utilsModule]=await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
        import("three/addons/loaders/STLLoader.js"),
        import("three/addons/utils/BufferGeometryUtils.js"),
      ]);
      const {OrbitControls}=controlsModule,{STLLoader}=loaderModule,{toCreasedNormals}=utilsModule;
      three=THREE;

      const scene=new THREE.Scene();
      scene.background=new THREE.Color("#0d0f11");
      scene.fog=new THREE.Fog("#0d0f11",440,900);
      const camera=new THREE.PerspectiveCamera(34,1,.1,3000);
      camera.up.set(0,0,1);
      camera.position.set(145,-185,125);
      const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.08;
      el("canvas").appendChild(renderer.domElement);

      const controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=true;
      controls.dampingFactor=.065;
      controls.target.set(0,0,45);

      scene.add(new THREE.HemisphereLight("#fff7e8","#182241",2.5));
      const key=new THREE.DirectionalLight("#fff0d5",5.4);
      key.position.set(-120,-150,240);
      key.castShadow=true;
      key.shadow.mapSize.set(2048,2048);
      scene.add(key,key.target);
      const rim=new THREE.DirectionalLight("#748cff",4.2);
      rim.position.set(150,100,150);
      scene.add(rim);
      const floor=new THREE.Mesh(
        new THREE.CircleGeometry(240,128),
        new THREE.MeshStandardMaterial({color:"#191916",roughness:.86,metalness:.08}));
      floor.position.z=-.3;
      floor.receiveShadow=true;
      scene.add(floor);
      const grid=new THREE.GridHelper(420,42,"#363631","#272724");
      grid.rotation.x=Math.PI/2;
      grid.position.z=.05;
      scene.add(grid);

      /* Ambient occlusion darkens crevices so flutes and lattices read. It is
         optional: a GPU that cannot compile the pass falls back to a plain
         forward render rather than showing nothing. */
      let composer=null,gtao=null;
      try{
        const [{EffectComposer},{RenderPass},{GTAOPass},{OutputPass}]=await Promise.all([
          import("three/addons/postprocessing/EffectComposer.js"),
          import("three/addons/postprocessing/RenderPass.js"),
          import("three/addons/postprocessing/GTAOPass.js"),
          import("three/addons/postprocessing/OutputPass.js"),
        ]);
        composer=new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene,camera));
        gtao=new GTAOPass(scene,camera,1,1);
        gtao.output=GTAOPass.OUTPUT.Default;
        gtao.blendIntensity=.85;
        gtao.updateGtaoMaterial({radius:8,distanceExponent:1,thickness:1,scale:1.1,samples:16,screenSpaceRadius:false});
        composer.addPass(gtao);
        composer.addPass(new OutputPass());
      }catch{composer=null;gtao=null}

      let mesh=null,baseGeometry=null,dimensions=null;
      let shadingMode=store.get("printa:shading")==="flat"?"flat":"smooth";

      function fitSceneToModel(box){
        const sphere=box.getBoundingSphere(new THREE.Sphere());
        const radius=Math.max(sphere.radius,24);
        key.position.copy(sphere.center).add(new THREE.Vector3(-.42,-.52,.84).normalize().multiplyScalar(radius*3));
        key.target.position.copy(sphere.center);
        key.target.updateMatrixWorld();
        const cam=key.shadow.camera,extent=radius*1.45;
        cam.left=-extent;cam.right=extent;cam.top=extent;cam.bottom=-extent;
        cam.near=radius*.4;cam.far=radius*7;
        cam.updateProjectionMatrix();
        key.shadow.normalBias=Math.max(.02,radius*.0015);
        if(gtao)gtao.updateGtaoMaterial({radius:THREE.MathUtils.clamp(radius*.22,2,40)});
        const groundScale=Math.max(1,(radius*1.8)/240);
        floor.scale.setScalar(groundScale);
        grid.scale.setScalar(groundScale);
        scene.fog.near=Math.max(440,radius*5);
        scene.fog.far=Math.max(900,radius*11);
      }
      function applyShading(){
        if(!mesh||!baseGeometry)return;
        const next=shadingMode==="smooth"?toCreasedNormals(baseGeometry,THREE.MathUtils.degToRad(50)):baseGeometry;
        if(mesh.geometry!==baseGeometry&&mesh.geometry!==next)mesh.geometry.dispose();
        mesh.geometry=next;
      }
      function disposeObject(object){
        if(!object)return;
        object.traverse(child=>{
          if(child.geometry)child.geometry.dispose();
          const list=child.material?(Array.isArray(child.material)?child.material:[child.material]):[];
          list.forEach(material=>{if(material.map)material.map.dispose();material.dispose()});
        });
      }
      function dimensionLabel(text,color,size){
        const canvas=document.createElement("canvas");
        canvas.width=512;canvas.height=128;
        const c=canvas.getContext("2d");
        c.fillStyle="rgba(10,26,25,.92)";c.beginPath();c.roundRect(3,3,506,122,24);c.fill();
        c.strokeStyle=color;c.lineWidth=5;c.stroke();
        c.fillStyle="#fffaf0";c.font="700 48px ui-monospace,monospace";
        c.textAlign="center";c.textBaseline="middle";c.fillText(text,256,65);
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;
        const label=new THREE.Mesh(new THREE.PlaneGeometry(size*4,size),
          new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));
        label.renderOrder=12;
        return label;
      }
      function groundDimensions(box,settings,units){
        const group=new THREE.Group(),
          w=box.max.x-box.min.x,h=box.max.y-box.min.y,largest=Math.max(w,h),
          scale=units==="cm"?10:units==="in"?25.4:1,
          margin=Math.max((settings.offset||9)*scale,largest*.045),
          arrow=THREE.MathUtils.clamp(largest*.025,2.5,9),
          size=THREE.MathUtils.clamp(largest*.035,4,10),
          z=.32,widthY=box.min.y-margin,heightX=box.min.x-margin,
          precision=settings.precision==null?1:settings.precision;
        const v=(x,y)=>new THREE.Vector3(x,y,z);
        function lines(points,color){
          const line=new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({color,depthTest:false}));
          line.renderOrder=10;
          group.add(line);
        }
        if(settings.width!==false){
          lines([v(box.min.x,widthY),v(box.max.x,widthY),
            v(box.min.x,widthY),v(box.min.x+arrow,widthY+arrow*.52),
            v(box.min.x,widthY),v(box.min.x+arrow,widthY-arrow*.52),
            v(box.max.x,widthY),v(box.max.x-arrow,widthY+arrow*.52),
            v(box.max.x,widthY),v(box.max.x-arrow,widthY-arrow*.52)],"#ff6b8f");
          const label=dimensionLabel("W  "+(w/scale).toFixed(precision)+" "+units,"#ff6b8f",size);
          label.position.set((box.min.x+box.max.x)/2,widthY-size*1.05,z+.03);
          group.add(label);
        }
        if(settings.height!==false){
          lines([v(heightX,box.min.y),v(heightX,box.max.y),
            v(heightX,box.min.y),v(heightX+arrow*.52,box.min.y+arrow),
            v(heightX,box.min.y),v(heightX-arrow*.52,box.min.y+arrow),
            v(heightX,box.max.y),v(heightX+arrow*.52,box.max.y-arrow),
            v(heightX,box.max.y),v(heightX-arrow*.52,box.max.y-arrow)],"#b8a4ed");
          const label=dimensionLabel("H  "+(h/scale).toFixed(precision)+" "+units,"#b8a4ed",size);
          label.rotation.z=Math.PI/2;
          label.position.set(heightX-size*1.05,(box.min.y+box.max.y)/2,z+.03);
          group.add(label);
        }
        return group;
      }

      /* view settings */
      for(const button of el("shading").children)button.classList.toggle("is-on",button.dataset.mode===shadingMode);
      el("shading").addEventListener("click",event=>{
        const button=event.target.closest("button");
        if(!button)return;
        shadingMode=button.dataset.mode;
        store.set("printa:shading",shadingMode);
        for(const child of el("shading").children)child.classList.toggle("is-on",child===button);
        play("toggle");
        applyShading();
      });
      el("floor").addEventListener("change",event=>{floor.visible=event.target.checked;play("toggle")});
      el("gridToggle").addEventListener("change",event=>{grid.visible=event.target.checked;play("toggle")});
      el("dimsToggle").addEventListener("change",event=>{
        if(dimensions)dimensions.visible=event.target.checked;
        play("toggle");
      });

      frameModel=()=>{
        if(!mesh)return;
        const box=new THREE.Box3().setFromObject(mesh);
        if(dimensions&&dimensions.visible)box.expandByObject(dimensions);
        const sphere=box.getBoundingSphere(new THREE.Sphere());
        const distance=Math.max(38,sphere.radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.12);
        camera.position.set(sphere.center.x+distance*.75,sphere.center.y-distance,sphere.center.z+distance*.62);
        camera.near=Math.max(.1,distance/150);
        camera.far=distance*20;
        camera.updateProjectionMatrix();
        controls.target.copy(sphere.center);
        controls.update();
      };

      showMesh=async(buffer,data,token,isCurrent)=>{
        const geometry=new STLLoader().parse(buffer);
        if(!isCurrent(token)){geometry.dispose();return}
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        if(mesh){scene.remove(mesh);if(mesh.geometry!==baseGeometry)mesh.geometry.dispose();mesh.material.dispose()}
        if(baseGeometry)baseGeometry.dispose();
        baseGeometry=geometry;
        if(dimensions){scene.remove(dimensions);disposeObject(dimensions);dimensions=null}
        const presets={"pla-orange":["#ff6b5a",.4,.03],"pla-matte":["#ebe6d6",.8,0],
          "pla-silk":["#b8a4ed",.22,.36],petg:["#a4d4c5",.2,0],resin:["#ffb084",.16,0]};
        const preset=presets[data.materialPreset]||presets["pla-orange"];
        mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({
          color:preset[0],roughness:preset[1],metalness:preset[2],
          clearcoat:data.materialPreset==="resin"?.7:.15}));
        mesh.castShadow=true;
        mesh.receiveShadow=true;
        scene.add(mesh);
        applyShading();
        fitSceneToModel(geometry.boundingBox.clone());
        const display=data.display||{floor:true,grid:true,dimensions:{visible:true,width:true,height:true,offset:9,precision:1}};
        floor.visible=display.floor!==false&&el("floor").checked;
        grid.visible=display.grid!==false&&el("gridToggle").checked;
        if(display.dimensions&&display.dimensions.visible!==false&&geometry.boundingBox){
          dimensions=groundDimensions(geometry.boundingBox,display.dimensions,data.units||"mm");
          dimensions.visible=el("dimsToggle").checked;
          scene.add(dimensions);
        }
        frameModel();
      };

      let viewportReady=false,resizeFrame=0;
      function resize(){
        const box=el("canvas").getBoundingClientRect();
        const width=Math.floor(box.width),height=Math.floor(box.height);
        if(width<2||height<2){viewportReady=false;return false}
        renderer.setSize(width,height,false);
        if(composer)composer.setSize(width,height);
        camera.aspect=width/height;
        camera.updateProjectionMatrix();
        viewportReady=true;
        return true;
      }
      scheduleResize=()=>{
        if(resizeFrame)return;
        resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize()});
      };
      new ResizeObserver(scheduleResize).observe(el("canvas"));
      scheduleResize();
      (function loop(){
        requestAnimationFrame(loop);
        if(!viewportReady||document.hidden)return;
        controls.update();
        if(composer)composer.render();else renderer.render(scene,camera);
      })();
      rendererReady=true;
    }

    const rendererBoot=bootRenderer().catch(error=>{
      rendererReady=false;
      console.error("[printa] 3D preview unavailable:",error);
    });
    el("focus").addEventListener("click",()=>{play("tick");frameModel()});

    /* ---------- model data ----------------------------------------------- */
    let token=0,resultTimer=0,lastUrl="";
    const isCurrent=value=>value===token;

    function acceptInput(args){
      if(args&&typeof args.spec==="string"){
        el("spec").value=args.spec;
        el("chars").textContent=args.spec.length.toLocaleString()+" chars";
      }
      if(args&&typeof args.demo==="string")markPreset(args.demo);
      setBusy(true,"Evaluating…","Evaluating model graph…");
      clearTimeout(resultTimer);
      resultTimer=setTimeout(()=>showError("The model result did not arrive. Apply the spec to retry."),60000);
    }

    async function show(data,replaceSpec){
      if(!data||!data.stlUrl){
        showError("The model tool completed without a preview URL. Apply the spec to retry.");
        return;
      }
      clearTimeout(resultTimer);
      const previewUrl=data.previewUrl||data.stlUrl;
      const current=++token;
      el("title").textContent=data.name||"Printable model";
      el("dims").textContent=Number(data.widthMm).toFixed(1)+" × "+Number(data.depthMm).toFixed(1)+" × "+Number(data.heightMm).toFixed(1)+" mm";
      el("download").href=data.stlUrl;
      if(data.filename)el("download").setAttribute("download",data.filename);
      if(replaceSpec!==false&&data.spec){
        el("spec").value=data.spec;
        el("chars").textContent=data.spec.length.toLocaleString()+" chars";
      }
      renderStats(data);
      el("error").classList.remove("is-shown");

      /* Metadata is live even when the mesh cannot be drawn, so a failed 3D
         boot still leaves a usable card rather than a blank frame. */
      await rendererBoot;
      if(!rendererReady){
        setBusy(false);
        showFatal("The 3D preview could not load in this browser, but the model is ready.",
          {href:data.stlUrl,label:"Download the STL →"});
        return;
      }
      if(previewUrl===lastUrl&&token>1){setBusy(false);return}
      lastUrl=previewUrl;
      setBusy(true,"Loading…","Downloading optimized preview…");
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        const response=await fetch(previewUrl,{signal:controller.signal});
        if(!response.ok)throw new Error("Model preview could not be loaded ("+response.status+").");
        const buffer=await response.arrayBuffer();
        if(!isCurrent(current))return;
        el("veilCopy").textContent="Parsing "+(buffer.byteLength/1048576).toFixed(1)+" MB preview…";
        await new Promise(resolve=>requestAnimationFrame(resolve));
        await showMesh(buffer,data,current,isCurrent);
        if(!isCurrent(current))return;
        play("ready");
      }catch(error){
        if(isCurrent(current)){
          lastUrl="";
          showError(error&&error.name==="AbortError"
            ? "The optimized preview timed out after 30 seconds. The STL download still works."
            : errorText(error,"Model preview could not be loaded."));
        }
      }finally{
        clearTimeout(timer);
        if(isCurrent(current))setBusy(false);
      }
    }

    function chip(label,value,variant){
      const node=document.createElement("span");
      node.className="chip"+(variant?" "+variant:"");
      const tag=document.createElement("small");
      tag.textContent=label;
      node.append(tag,document.createTextNode(value));
      return node;
    }
    function renderStats(data){
      const chips=[
        chip("Mesh",Number(data.triangles||0).toLocaleString()+" tris"),
        chip("Volume",(Number(data.volumeEstimateMm3||0)/1000).toFixed(1)+" cm³"),
        chip("Material",String(data.materialPreset||"pla-orange").replaceAll("-"," ")),
      ];
      const exceeds=!!data.exceedsBuildVolume;
      chips.push(chip(exceeds?"Warning":"Status",exceeds?"Too big for printer":"Ready to print",exceeds?"warn":"ok"));
      for(const warning of data.warnings||[])chips.push(chip("Note",warning,"warn"));
      if(data.studioUrl){
        const link=document.createElement("a");
        link.className="chip link";
        link.href=data.studioUrl;
        link.target="_blank";
        link.rel="noopener";
        link.textContent="Open full editor ↗";
        chips.push(link);
      }
      el("stats").replaceChildren(...chips);
    }

    async function acceptResult(result){
      if(!result)return;
      if(result.isError){
        showError((result.content||[]).map(item=>item.text||"").filter(Boolean).join(" ")||"The model tool returned an error.");
        return;
      }
      const data=result.structuredContent||(result.stlUrl?result:null);
      if(data)await show(data,true);
      else showError("The model tool returned no structured model data.");
    }

    async function callTool(args){
      if(window.openai&&typeof window.openai.callTool==="function")return window.openai.callTool(TOOL,args);
      if(extApp)return extApp.callServerTool({name:TOOL,arguments:args});
      return request("tools/call",{name:TOOL,arguments:args});
    }
    async function run(args){
      acceptInput(args);
      el("error").classList.remove("is-shown");
      try{await acceptResult(await callTool(args))}
      catch(error){showError(errorText(error))}
    }

    /* ---------- host data discovery --------------------------------------
       Every path below feeds show(). Whichever arrives first wins; the rest
       become no-ops because the preview URL is already loaded. */
    let received=false;
    function deliver(data,replaceSpec){
      if(!data)return false;
      received=true;
      void show(data,replaceSpec);
      return true;
    }
    function hostGlobals(){
      const api=window.openai;
      if(!api)return null;
      if(api.toolOutput)return api.toolOutput;
      if(api.toolResponse&&api.toolResponse.structuredContent)return api.toolResponse.structuredContent;
      return null;
    }

    /* (a) ChatGPT globals — present now, or announced later. */
    if(!deliver(hostGlobals(),true)&&window.openai&&window.openai.toolInput)acceptInput(window.openai.toolInput);
    window.addEventListener("openai:set_globals",event=>{
      const globals=(event.detail&&event.detail.globals)||{};
      if(globals.theme)applyTheme(globals.theme);
      if(globals.displayMode)setDisplayMode(globals.displayMode);
      if(globals.toolInput&&!received)acceptInput(globals.toolInput);
      if(globals.toolOutput)deliver(globals.toolOutput,true);
    });
    /* Some builds mutate window.openai without firing an event; poll briefly. */
    let polls=0;
    const pollTimer=setInterval(()=>{
      if(received||++polls>40)return clearInterval(pollTimer);
      if(deliver(hostGlobals(),true))clearInterval(pollTimer);
    },250);

    /* (b) raw MCP Apps wire protocol. */
    window.addEventListener("message",event=>{
      const message=event.data;
      if(!message||message.jsonrpc!=="2.0")return;
      if(message.id!==undefined&&pending.has(message.id)){
        const entry=pending.get(message.id);
        pending.delete(message.id);
        if(message.error)entry.reject(message.error);else entry.resolve(message.result);
        return;
      }
      const method=message.method||"";
      const params=message.params||{};
      if(method.endsWith("notifications/tool-result")){
        const data=params.structuredContent||(params.result&&params.result.structuredContent);
        if(data)deliver(data,true);
      }else if(method.endsWith("notifications/tool-input")){
        if(params.arguments)acceptInput(params.arguments);
      }else if(method.endsWith("notifications/tool-cancelled")){
        showError(params.reason||"Model generation was cancelled.");
      }else if(method.endsWith("host-context-changed")||method.endsWith("notifications/host-context-changed")){
        if(params.displayMode)setDisplayMode(params.displayMode);
        if(params.theme)applyTheme(params.theme);
      }
    });

    /* (c) the MCP Apps SDK handshake, best effort. */
    let extApp=null;
    import("https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@1.7.4/+esm").then(({App})=>{
      const app=new App({name:"printa-procedural-model",version:"0.7.0"},{},{autoResize:false});
      app.ontoolinput=params=>{if(!received)acceptInput((params&&params.arguments)||{})};
      app.ontoolresult=result=>void acceptResult(result);
      app.ontoolcancelled=params=>showError((params&&params.reason)||"Model generation was cancelled.");
      return app.connect().then(()=>{extApp=app});
    }).catch(()=>{
      /* No SDK: announce ourselves on the raw channel so hosts that wait for an
         initialize handshake still push us the tool result. */
      post({jsonrpc:"2.0",id:"printa-init",method:"initialize",params:{
        protocolVersion:"2025-06-18",
        capabilities:{},
        clientInfo:{name:"printa-procedural-model",version:"0.7.0"},
      }});
      post({jsonrpc:"2.0",method:"notifications/initialized",params:{}});
    });

    /* (d) self-bootstrap: if no host ever speaks to us, build the default model
       from our own API so the widget is never an empty box. */
    setTimeout(()=>{
      if(received||token>0)return;
      setBusy(true,"Evaluating…","Building the starting model…");
      fetch(ORIGIN+"/api/model/inspect",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({demo:"type-specimen",format:"yaml"}),
      }).then(response=>{
        if(!response.ok)throw new Error("Could not reach the Printa model service.");
        return response.json();
      }).then(data=>{
        if(received||token>0)return;
        markPreset("type-specimen");
        void show({
          name:data.document&&data.document.name,
          spec:data.spec,
          units:data.document&&data.document.units,
          widthMm:data.stats.widthMm,depthMm:data.stats.depthMm,heightMm:data.stats.heightMm,
          triangles:data.stats.triangles,volumeEstimateMm3:data.stats.volumeEstimateMm3,
          materialPreset:data.materialPreset,
          stlUrl:data.stlUrl,
          previewUrl:ORIGIN+"/api/model/stl?spec="+data.encoded+"&preview=true",
          studioUrl:data.studioUrl,
          exceedsBuildVolume:data.exceedsBuildVolume,
          warnings:data.warnings,
          display:data.document&&data.document.display,
        },true);
      }).catch(error=>showError(errorText(error,"Waiting for the model tool to return a result.")));
    },6000);
  </script>
</body>
</html>`;
}
