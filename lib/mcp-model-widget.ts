export function createModelWidgetHtml(origin: string) {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{
      color-scheme:light;
      --side-w:280px;
      --canvas:#ffffff;--soft:#fafafa;--card:#f4f4f5;--strong:#e9e9ec;
      --ink:#18181b;--body:#3f3f46;--muted:#71717a;--hair:#e4e4e7;
      --pink:#ff4d8b;--lav:#6e56cf;--mint:#a4d4c5;
    }
    *{box-sizing:border-box}
    body{margin:0;background:transparent;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    button{font:inherit;cursor:pointer}
    .app{height:580px;min-height:520px;display:grid;grid-template-columns:var(--side-w) 6px minmax(0,1fr);overflow:hidden;border:1px solid var(--hair);border-radius:12px;background:var(--canvas)}
    /* Sidebar hidden by default — showcase the shape first */
    .app.spec-hidden{grid-template-columns:0 0 minmax(0,1fr)}
    .app.spec-hidden .side,.app.spec-hidden .grip{display:none}

    /* Sidebar */
    .side{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--soft)}
    .side-head{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}
    .mark{display:grid;place-items:center;width:26px;height:26px;border-radius:6px;background:var(--ink);color:#fff;font-size:13px}
    .brand{font-size:12px;font-weight:700;letter-spacing:.08em}
    .tag{margin-left:auto;padding:4px 8px;border-radius:999px;background:var(--card);color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.06em}
    .controls{min-height:0;display:flex;flex:1;flex-direction:column;gap:11px;padding:4px 14px 14px;overflow:auto;scrollbar-width:thin}
    .label{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;color:var(--body);font-size:10px;font-weight:650}
    .label small{color:var(--muted);font-size:8px;font-weight:600}
    .select-wrap{position:relative}
    .select-wrap:after{content:"⌄";position:absolute;right:11px;bottom:8px;color:var(--muted);pointer-events:none}
    select{width:100%;height:32px;appearance:none;padding:0 28px 0 10px;border:1px solid var(--hair);border-radius:8px;outline:0;background:var(--canvas);color:var(--ink);font-size:11px;font-weight:600;cursor:pointer}
    select:focus,textarea:focus{border-color:var(--lav);box-shadow:0 0 0 3px rgba(184,164,237,.25)}
    textarea{width:100%;flex:1;min-height:150px;resize:vertical;padding:10px;border:1px solid #27272a;border-radius:8px;outline:0;background:#18181b;color:#f4f4f5;caret-color:var(--pink);font:500 9.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2}
    .error{display:none;padding:8px 10px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:9.5px;line-height:1.45}
    .apply{min-height:32px;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:8px;background:var(--ink);color:#fff;font-size:11px;font-weight:600}
    .apply:hover{background:#3f3f46}
    .apply:disabled{opacity:.55;cursor:wait}
    .apply i{display:none;width:11px;height:11px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
    .apply.is-loading i{display:block}
    .hint{color:var(--muted);font-size:8.5px;line-height:1.5}
    .hint b{font-weight:650}

    /* Resize handle */
    .grip{position:relative;cursor:col-resize;background:var(--soft);border-right:1px solid var(--hair)}
    .grip:hover:after,.grip.is-active:after{content:"";position:absolute;inset:0 2px;background:var(--lav);border-radius:2px;opacity:.7}

    /* Stage */
    .stage{position:relative;min-width:0;min-height:0;background:#11110f}
    .canvas{position:absolute;inset:0}
    .canvas canvas{display:block;width:100%;height:100%}
    .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(0,0,0,.45);color:rgba(255,255,255,.78);font:600 8.5px/1 ui-monospace,Menlo,monospace;backdrop-filter:blur(8px)}
    .chip small{color:rgba(255,255,255,.45);font:inherit;text-transform:uppercase;letter-spacing:.05em}
    .hud-top{position:absolute;z-index:2;inset:12px 12px auto;display:flex;align-items:flex-start;gap:8px;pointer-events:none}
    .hud-top .title{max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hud-actions{margin-left:auto;display:flex;gap:7px;pointer-events:auto}
    .icon-btn{display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(0,0,0,.45);color:rgba(255,255,255,.78);backdrop-filter:blur(8px)}
    .icon-btn:hover{color:#fff}
    .download{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px;border-radius:9px;background:#ffffff;color:#18181b;text-decoration:none;font-size:10px;font-weight:700}
    .download:hover{background:#fff}
    .stats{position:absolute;z-index:2;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:6px;pointer-events:none}
    .status-good{border-color:rgba(110,231,183,.3);color:#a7f3d0}
    .status-warn{border-color:rgba(252,211,77,.4);color:#fde68a}
    .warning{padding:6px 10px;border-radius:999px;border:1px solid rgba(252,211,77,.4);background:rgba(0,0,0,.5);color:#fde68a;font-size:8.5px;font-weight:600;backdrop-filter:blur(8px)}
    .loading{position:absolute;z-index:4;inset:0;display:grid;place-items:center;background:rgba(10,10,9,.62);color:rgba(255,255,255,.75);font:600 10px/1 ui-monospace,Menlo,monospace;backdrop-filter:blur(4px)}

    /* View settings panel */
    .panel{position:absolute;z-index:5;top:54px;right:12px;display:none;width:200px;padding:11px;border:1px solid var(--hair);border-radius:10px;background:var(--canvas);box-shadow:0 16px 40px -16px rgba(24,24,27,.35)}
    .panel.is-open{display:grid;gap:9px}
    .panel h4{margin:0;color:var(--muted);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
    .seg{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:2px;border-radius:7px;background:var(--card)}
    .seg button{padding:5px 4px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:10px;font-weight:650;text-transform:capitalize}
    .seg button.is-active{background:var(--canvas);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
    .row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:26px;font-size:11px;font-weight:550}
    .row input{position:absolute;opacity:0;pointer-events:none}
    .row i{position:relative;width:28px;height:16px;flex:0 0 auto;border-radius:99px;background:#d4d4d8;transition:background .15s}
    .row i:after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s}
    .row input:checked+i{background:var(--lav)}
    .row input:checked+i:after{transform:translateX(12px)}
    .row{cursor:pointer}
    .editor-link{position:absolute;z-index:2;right:12px;bottom:12px;pointer-events:auto;text-decoration:none}
    @keyframes spin{to{transform:rotate(360deg)}}

    @media(max-width:700px){
      .app{height:auto;min-height:660px;grid-template-columns:1fr;grid-template-rows:auto 420px}
      .app.spec-hidden{grid-template-rows:minmax(420px,1fr)}
      .grip{display:none}
      .side{border-bottom:1px solid var(--hair)}
    }
  </style>
</head>
<body>
  <div class="app spec-hidden" id="app">
    <aside class="side">
      <div class="side-head"><span class="mark">▰</span><span class="brand">PRINTA</span><span class="tag">SPEC 1.0</span></div>
      <div class="controls">
        <label class="select-wrap"><span class="label"><span>Starting form</span><small>9 presets</small></span><select id="demo" data-cuelume-press><option value="type-specimen">Type specimen</option><option value="contour-spiral-vase">Contour spiral vase</option><option value="zenith-twist">Zenith twist vase</option><option value="fluted-bud-vase">Fluted bud vase</option><option value="ripple-column-vase">Ripple column vase</option><option value="spline-petal-dish">Spline petal dish</option><option value="primitive-totem">Primitive totem</option><option value="water-ripple-tile">Water ripple tile</option><option value="cloth-drape-study">Cloth drape study</option></select></label>
        <label style="display:flex;flex-direction:column;flex:1;min-height:0"><span class="label"><span>Model spec · JSON / YAML</span><small id="chars">0 chars</small></span><textarea id="spec" spellcheck="false" aria-label="Procedural model JSON or YAML spec"></textarea></label>
        <div id="error" class="error"></div>
        <button id="apply" class="apply" type="button"><i></i><span>Apply spec</span></button>
        <div class="hint">Edits re-run <b>create_procedural_model</b>, so the chat result and the STL stay in sync.</div>
      </div>
    </aside>
    <div class="grip" id="grip" role="separator" aria-orientation="vertical" aria-label="Resize sidebar"></div>
    <main class="stage">
      <div id="canvas" class="canvas"></div>
      <div class="hud-top">
        <span id="title" class="chip title">Building model…</span>
        <span id="dims" class="chip">—</span>
        <div class="hud-actions">
          <button id="toggleSpec" class="icon-btn" type="button" aria-label="Edit spec" title="Edit spec">✎</button>
          <button id="view" class="icon-btn" type="button" aria-label="View settings" title="View settings">◑</button>
          <button id="focus" class="icon-btn" type="button" aria-label="Frame model" title="Fit model in view">⛶</button>
          <a id="download" class="download" href="#" data-cuelume-press>⬇ STL</a>
        </div>
      </div>
      <div id="panel" class="panel">
        <h4>View settings</h4>
        <div class="seg" id="shading">
          <button type="button" data-mode="smooth" class="is-active">Smooth</button>
          <button type="button" data-mode="flat">Flat</button>
        </div>
        <label class="row">Floor<input id="floor" type="checkbox" checked /><i></i></label>
        <label class="row">Grid<input id="gridToggle" type="checkbox" checked /><i></i></label>
        <label class="row">Sounds<input id="sound" type="checkbox" checked /><i></i></label>
      </div>
      <div class="stats" id="stats">
        <span class="chip"><small>Mesh</small><span id="triangles">—</span></span>
        <span class="chip"><small>Volume</small><span id="volume">—</span></span>
        <span class="chip"><small>Material</small><span id="material">—</span></span>
        <span id="status" class="chip status-good">Ready to print</span>
        <span id="warnings" style="display:contents"></span>
      </div>
      <a id="editor" class="editor-link chip" href="#" target="_blank">Open full editor ↗</a>
      <div id="loading" class="loading">Evaluating model graph…</div>
    </main>
  </div>
  <script type="importmap">
    {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/"}}
  </script>
  <script type="module">
    import * as THREE from "three";
    import {OrbitControls} from "three/addons/controls/OrbitControls.js";
    import {STLLoader} from "three/addons/loaders/STLLoader.js";
    import {toCreasedNormals} from "three/addons/utils/BufferGeometryUtils.js";
    import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
    import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
    import {GTAOPass} from "three/addons/postprocessing/GTAOPass.js";
    import {OutputPass} from "three/addons/postprocessing/OutputPass.js";
    import {App} from "https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@1.7.4/+esm";
    import {play,setEnabled,bind} from "https://cdn.jsdelivr.net/npm/cuelume@0.1.2/+esm";

    const ORIGIN=${JSON.stringify(origin)};
    const el=id=>document.getElementById(id);

    /* ---------- sounds ---------- */
    const store={get(key){try{return localStorage.getItem(key)}catch{return null}},set(key,value){try{localStorage.setItem(key,value)}catch{}}};
    let soundOn=store.get("printa:sound")!=="off";
    setEnabled(soundOn);bind();
    el("sound").checked=soundOn;
    el("sound").addEventListener("change",event=>{soundOn=event.target.checked;store.set("printa:sound",soundOn?"on":"off");setEnabled(soundOn);if(soundOn)play("toggle")});

    /* ---------- three.js scene ---------- */
    const scene=new THREE.Scene();
    scene.background=new THREE.Color("#11110f");
    scene.fog=new THREE.Fog("#11110f",440,900);
    const camera=new THREE.PerspectiveCamera(34,1,.1,3000);
    camera.up.set(0,0,1);camera.position.set(145,-185,125);
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.08;
    el("canvas").appendChild(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,0,45);
    scene.add(new THREE.HemisphereLight("#fff7e8","#182241",2.5));
    const key=new THREE.DirectionalLight("#fff0d5",5.4);
    key.position.set(-120,-150,240);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
    scene.add(key);scene.add(key.target);
    const rim=new THREE.DirectionalLight("#748cff",4.2);
    rim.position.set(150,100,150);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(240,128),new THREE.MeshStandardMaterial({color:"#191916",roughness:.86,metalness:.08}));
    floor.position.z=-.3;floor.receiveShadow=true;scene.add(floor);
    const grid=new THREE.GridHelper(420,42,"#363631","#272724");
    grid.rotation.x=Math.PI/2;grid.position.z=.05;scene.add(grid);
    /* Ambient occlusion for soft crevice darkening. */
    const composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    const gtao=new GTAOPass(scene,camera,1,1);
    gtao.output=GTAOPass.OUTPUT.Default;gtao.blendIntensity=.85;
    gtao.updateGtaoMaterial({radius:8,distanceExponent:1,thickness:1,scale:1.1,samples:16,screenSpaceRadius:false});
    composer.addPass(gtao);composer.addPass(new OutputPass());

    let mesh=null,baseGeometry=null,dimensions=null,token=0,resultTimer=0,appReady=false,lastUrl="";
    let shadingMode=store.get("printa:shading")==="flat"?"flat":"smooth";
    const app=new App({name:"printa-procedural-model",version:"0.6.0"},{},{autoResize:false});

    /* Sizes the shadow frustum, floor and fog to the model so shadows work at any print size. */
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
      gtao.updateGtaoMaterial({radius:THREE.MathUtils.clamp(radius*.22,2,40)});
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
    function frame(){
      if(!mesh)return;
      const box=new THREE.Box3().setFromObject(mesh);
      if(dimensions)box.expandByObject(dimensions);
      const sphere=box.getBoundingSphere(new THREE.Sphere()),distance=Math.max(38,sphere.radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.12);
      camera.position.set(sphere.center.x+distance*.75,sphere.center.y-distance,sphere.center.z+distance*.62);
      camera.near=Math.max(.1,distance/150);camera.far=distance*20;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);controls.update();
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
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
      const c=canvas.getContext("2d");
      c.fillStyle="rgba(10,26,25,.92)";c.beginPath();c.roundRect(3,3,506,122,24);c.fill();
      c.strokeStyle=color;c.lineWidth=5;c.stroke();
      c.fillStyle="#fffaf0";c.font="700 48px ui-monospace,monospace";c.textAlign="center";c.textBaseline="middle";c.fillText(text,256,65);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Mesh(new THREE.PlaneGeometry(size*4,size),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));
      label.renderOrder=12;return label;
    }
    function groundDimensions(box,settings,units){
      const group=new THREE.Group(),w=box.max.x-box.min.x,h=box.max.y-box.min.y,largest=Math.max(w,h),scale=units==="cm"?10:units==="in"?25.4:1,margin=Math.max((settings.offset||9)*scale,largest*.045),arrow=THREE.MathUtils.clamp(largest*.025,2.5,9),size=THREE.MathUtils.clamp(largest*.035,4,10),z=.32,widthY=box.min.y-margin,heightX=box.min.x-margin,precision=settings.precision??1;
      function lines(points,color){const geometry=new THREE.BufferGeometry().setFromPoints(points),line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,depthTest:false}));line.renderOrder=10;group.add(line)}
      const v=(x,y)=>new THREE.Vector3(x,y,z);
      if(settings.width!==false){lines([v(box.min.x,widthY),v(box.max.x,widthY),v(box.min.x,widthY),v(box.min.x+arrow,widthY+arrow*.52),v(box.min.x,widthY),v(box.min.x+arrow,widthY-arrow*.52),v(box.max.x,widthY),v(box.max.x-arrow,widthY+arrow*.52),v(box.max.x,widthY),v(box.max.x-arrow,widthY-arrow*.52)],"#ff6b8f");const label=dimensionLabel("W  "+(w/scale).toFixed(precision)+" "+units,"#ff6b8f",size);label.position.set((box.min.x+box.max.x)/2,widthY-size*1.05,z+.03);group.add(label)}
      if(settings.height!==false){lines([v(heightX,box.min.y),v(heightX,box.max.y),v(heightX,box.min.y),v(heightX+arrow*.52,box.min.y+arrow),v(heightX,box.min.y),v(heightX-arrow*.52,box.min.y+arrow),v(heightX,box.max.y),v(heightX+arrow*.52,box.max.y-arrow),v(heightX,box.max.y),v(heightX-arrow*.52,box.max.y-arrow)],"#b8a4ed");const label=dimensionLabel("H  "+(h/scale).toFixed(precision)+" "+units,"#b8a4ed",size);label.rotation.z=Math.PI/2;label.position.set(heightX-size*1.05,(box.min.y+box.max.y)/2,z+.03);group.add(label)}
      return group;
    }

    /* ---------- view settings ---------- */
    const panel=el("panel");
    el("view").addEventListener("click",()=>{panel.classList.toggle("is-open");if(panel.classList.contains("is-open"))play("page")});
    document.addEventListener("pointerdown",event=>{if(panel.classList.contains("is-open")&&!panel.contains(event.target)&&event.target!==el("view"))panel.classList.remove("is-open")});
    el("shading").addEventListener("click",event=>{
      const button=event.target.closest("button");
      if(!button)return;
      shadingMode=button.dataset.mode;
      store.set("printa:shading",shadingMode);
      [...el("shading").children].forEach(child=>child.classList.toggle("is-active",child===button));
      play("toggle");applyShading();
    });
    [...el("shading").children].forEach(child=>child.classList.toggle("is-active",child.dataset.mode===shadingMode));
    el("floor").addEventListener("change",event=>{floor.visible=event.target.checked;play("toggle")});
    el("gridToggle").addEventListener("change",event=>{grid.visible=event.target.checked;play("toggle")});

    /* ---------- sidebar resize ---------- */
    const grip=el("grip"),appBox=el("app");
    let drag=null;
    grip.addEventListener("pointerdown",event=>{drag={x:event.clientX,w:appBox.querySelector(".side").getBoundingClientRect().width};grip.classList.add("is-active");grip.setPointerCapture(event.pointerId)});
    grip.addEventListener("pointermove",event=>{if(!drag)return;const next=Math.min(420,Math.max(230,drag.w+event.clientX-drag.x));appBox.style.setProperty("--side-w",next+"px");resize()});
    const endDrag=()=>{if(!drag)return;drag=null;grip.classList.remove("is-active");play("tick")};
    grip.addEventListener("pointerup",endDrag);grip.addEventListener("pointercancel",endDrag);

    /* ---------- MCP plumbing ---------- */
    function errorText(error,fallback="Could not build this spec."){if(error instanceof Error&&error.message)return error.message;if(error&&typeof error==="object"&&"message" in error)return String(error.message);return fallback}
    function setBusy(busy,label,overlay){el("apply").disabled=busy;el("apply").classList.toggle("is-loading",busy);el("apply").querySelector("span").textContent=label||"Apply spec";el("loading").textContent=overlay||"Evaluating model graph…";el("loading").style.display=busy?"grid":"none"}
    function showError(message){clearTimeout(resultTimer);el("error").textContent=message;el("error").style.display="block";setBusy(false);play("error")}
    function acceptInput(args){if(args&&typeof args.spec==="string"){el("spec").value=args.spec;el("chars").textContent=args.spec.length.toLocaleString()+" chars"}setBusy(true,"Evaluating…","Evaluating model graph…");clearTimeout(resultTimer);resultTimer=setTimeout(()=>showError("The model result did not arrive. Apply the spec to retry."),60000)}
    async function show(data,replaceSpec=true){
      if(!data||!data.stlUrl){showError("The model tool completed without a preview URL. Apply the spec to retry.");return}
      clearTimeout(resultTimer);
      const previewUrl=data.previewUrl||data.stlUrl;
      if(previewUrl===lastUrl&&mesh){setBusy(false);return}
      lastUrl=previewUrl;
      const current=++token;
      setBusy(true,"Loading…","Downloading optimized preview…");
      el("title").textContent=data.name||"Procedural model";
      el("dims").textContent=Number(data.widthMm).toFixed(1)+" × "+Number(data.depthMm).toFixed(1)+" × "+Number(data.heightMm).toFixed(1)+" mm";
      el("triangles").textContent=Number(data.triangles).toLocaleString()+" tris";
      el("volume").textContent=(Number(data.volumeEstimateMm3)/1000).toFixed(1)+" cm³";
      el("material").textContent=(data.materialPreset||"PLA").replaceAll("-"," ");
      el("download").href=data.stlUrl;
      el("editor").href=data.studioUrl||ORIGIN+"/editor";
      if(replaceSpec&&data.spec){el("spec").value=data.spec;el("chars").textContent=data.spec.length.toLocaleString()+" chars"}
      el("warnings").replaceChildren(...(data.warnings||[]).map(text=>{const node=document.createElement("span");node.className="warning";node.textContent=text;return node}));
      const exceeds=!!data.exceedsBuildVolume;
      el("status").classList.toggle("status-good",!exceeds);
      el("status").classList.toggle("status-warn",exceeds);
      el("status").textContent=exceeds?"Too big for printer":"Ready to print";
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        const response=await fetch(previewUrl,{signal:controller.signal});
        if(!response.ok)throw new Error("Model preview could not be loaded");
        const buffer=await response.arrayBuffer();
        if(current!==token)return;
        el("loading").textContent="Parsing "+(buffer.byteLength/1048576).toFixed(1)+" MB preview…";
        await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
        const geometry=new STLLoader().parse(buffer);
        if(current!==token){geometry.dispose();return}
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        if(mesh){scene.remove(mesh);if(mesh.geometry!==baseGeometry)mesh.geometry.dispose();mesh.material.dispose()}
        if(baseGeometry)baseGeometry.dispose();
        baseGeometry=geometry;
        if(dimensions){scene.remove(dimensions);disposeObject(dimensions);dimensions=null}
        const presets={"pla-orange":["#ff6b5a",.4,.03],"pla-matte":["#ebe6d6",.8,0],"pla-silk":["#b8a4ed",.22,.36],petg:["#a4d4c5",.2,0],resin:["#ffb084",.16,0]},preset=presets[data.materialPreset]||presets["pla-orange"];
        mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:preset[0],roughness:preset[1],metalness:preset[2],clearcoat:data.materialPreset==="resin"?.7:.15}));
        mesh.castShadow=true;mesh.receiveShadow=true;
        scene.add(mesh);
        applyShading();
        fitSceneToModel(geometry.boundingBox.clone());
        const display=data.display||{floor:true,grid:true,dimensions:{visible:true,width:true,height:true,offset:9,precision:1}};
        floor.visible=display.floor!==false&&el("floor").checked;
        grid.visible=display.grid!==false&&el("gridToggle").checked;
        if(display.dimensions&&display.dimensions.visible!==false&&geometry.boundingBox){dimensions=groundDimensions(geometry.boundingBox,display.dimensions,data.units||"mm");scene.add(dimensions)}
        frame();
        el("error").style.display="none";
        play("ready");
      }catch(error){
        if(current===token)showError(error&&error.name==="AbortError"?"The optimized preview timed out after 30 seconds. The STL download is still available.":errorText(error,"Model could not be loaded."));
      }finally{
        clearTimeout(timer);
        if(current===token)setBusy(false);
      }
    }
    async function acceptResult(result){if(!result)return;if(result.isError){showError((result.content||[]).map(item=>item.text||"").filter(Boolean).join(" ")||"The model tool returned an error.");return}if(result.structuredContent)await show(result.structuredContent,true);else showError("The model tool returned no structured model data.")}
    async function callTool(args){if(window.openai&&typeof window.openai.callTool==="function")return window.openai.callTool("create_procedural_model",args);if(!appReady)throw new Error("The MCP app is still connecting. Try again in a moment.");return app.callServerTool({name:"create_procedural_model",arguments:args})}
    async function run(args){acceptInput(args);el("error").style.display="none";try{await acceptResult(await callTool(args))}catch(error){showError(errorText(error))}}

    el("apply").addEventListener("click",()=>{play("press");const spec=el("spec").value.trim();if(spec)run({spec})});
    el("demo").addEventListener("change",event=>{play("droplet");run({demo:event.target.value})});
    el("spec").addEventListener("input",event=>{el("chars").textContent=event.target.value.length.toLocaleString()+" chars"});
    el("focus").addEventListener("click",()=>{play("tick");frame()});
    el("toggleSpec").addEventListener("click",()=>{const hidden=el("app").classList.toggle("spec-hidden");el("toggleSpec").textContent=hidden?"✎":"×";el("toggleSpec").title=hidden?"Edit spec":"Hide spec";play("page");requestAnimationFrame(resize)});

    app.ontoolinput=params=>acceptInput(params.arguments||{});
    app.ontoolresult=result=>void acceptResult(result);
    app.ontoolcancelled=params=>showError(params.reason||"Model generation was cancelled.");
    const legacyOutput=window.openai&&window.openai.toolOutput,legacyInput=window.openai&&window.openai.toolInput;
    if(legacyOutput)void show(legacyOutput,true);else if(legacyInput)acceptInput(legacyInput);
    app.connect().then(()=>{appReady=true}).catch(error=>{if(!legacyOutput&&!legacyInput)showError("Could not connect to the MCP host: "+errorText(error))});

    function resize(){const box=el("canvas").getBoundingClientRect();renderer.setSize(box.width,box.height,false);composer.setSize(box.width,box.height);gtao.setSize(box.width,box.height);camera.aspect=box.width/Math.max(box.height,1);camera.updateProjectionMatrix()}
    new ResizeObserver(resize).observe(el("canvas"));
    resize();
    (function loop(){requestAnimationFrame(loop);controls.update();composer.render()})();
  </script>
</body>
</html>`;
}
