export function createWidgetHtml(origin: string) {
  const safeOrigin = JSON.stringify(origin);
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{color-scheme:light;--bg:#ffffff;--card:#fafafa;--field:#ffffff;--ink:#1c1c1f;--muted:#74747c;--line:#e6e6e9;--line-soft:#efeff1;--accent:#ff5d2e;--stage:#131315;--radius:10px}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:transparent;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px}
    button,input,select{font:inherit;color:inherit}
    .app{position:relative;display:flex;height:min(580px,100dvh);overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--bg)}
    .app.is-fullscreen{height:100dvh;border:0;border-radius:0}
    aside{position:relative;z-index:5;display:flex;flex-direction:column;width:var(--side,290px);min-width:210px;max-width:420px;flex:0 0 auto;border-right:1px solid var(--line);background:var(--bg)}
    .app.side-collapsed aside{display:none}
    .side-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid var(--line)}
    .logo{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--ink);color:#fff}
    .brand{flex:1;font-size:12px;font-weight:700;letter-spacing:.1em}
    .side-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
    .sec{padding:13px 14px;border-bottom:1px solid var(--line-soft)}
    .sec-title{font-size:12px;font-weight:600;color:rgba(28,28,31,.8);margin-bottom:10px}
    .field{display:grid;gap:6px;margin-bottom:11px}.field:last-child{margin-bottom:0}
    .lbl{display:flex;justify-content:space-between;font-size:11px;font-weight:500;color:var(--muted)}.lbl small{color:#a0a0a6}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    input.txt,select.sel{width:100%;min-width:0;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--field);font-size:12.5px;font-weight:500;outline:none;transition:border-color .12s,box-shadow .12s}
    select.sel{height:34px;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2374747c' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;padding-right:30px;cursor:pointer}
    input.txt:focus,select.sel:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,93,46,.16)}
    input.num{font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace;font-size:11.5px}
    .num-wrap{position:relative}.num-wrap .u{position:absolute;right:9px;top:50%;transform:translateY(-50%);font:600 9px ui-monospace,monospace;color:var(--muted);pointer-events:none}
    .toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0;cursor:pointer}.toggle .tl{font-size:12px;font-weight:500}.toggle .tl small{display:block;font-size:10px;font-weight:400;color:var(--muted)}
    .sw{position:relative;width:34px;height:20px;flex:0 0 auto;border-radius:99px;background:var(--line);transition:.15s}.sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:.15s}
    .toggle input{position:absolute;opacity:0;pointer-events:none}.toggle input:checked+.sw{background:var(--accent)}.toggle input:checked+.sw::after{transform:translateX(14px)}
    .slider{display:grid;grid-template-columns:1fr 78px;align-items:center;gap:10px}
    .slider input[type=range]{width:100%;height:4px;-webkit-appearance:none;appearance:none;border-radius:99px;background:linear-gradient(90deg,var(--accent) var(--p,50%),var(--line) var(--p,50%));outline:none;cursor:pointer}
    .slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.2)}
    .slider input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--accent)}
    /* font picker */
    .fp{position:relative}.fp-trigger{display:flex;align-items:center;gap:8px;width:100%;height:44px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--field);cursor:pointer;text-align:left}.fp-trigger:hover{border-color:#c9c9cf}
    .fp-trigger .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:500}.fp-trigger .fc{font:600 8px ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}.fp-trigger .cv{color:var(--muted);transition:transform .15s}.fp-trigger.open .cv{transform:rotate(180deg)}
    .fp-menu{position:absolute;z-index:20;top:calc(100% + 5px);left:0;right:0;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--bg);box-shadow:0 18px 45px rgba(0,0,0,.2)}.fp-menu[hidden]{display:none}
    .fp-search{display:flex;align-items:center;gap:8px;height:42px;padding:0 11px;border-bottom:1px solid var(--line-soft);color:var(--muted)}.fp-search input{flex:1;height:38px;border:0;outline:none;background:transparent;font-size:12.5px;font-weight:500}.fp-search .ct{font:500 10px ui-monospace,monospace}
    .fp-list{max-height:270px;overflow-y:auto;padding:4px}.fp-opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:8px;background:transparent;text-align:left;cursor:pointer}.fp-opt:hover,.fp-opt.active{background:var(--card)}.fp-opt .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:500}.fp-opt .fc{font:600 8px ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}.fp-opt .ck{color:var(--accent)}
    .fp-empty{padding:22px;text-align:center;font-size:11px;color:var(--muted)}
    /* buttons */
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s;white-space:nowrap}.btn:hover{background:var(--card)}.btn svg{width:15px;height:15px}
    .btn.solid{border-color:var(--ink);background:var(--ink);color:#fff}.btn.solid:hover{background:#333}.btn:disabled{opacity:.5;cursor:wait}
    .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    /* stage */
    main{position:relative;flex:1;min-width:0;min-height:0;background:var(--stage);overflow:hidden}
    .topbar{position:absolute;z-index:4;top:0;left:0;right:0;display:flex;align-items:center;gap:8px;padding:10px 12px;pointer-events:none}.topbar>*{pointer-events:auto}.grow{flex:1}
    .pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:99px;background:rgba(20,20,22,.55);color:rgba(255,255,255,.72);font:600 11px ui-monospace,monospace;backdrop-filter:blur(10px)}
    .pill.warn{color:#fbbf24}
    .gbtn{display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(20,20,22,.5);color:rgba(255,255,255,.8);cursor:pointer;backdrop-filter:blur(10px)}.gbtn:hover{background:rgba(40,40,44,.7);color:#fff}.gbtn svg{width:16px;height:16px}.gbtn.on{border-color:var(--accent);background:rgba(255,93,46,.22);color:#ff8a63}
    .canvas{position:absolute;inset:0}.canvas canvas{display:block;width:100%;height:100%}
    .hint{position:absolute;z-index:2;top:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:99px;background:rgba(20,20,22,.5);color:rgba(255,255,255,.55);font:600 10px ui-monospace,monospace;backdrop-filter:blur(10px);pointer-events:none}
    .stats{position:absolute;z-index:2;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;max-width:calc(100% - 90px);overflow-x:auto;height:32px;padding:0 15px;border-radius:99px;background:rgba(20,20,22,.55);color:rgba(255,255,255,.72);font:600 10px ui-monospace,monospace;white-space:nowrap;backdrop-filter:blur(10px)}.stats b{color:rgba(255,255,255,.45)}.stats .ok{color:#4ade80}.stats .bad{color:#fbbf24}
    .foc{position:absolute;z-index:3;left:12px;bottom:12px}
    .loading{position:absolute;z-index:6;inset:0;display:grid;place-items:center;background:rgba(19,19,21,.66);color:rgba(255,255,255,.75);font:600 12px ui-monospace,monospace;backdrop-filter:blur(3px)}.loading[hidden]{display:none}
    .spin{width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:sp .8s linear infinite;display:inline-block;vertical-align:-2px;margin-right:7px}@keyframes sp{to{transform:rotate(360deg)}}
    .pop{position:absolute;z-index:20;top:50px;right:12px;width:250px;border:1px solid var(--line);border-radius:14px;background:var(--bg);box-shadow:0 18px 45px rgba(0,0,0,.22);overflow:hidden}.pop[hidden]{display:none}
    .pop-h{padding:11px 14px 9px;border-bottom:1px solid var(--line-soft)}.pop-h b{font-size:13px}.pop-h p{margin:2px 0 0;font-size:10.5px;color:var(--muted)}
    .pop-b{padding:12px 14px;display:grid;gap:11px}
    .seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:9px;background:var(--card)}.seg button{height:28px;border:0;border-radius:6px;background:transparent;font-size:11.5px;font-weight:600;color:var(--muted);cursor:pointer;text-transform:capitalize}.seg button.on{background:var(--bg);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
    .resizer{position:absolute;z-index:6;top:0;bottom:0;left:calc(var(--side,290px) - 3px);width:6px;cursor:col-resize}.app.side-collapsed .resizer{display:none}
    @media(max-width:640px){.app{--side:250px}aside{position:absolute;inset:0 auto 0 0;box-shadow:12px 0 40px rgba(0,0,0,.12)}.resizer{display:none}}
  </style>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/","opentype.js":"https://cdn.jsdelivr.net/npm/opentype.js@2.0.0/dist/opentype.mjs"}}</script>
</head>
<body>
  <div class="app side-collapsed" id="app">
    <aside>
      <div class="side-head"><span class="logo"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg></span><span class="brand">PRINTA · TEXT</span></div>
      <div class="side-scroll">
        <div class="sec">
          <div class="field"><span class="lbl">Text <small id="text-count">5 / 24</small></span><input id="text" class="txt" maxlength="24" value="HELLO" /></div>
          <div class="field fp" id="fp"><span class="lbl">Font <small id="font-count">Loading…</small></span>
            <button id="fp-trigger" class="fp-trigger" type="button"><span class="fn" id="fp-name">Roboto</span><span class="fc" id="fp-cat">Sans</span><span class="cv"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span></button>
            <div id="fp-menu" class="fp-menu" hidden><div class="fp-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="font" placeholder="Search Google Fonts…" autocomplete="off" /><span class="ct" id="fp-summary">0</span></div><div id="fp-list" class="fp-list"></div></div>
          </div>
          <div class="row2"><div class="field"><span class="lbl">Case</span><select id="text-case" class="sel"><option value="original">As typed</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="titlecase">Title Case</option></select></div><div class="field"><span class="lbl">Weight</span><select id="font-weight" class="sel"><option value="regular">Regular</option><option value="bold">Bold</option></select></div></div>
          <div class="row2"><label class="toggle"><span class="tl">Italic</span><input id="italic" type="checkbox"><span class="sw"></span></label><label class="toggle"><span class="tl">Underline</span><input id="underline" type="checkbox"><span class="sw"></span></label></div>
        </div>
        <div class="sec">
          <div class="sec-title">Size</div>
          <div class="field"><span class="lbl">Letter height <small id="size-out">36 mm</small></span><div class="slider"><input id="size" type="range" min=".1" max="256" step="1" value="36" /><div class="num-wrap"><input id="size-number" class="txt num" type="number" /><span class="u" id="size-unit">mm</span></div></div></div>
          <div class="field"><span class="lbl">Extrusion depth <small id="depth-out">4 mm</small></span><div class="slider"><input id="depth" type="range" min=".1" max="256" step=".5" value="4" /><div class="num-wrap"><input id="depth-number" class="txt num" type="number" /><span class="u" id="depth-unit">mm</span></div></div></div>
          <div class="field"><span class="lbl">Edge bevel <small id="bevel-out">0.6 mm</small></span><div class="slider"><input id="bevel" type="range" min="0" max="64" step=".1" value=".6" /><div class="num-wrap"><input id="bevel-number" class="txt num" type="number" /><span class="u" id="bevel-unit">mm</span></div></div></div>
        </div>
        <div class="sec">
          <div class="sec-title">Material</div>
          <div class="field"><select id="material-preset" class="sel"><option value="pla-orange">PLA · Printa orange</option><option value="pla-matte">Matte PLA · Bone</option><option value="pla-silk">Silk PLA · Violet</option><option value="petg">PETG · Ice blue</option><option value="resin">Resin · Amber</option></select></div>
          <details style="margin-top:2px"><summary style="list-style:none;font-size:11px;font-weight:500;color:var(--muted);cursor:pointer">Advanced surface</summary>
            <div style="margin-top:10px;display:grid;gap:11px">
              <div class="field"><span class="lbl">Bevel edges</span><select id="bevel-side" class="sel"><option value="both">Top + bottom</option><option value="top">Top only</option><option value="bottom">Bottom only</option></select></div>
              <div class="row2"><div class="field"><span class="lbl">Bevel smooth <small id="bevel-segments-out">3</small></span><div class="slider" style="grid-template-columns:1fr"><input id="bevel-segments" type="range" min="1" max="12" step="1" value="3" /></div></div><div class="field"><span class="lbl">Curve detail <small id="curve-segments-out">10</small></span><div class="slider" style="grid-template-columns:1fr"><input id="curve-segments" type="range" min="2" max="24" step="1" value="10" /></div></div></div>
            </div>
          </details>
        </div>
      </div>
      <div style="padding:12px 14px;border-top:1px solid var(--line)"><div class="actions"><button id="generate" class="btn">Update model</button><button id="download" class="btn solid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>Download STL</button></div></div>
    </aside>
    <div class="resizer" id="resizer"></div>
    <main>
      <div class="canvas" id="canvas"></div>
      <div class="hint">Drag to orbit · scroll to zoom</div>
      <div class="topbar">
        <button class="gbtn" id="menu" aria-label="Show panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <span class="grow"></span>
        <span class="pill" id="units-pill" style="cursor:pointer">mm</span>
        <button class="gbtn" id="view" aria-label="View settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="gbtn" id="full" aria-label="Fullscreen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H4a1 1 0 0 0-1 1v4m18 0V4a1 1 0 0 0-1-1h-4M3 16v4a1 1 0 0 0 1 1h4m12-5v4a1 1 0 0 1-1 1h-4"/></svg></button>
      </div>
      <button class="gbtn foc" id="focus" aria-label="Frame model"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="2.5"/></svg></button>
      <div class="loading" id="loading"><span><span class="spin"></span>Building geometry…</span></div>
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
    </main>
  </div>
  <script type="module">
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
    import { parse as parseOpenType } from "opentype.js";
    const ORIGIN=${safeOrigin},el=id=>document.getElementById(id),app=el("app");

    let actx=null,sfxOn=localStorage.getItem("printa.sfx-enabled")!=="false",lastTick=0;
    function acx(){if(!actx){const C=window.AudioContext||window.webkitAudioContext;if(C)actx=new C()}if(actx&&actx.state==="suspended")actx.resume();return actx}
    function tone(f,f2,d,g,t){if(!sfxOn)return;const c=acx();if(!c)return;const o=c.createOscillator(),ga=c.createGain(),lp=c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=Math.max(1200,f*2.4);o.type=t||"sine";o.frequency.setValueAtTime(f,c.currentTime);if(f2)o.frequency.exponentialRampToValueAtTime(f2,c.currentTime+d);ga.gain.setValueAtTime(0,c.currentTime);ga.gain.linearRampToValueAtTime(g,c.currentTime+.004);ga.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d);o.connect(lp).connect(ga).connect(c.destination);o.start();o.stop(c.currentTime+d+.02)}
    const sfx={tap:()=>tone(620,480,.05,.05,"triangle"),tick:()=>{const n=performance.now();if(n-lastTick<55)return;lastTick=n;tone(1150,950,.025,.022)},toggle:on=>tone(on?520:430,on?700:330,.07,.045,"triangle"),open:()=>tone(340,560,.09,.035),close:()=>tone(540,320,.08,.03),ok:()=>{tone(660,0,.06,.03);setTimeout(()=>tone(880,0,.09,.03),55)},err:()=>tone(220,150,.14,.04,"triangle")};

    const fields={text:el("text"),font:el("font"),textCase:el("text-case"),fontWeight:el("font-weight"),italic:el("italic"),underline:el("underline"),size:el("size"),depth:el("depth"),bevel:el("bevel"),sizeNumber:el("size-number"),depthNumber:el("depth-number"),bevelNumber:el("bevel-number"),bevelSide:el("bevel-side"),bevelSegments:el("bevel-segments"),curveSegments:el("curve-segments"),materialPreset:el("material-preset")};
    let units="mm",smoothNormals=true,shading="smooth";
    const DIM={size:{min:.1,max:256,step:1},depth:{min:.1,max:256,step:.5},bevel:{min:0,max:64,step:.1}};

    const scene=new THREE.Scene();scene.background=new THREE.Color("#131315");const camera=new THREE.PerspectiveCamera(34,1,.1,2000);camera.up.set(0,0,1);
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;el("canvas").appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=10;controls.maxDistance=1200;
    const grid=new THREE.GridHelper(120,24,"#333","#242424");grid.rotateX(Math.PI/2);grid.position.z=-.02;scene.add(grid);
    const bed=new THREE.Mesh(new THREE.CircleGeometry(80,96),new THREE.MeshStandardMaterial({color:"#1c1c1a",roughness:.92}));bed.position.z=-.03;bed.receiveShadow=true;scene.add(bed);
    scene.add(new THREE.HemisphereLight("#fff2d9","#263252",2.4));const key=new THREE.DirectionalLight("#fff2d9",5);key.position.set(-70,-90,130);key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);scene.add(key.target);const rim=new THREE.DirectionalLight("#657cff",3);rim.position.set(80,70,80);scene.add(rim);
    let mesh=null,dimGroup=null,current=null,framed=false,token=0,previewTimer=0;const fontCache={},previewCache={};let catalog=[];let selectedFont={id:"roboto",family:"Roboto",category:"Sans Serif"};let fpOpen=false,activeIdx=0,visible=[],vCount=40;
    const MAT={"pla-orange":["#ff5d2e",.42,.02,.22],"pla-matte":["#e6dfcf",.78,0,.04],"pla-silk":["#7458d8",.2,.42,.55],petg:["#78c7dd",.16,0,.62],resin:["#d98b32",.12,0,.7]};
    function makeMat(id){const p=MAT[id]||MAT["pla-orange"];return new THREE.MeshPhysicalMaterial({color:p[0],roughness:p[1],metalness:p[2],clearcoat:p[3],flatShading:shading==="flat"})}
    const slug=v=>String(v||"roboto").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"roboto";
    async function getFont(k,text,w,it){const ck=k+":"+w+":"+it+":"+text;if(!fontCache[ck])fontCache[ck]=fetch(ORIGIN+"/api/font?id="+encodeURIComponent(k)+"&text="+encodeURIComponent(text)+"&weight="+w+"&italic="+it).then(async r=>{if(!r.ok)throw new Error("Font unavailable");return{font:parseOpenType(await r.arrayBuffer()),syntheticItalic:r.headers.get("X-Printa-Synthetic-Italic")==="true"}});return fontCache[ck]}
    function applyCase(t,m){if(m==="uppercase")return t.toLocaleUpperCase();if(m==="lowercase")return t.toLocaleLowerCase();if(m==="titlecase")return t.toLocaleLowerCase().replace(/(^|\s)\S/g,v=>v.toLocaleUpperCase());return t}
    function shapesFor(font,text,size,underline,syn){const path=font.getPath(text,0,0,size,{kerning:true}),out=new THREE.ShapePath(),slant=syn?Math.tan(Math.PI/15):0,pt=(x,y)=>({x:(x||0)+(-(y||0)*slant),y:-(y||0)});for(const c of path.commands){const e=pt(c.x,c.y);if(c.type==="M")out.moveTo(e.x,e.y);else if(c.type==="L")out.lineTo(e.x,e.y);else if(c.type==="C"){const a=pt(c.x1,c.y1),b=pt(c.x2,c.y2);out.bezierCurveTo(a.x,a.y,b.x,b.y,e.x,e.y)}else if(c.type==="Q"){const a=pt(c.x1,c.y1);out.quadraticCurveTo(a.x,a.y,e.x,e.y)}else if(c.type==="Z"&&out.currentPath)out.currentPath.closePath()}const shapes=out.toShapes();if(underline){const b=path.getBoundingBox(),s=b.x1,en=b.x2+(syn?size*.2:0),top=-size*.07,bot=-size*.13,l=new THREE.Shape();l.moveTo(s,bot);l.lineTo(en,bot);l.lineTo(en,top);l.lineTo(s,top);l.closePath();shapes.push(l)}return shapes}
    function modelFromFields(){return{text:(fields.text.value.trim()||"HELLO").slice(0,24),font:selectedFont.family,fontId:selectedFont.id,textCase:fields.textCase.value,fontWeight:fields.fontWeight.value,italic:fields.italic.checked,underline:fields.underline.checked,sizeMm:Number(fields.size.value),depthMm:Number(fields.depth.value),bevelMm:Number(fields.bevel.value),bevelSegments:Number(fields.bevelSegments.value),curveSegments:Number(fields.curveSegments.value),bevelSide:fields.bevelSide.value,smoothNormals,materialPreset:fields.materialPreset.value}}
    function normalize(d){d=d||{};const fam=d.font||selectedFont.family||"Roboto";return{text:(d.text||"HELLO").slice(0,24),font:fam,fontId:d.fontId||slug(fam),textCase:d.textCase??d.text_case??"original",fontWeight:d.fontWeight??d.font_weight??"regular",italic:d.italic??false,underline:d.underline??false,sizeMm:Number(d.sizeMm??d.size_mm??36),depthMm:Number(d.depthMm??d.depth_mm??4),bevelMm:Number(d.bevelMm??d.bevel_mm??.6),bevelSegments:Number(d.bevelSegments??d.bevel_segments??3),curveSegments:Number(d.curveSegments??d.curve_segments??10),bevelSide:d.bevelSide??d.bevel_side??"both",smoothNormals:d.smoothNormals??d.smooth_normals??true,materialPreset:d.materialPreset??d.material_preset??"pla-orange"}}
    function createGeo(font,d,syn){const bevel=Math.min(d.bevelMm,d.depthMm*.3,d.sizeMm*.08);let g=new THREE.ExtrudeGeometry(shapesFor(font,d.renderedText,d.sizeMm,d.underline,syn),{depth:d.depthMm,curveSegments:d.curveSegments,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel*.72,bevelSegments:bevel>0?d.bevelSegments:1});if(bevel>0&&d.bevelSide!=="both"){const p=g.getAttribute("position");for(let i=0;i<p.count;i++){const z=p.getZ(i);if(d.bevelSide==="top"&&z<0)p.setZ(i,0);if(d.bevelSide==="bottom"&&z>d.depthMm)p.setZ(i,d.depthMm)}p.needsUpdate=true}g.deleteAttribute("normal");if(d.smoothNormals)g=mergeVertices(g,1e-4);g.computeVertexNormals();g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z);g.computeBoundingBox();return g}
    function fitEnv(m){const b=new THREE.Box3().setFromObject(m),s=b.getBoundingSphere(new THREE.Sphere()),r=Math.max(20,s.radius);key.position.set(s.center.x-r*1.1,s.center.y-r*1.4,s.center.z+r*2.1);key.target.position.copy(s.center);key.target.updateMatrixWorld();const sc=key.shadow.camera,e=r*1.8;sc.left=-e;sc.right=e;sc.top=e;sc.bottom=-e;sc.near=r*.2;sc.far=r*8;sc.updateProjectionMatrix();key.shadow.bias=-.0002;key.shadow.normalBias=r*.004;const es=Math.max(1,r/70);bed.scale.setScalar(es);grid.scale.setScalar(es)}
    function frameModel(){if(!mesh)return;const b=new THREE.Box3().setFromObject(mesh);if(dimGroup)b.expandByObject(dimGroup);const s=b.getBoundingSphere(new THREE.Sphere()),d=Math.max(24,s.radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.1);camera.position.set(s.center.x+d*.72,s.center.y-d,s.center.z+d*.66);camera.near=Math.max(.1,d/120);camera.far=d*20;camera.updateProjectionMatrix();controls.target.copy(s.center);controls.update()}
    function dimLabel(t,col,sz){const cv=document.createElement("canvas");cv.width=512;cv.height=128;const c=cv.getContext("2d");c.fillStyle="rgba(17,17,16,.9)";c.beginPath();c.roundRect(3,3,506,122,24);c.fill();c.strokeStyle=col;c.lineWidth=5;c.stroke();c.fillStyle="#f7f3e9";c.font="700 48px ui-monospace,monospace";c.textAlign="center";c.textBaseline="middle";c.fillText(t,256,65);const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;const l=new THREE.Mesh(new THREE.PlaneGeometry(sz*4,sz),new THREE.MeshBasicMaterial({map:tx,transparent:true,depthTest:false,toneMapped:false}));l.renderOrder=12;return l}
    function ground(b){const g=new THREE.Group(),w=b.max.x-b.min.x,h=b.max.y-b.min.y,lg=Math.max(w,h),mg=THREE.MathUtils.clamp(lg*.09,7,34),ar=THREE.MathUtils.clamp(lg*.025,2.5,9),sz=THREE.MathUtils.clamp(lg*.035,4,10),z=.32,wy=b.min.y-mg,hx=b.min.x-mg;function seg(v,col,op){const ge=new THREE.BufferGeometry().setFromPoints(v),li=new THREE.LineSegments(ge,new THREE.LineBasicMaterial({color:col,transparent:op<1,opacity:op,depthTest:false}));li.renderOrder=10;g.add(li)}const v=(x,y)=>new THREE.Vector3(x,y,z);seg([v(b.min.x,wy),v(b.max.x,wy),v(b.min.x,wy),v(b.min.x+ar,wy+ar*.52),v(b.min.x,wy),v(b.min.x+ar,wy-ar*.52),v(b.max.x,wy),v(b.max.x-ar,wy+ar*.52),v(b.max.x,wy),v(b.max.x-ar,wy-ar*.52)],"#ff8258",1);seg([v(hx,b.min.y),v(hx,b.max.y),v(hx,b.min.y),v(hx+ar*.52,b.min.y+ar),v(hx,b.min.y),v(hx-ar*.52,b.min.y+ar),v(hx,b.max.y),v(hx+ar*.52,b.max.y-ar),v(hx,b.max.y),v(hx-ar*.52,b.max.y-ar)],"#8294ff",1);const wl=dimLabel("W  "+w.toFixed(1)+" mm","#ff8258",sz);wl.position.set((b.min.x+b.max.x)/2,wy-sz*1.05,z+.03);g.add(wl);const hl=dimLabel("H  "+h.toFixed(1)+" mm","#8294ff",sz);hl.rotation.z=Math.PI/2;hl.position.set(hx-sz*1.05,(b.min.y+b.max.y)/2,z+.03);g.add(hl);return g}
    function disp(g){if(!g)return;g.traverse(c=>{if(c.geometry)c.geometry.dispose();const l=c.material?(Array.isArray(c.material)?c.material:[c.material]):[];l.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})})}
    let showDims=true;
    function warn(w,h,d){const ex=w>256||h>256||d>256;el("stats-fit").className=ex?"bad":"ok";el("stats-fit").textContent=ex?"⚠ Too big for printer":"✓ Fits printer"}
    async function render(input,sync){const tk=++token;const d=normalize(input);d.renderedText=applyCase(d.text,d.textCase);current=d;if(sync)syncFields(d);el("loading").hidden=false;try{const lo=await getFont(d.fontId,d.renderedText,d.fontWeight,d.italic);if(tk!==token)return;const g=createGeo(lo.font,d,lo.syntheticItalic);const b=g.boundingBox;if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()}if(dimGroup){scene.remove(dimGroup);disp(dimGroup)}mesh=new THREE.Mesh(g,makeMat(d.materialPreset));mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);dimGroup=showDims?ground(b):null;if(dimGroup)scene.add(dimGroup);fitEnv(mesh);const w=b.max.x-b.min.x,h=b.max.y-b.min.y,de=b.max.z-b.min.z,tri=Math.floor((g.index?g.index.count:g.attributes.position.count)/3);el("stats-size").textContent=w.toFixed(0)+" × "+h.toFixed(0)+" × "+de.toFixed(1)+" mm";el("stats-tri").textContent=tri.toLocaleString()+" tris";if(!framed){frameModel();framed=true}warn(w,h,de)}catch(e){}finally{if(tk===token)el("loading").hidden=true}}
    function setP(inp){const mn=Number(inp.min),mx=Number(inp.max);inp.style.setProperty("--p",((Number(inp.value)-mn)/(mx-mn)*100)+"%")}
    function dispNum(mm){return units==="cm"?Number((mm/10).toFixed(2)):Number(mm.toFixed(mm<10?1:0))}
    function syncDim(n){const sl=fields[n],num=fields[n+"Number"],v=Number(sl.value);num.value=String(dispNum(v));num.min=String(DIM[n].min*(units==="cm"?.1:1));num.step=String(DIM[n].step*(units==="cm"?.1:1));el(n+"-unit").textContent=units;el(n+"-out").textContent=num.value+" "+units;setP(sl)}
    function setMm(n,v){const def=DIM[n],mm=Math.max(def.min,Number.isFinite(Number(v))?Number(v):def.min),sl=fields[n];sl.max=String(Math.max(def.max,mm));sl.value=String(mm);syncDim(n)}
    function syncFields(d){fields.text.value=d.text;selectedFont={id:d.fontId,family:d.font,category:(catalog.find(f=>f.id===d.fontId)||{}).category||"Sans"};updateSel();fields.textCase.value=d.textCase;fields.fontWeight.value=d.fontWeight;fields.italic.checked=d.italic;fields.underline.checked=d.underline;setMm("size",d.sizeMm);setMm("depth",d.depthMm);setMm("bevel",d.bevelMm);fields.bevelSegments.value=String(d.bevelSegments);fields.curveSegments.value=String(d.curveSegments);fields.bevelSide.value=d.bevelSide;smoothNormals=d.smoothNormals;fields.materialPreset.value=MAT[d.materialPreset]?d.materialPreset:"pla-orange";el("text-count").textContent=d.text.length+" / 24";syncRes()}
    function syncRes(){el("bevel-segments-out").textContent=fields.bevelSegments.value;el("curve-segments-out").textContent=fields.curveSegments.value;setP(fields.bevelSegments);setP(fields.curveSegments)}
    function schedule(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>render(modelFromFields(),false),140)}
    ["size","depth","bevel"].forEach(n=>{fields[n].addEventListener("input",()=>{sfx.tick();syncDim(n);schedule()});fields[n+"Number"].addEventListener("input",()=>{const f=units==="cm"?10:1;setMm(n,Number(fields[n+"Number"].value)*f);schedule()})});
    el("units-pill").onclick=()=>{units=units==="mm"?"cm":"mm";el("units-pill").textContent=units;sfx.tap();["size","depth","bevel"].forEach(syncDim)};
    fields.text.addEventListener("input",()=>{el("text-count").textContent=fields.text.value.length+" / 24";schedule()});
    ["textCase","fontWeight","bevelSide","materialPreset"].forEach(k=>fields[k].addEventListener("change",()=>{sfx.tap();schedule()}));
    ["italic","underline"].forEach(k=>fields[k].addEventListener("change",()=>{sfx.toggle(fields[k].checked);schedule()}));
    ["bevelSegments","curveSegments"].forEach(k=>fields[k].addEventListener("input",()=>{sfx.tick();syncRes();schedule()}));

    /* font picker */
    function pf(f){return"Printa Preview "+f.id}function loadPreview(f){if(previewCache[f.id])return previewCache[f.id];const fam=pf(f),url=ORIGIN+"/api/font?id="+encodeURIComponent(f.id)+"&text="+encodeURIComponent(f.family+" Aa")+"&weight=regular&italic=false";previewCache[f.id]=new FontFace(fam,'url("'+url+'")').load().then(fa=>document.fonts.add(fa)).catch(()=>{});return previewCache[f.id]}
    function updateSel(){el("fp-name").textContent=selectedFont.family;el("fp-name").style.fontFamily='"'+pf(selectedFont)+'",sans-serif';el("fp-cat").textContent=selectedFont.category||"Sans";loadPreview(selectedFont)}
    function matches(){const q=fields.font.value.trim().toLowerCase(),m=!q?catalog:catalog.filter(f=>f.family.toLowerCase().includes(q)||f.category.toLowerCase().includes(q));return q?m:[selectedFont,...m.filter(f=>f.id!==selectedFont.id)]}
    function renderList(){const m=matches(),list=el("fp-list"),st=list.scrollTop;visible=m.slice(0,vCount);activeIdx=Math.min(activeIdx,Math.max(0,visible.length-1));el("fp-summary").textContent=m.length.toLocaleString();list.replaceChildren();visible.forEach((f,i)=>{loadPreview(f);const b=document.createElement("button");b.className="fp-opt"+(i===activeIdx?" active":"");b.innerHTML='<span class="fn"></span><span class="fc"></span><span class="ck"></span>';b.children[0].textContent=f.family;b.children[0].style.fontFamily='"'+pf(f)+'",sans-serif';b.children[1].textContent=f.category;b.children[2].textContent=f.id===selectedFont.id?"✓":"";b.addEventListener("mousedown",e=>e.preventDefault());b.onclick=()=>choose(f);list.appendChild(b)});if(!visible.length){const e=document.createElement("div");e.className="fp-empty";e.textContent="No fonts match this search";list.appendChild(e)}list.scrollTop=st}
    function openFp(){fpOpen=true;vCount=40;el("fp-menu").hidden=false;el("fp-trigger").classList.add("open");fields.font.value="";renderList();setTimeout(()=>fields.font.focus(),0);sfx.open()}
    function closeFp(){fpOpen=false;el("fp-menu").hidden=true;el("fp-trigger").classList.remove("open");fields.font.value="";sfx.close()}
    function choose(f){selectedFont=f;updateSel();closeFp();schedule()}
    el("fp-trigger").onclick=()=>fpOpen?closeFp():openFp();fields.font.addEventListener("input",()=>{activeIdx=0;vCount=40;renderList()});
    fields.font.addEventListener("keydown",e=>{const m=matches();if(e.key==="ArrowDown"){e.preventDefault();activeIdx=Math.min(activeIdx+1,m.length-1);if(activeIdx>=visible.length-3)vCount=Math.min(vCount+40,m.length);renderList();el("fp-list").querySelector(".active")?.scrollIntoView({block:"nearest"})}else if(e.key==="ArrowUp"){e.preventDefault();activeIdx=Math.max(activeIdx-1,0);renderList();el("fp-list").querySelector(".active")?.scrollIntoView({block:"nearest"})}else if(e.key==="Enter"&&visible[activeIdx]){e.preventDefault();choose(visible[activeIdx])}else if(e.key==="Escape")closeFp()});
    el("fp-list").addEventListener("scroll",e=>{const l=e.currentTarget;if(l.scrollTop+l.clientHeight<l.scrollHeight-100)return;const m=matches();if(vCount>=m.length)return;vCount=Math.min(vCount+40,m.length);renderList()});
    document.addEventListener("pointerdown",e=>{if(!el("fp").contains(e.target))closeFp()});
    fetch(ORIGIN+"/api/fonts").then(r=>r.json()).then(d=>{catalog=d.fonts||[];el("font-count").textContent=catalog.length.toLocaleString()+" families";const m=catalog.find(f=>f.id===selectedFont.id||f.family.toLowerCase()===selectedFont.family.toLowerCase());if(m)selectedFont=m;updateSel()}).catch(()=>el("font-count").textContent="unavailable");

    /* view settings */
    el("view").onclick=()=>{const p=el("view-pop"),o=p.hidden;p.hidden=!o;o?sfx.open():sfx.close()};
    document.addEventListener("pointerdown",e=>{if(!el("view-pop").hidden&&!el("view-pop").contains(e.target)&&!el("view").contains(e.target))el("view-pop").hidden=true},true);
    el("shade").querySelectorAll("button").forEach(b=>b.onclick=()=>{shading=b.dataset.v;sfx.toggle(shading==="smooth");el("shade").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));if(mesh){const pv=mesh.material;mesh.material=makeMat(current.materialPreset);pv.dispose()}});
    el("d-floor").onchange=()=>{bed.visible=el("d-floor").checked;sfx.toggle(el("d-floor").checked)};
    el("d-grid").onchange=()=>{grid.visible=el("d-grid").checked;sfx.toggle(el("d-grid").checked)};
    el("d-dims").onchange=()=>{showDims=el("d-dims").checked;sfx.toggle(showDims);if(dimGroup){scene.remove(dimGroup);disp(dimGroup);dimGroup=null}if(showDims&&mesh){mesh.geometry.computeBoundingBox();dimGroup=ground(mesh.geometry.boundingBox);scene.add(dimGroup)}};
    el("d-sfx").checked=sfxOn;el("d-sfx").onchange=()=>{sfxOn=el("d-sfx").checked;localStorage.setItem("printa.sfx-enabled",String(sfxOn));if(sfxOn)sfx.toggle(true)};

    el("menu").onclick=()=>{sfx.tap();app.classList.toggle("side-collapsed")};
    el("focus").onclick=()=>{sfx.tap();frameModel()};

    /* resizable */
    const rz=el("resizer");let drag=false;rz.addEventListener("pointerdown",e=>{drag=true;rz.setPointerCapture(e.pointerId)});rz.addEventListener("pointermove",e=>{if(!drag)return;app.style.setProperty("--side",Math.max(210,Math.min(420,e.clientX-app.getBoundingClientRect().left))+"px")});rz.addEventListener("pointerup",e=>{drag=false;rz.releasePointerCapture(e.pointerId)});

    /* host + tools */
    let seq=0;const pending=new Map();
    function reqHost(m,p,t=30000){return new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});parent.postMessage({jsonrpc:"2.0",id,method:m,params:p},"*");setTimeout(()=>{if(pending.has(id)){pending.delete(id);rej(new Error("timeout"))}},t)})}
    function callTool(n,a){return reqHost("tools/call",{name:n,arguments:a})}
    function toolArgs(){const d=modelFromFields();return{text:d.text,font:d.font,text_case:d.textCase,font_weight:d.fontWeight,italic:d.italic,underline:d.underline,size_mm:d.sizeMm,depth_mm:d.depthMm,bevel_mm:d.bevelMm,bevel_segments:d.bevelSegments,curve_segments:d.curveSegments,bevel_side:d.bevelSide,smooth_normals:d.smoothNormals,material_preset:d.materialPreset}}
    el("generate").onclick=async()=>{el("generate").disabled=true;sfx.tap();try{const r=await callTool("create_extruded_text",toolArgs());const d=r&&r.structuredContent?r.structuredContent:r;await render(d,true);sfx.ok()}catch(e){sfx.err()}finally{el("generate").disabled=false}};
    el("download").onclick=async()=>{const d=modelFromFields();sfx.tap();const u=new URL("/api/stl",ORIGIN);u.search=new URLSearchParams({text:d.text,font:d.font,textCase:d.textCase,fontWeight:d.fontWeight,italic:String(d.italic),underline:String(d.underline),size:String(d.sizeMm),depth:String(d.depthMm),bevel:String(d.bevelMm),bevelSegments:String(d.bevelSegments),curveSegments:String(d.curveSegments),bevelSide:d.bevelSide,smoothNormals:String(d.smoothNormals)}).toString();const href=u.toString();if(window.openai&&window.openai.openExternal)await window.openai.openExternal({href});else window.open(href,"_blank","noopener")};

    /* fullscreen */
    let dm=window.openai&&window.openai.displayMode==="fullscreen"?"fullscreen":"inline";
    function setDM(m){dm=m==="fullscreen"?"fullscreen":"inline";app.classList.toggle("is-fullscreen",dm==="fullscreen");requestAnimationFrame(()=>{resize();reportH()})}
    async function toggleFull(){const t=dm==="fullscreen"?"inline":"fullscreen";sfx.tap();try{let r;if(window.openai&&window.openai.requestDisplayMode)r=await window.openai.requestDisplayMode({mode:t});else r=await reqHost("ui/request-display-mode",{mode:t},4000);setDM(r&&r.mode||t)}catch{try{if(t==="fullscreen"&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();setDM(t)}catch{}}}
    el("full").onclick=toggleFull;document.addEventListener("fullscreenchange",()=>setDM(document.fullscreenElement?"fullscreen":"inline"));
    window.addEventListener("openai:set_globals",e=>{const m=e.detail&&e.detail.globals&&e.detail.globals.displayMode;if(m)setDM(m)});
    function reportH(){if(dm!=="inline")return;const h=580;if(window.openai&&window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight(h);parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:Math.ceil(innerWidth),height:h}},"*")}

    window.addEventListener("message",e=>{if(e.source!==parent)return;const m=e.data;if(!m||m.jsonrpc!=="2.0")return;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result);return}if(m.method==="ui/notifications/tool-result"){const d=m.params&&m.params.structuredContent;if(d)render(d,true)}if(m.method==="ui/notifications/tool-input"){const d=m.params&&m.params.arguments;if(d)render(d,true)}if(m.method==="ui/notifications/host-context-changed"&&m.params&&m.params.displayMode)setDM(m.params.displayMode)});

    function resize(){const b=el("canvas").getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/Math.max(b.height,1);camera.updateProjectionMatrix()}
    new ResizeObserver(resize).observe(el("canvas"));resize();
    (function loop(){requestAnimationFrame(loop);controls.update();renderer.render(scene,camera)})();

    const statsBar=document.createElement("div");statsBar.className="stats";statsBar.innerHTML='<span><b>Size</b> <span id="stats-size">—</span></span><span><b>Mesh</b> <span id="stats-tri">—</span></span><span id="stats-fit" class="ok">✓ Fits printer</span>';document.querySelector("main").appendChild(statsBar);
    setDM(dm);
    const initial=(window.openai&&window.openai.toolOutput)||(window.openai&&window.openai.toolInput)||{text:"Hello",font:"Roboto",fontId:"roboto",sizeMm:36,depthMm:4,bevelMm:.6};
    render(initial,true);requestAnimationFrame(reportH);
  </script>
</body>
</html>`;
}
