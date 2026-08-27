/**
 * The MCP app UI, for every Printa tool.
 *
 * One job: show the geometry the tool just computed, and get out of the way.
 * The earlier widget was a second editor — fonts, sliders, a path tracer, a
 * spec pane — inside a frame a host sizes for a chat message. Everything it
 * offered exists in the editor, one click away, so this shows the model and
 * hands over: click the stage and Printa opens with the same document.
 *
 * Hosts differ in how they hand a widget its data, and getting any one of
 * them wrong leaves the frame blank. So data is accepted from every path at
 * once, and no single failure takes the UI down:
 *
 *   1. `window.openai.toolOutput` — ChatGPT injects this global, and NOT
 *      necessarily before this module evaluates: we also listen for
 *      `openai:set_globals` and poll briefly.
 *   2. `@modelcontextprotocol/ext-apps` — the MCP Apps SDK handshake, loaded
 *      from a CDN, so a blocked CDN must not be fatal.
 *   3. Raw `postMessage` JSON-RPC — the same wire protocol, inline, for when
 *      the SDK cannot be reached at all.
 *   4. `/api/model/inspect` on our own origin — a last-resort self-bootstrap
 *      so an embedded widget shows a model rather than a dead spinner.
 *
 * Sizing matters as much: a host sizes the iframe from what the widget
 * reports, and reporting nothing collapses it to nothing.
 */

type WidgetKind = "model" | "text";

export function createSimpleWidgetHtml(origin: string, kind: WidgetKind) {
  const safeOrigin = JSON.stringify(origin);
  const safeKind = JSON.stringify(kind);

  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Printa — printable model</title>
  <style>
    :root{
      color-scheme:light dark;
      --ink:#18181b;--muted:#71717a;--line:#e4e4e7;--surface:#fffaf0;
      --stage-a:#f6f3ec;--stage-b:#e9e5da;--accent:#ff4d8b;
    }
    @media (prefers-color-scheme:dark){
      :root:not([data-theme="light"]){
        --ink:#f4f4f5;--muted:#a1a1aa;--line:#33333a;--surface:#151517;
        --stage-a:#1b1b1f;--stage-b:#0f0f12;
      }
    }
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;overflow:hidden;background:transparent}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
    .card{position:relative;height:var(--frame-h,420px);overflow:hidden;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,var(--stage-a),var(--stage-b))}
    .stage{position:absolute;inset:0}
    .stage canvas{display:block;width:100%;height:100%}
    .open{position:absolute;inset:0;z-index:2;display:block;width:100%;height:100%;border:0;padding:0;background:transparent;cursor:pointer;appearance:none}
    .name{position:absolute;z-index:3;top:14px;left:16px;max-width:60%;overflow:hidden;font-size:13px;font-weight:650;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
    .cta{position:absolute;z-index:4;top:11px;right:12px;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;background:var(--ink);color:var(--surface);font-size:11px;font-weight:650;text-decoration:none}
    .cta:hover{opacity:.9}
    .bar{position:absolute;z-index:3;left:16px;right:16px;bottom:13px;display:flex;align-items:center;gap:10px;color:var(--muted);font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:none}
    .bar a{color:var(--muted);pointer-events:auto;text-decoration:none;border-bottom:1px solid currentColor}
    .bar .hint{margin-left:auto;opacity:.85}
    .warn{color:#b45309}
    @media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .warn{color:#fbbf24}}
    .state{position:absolute;z-index:5;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:var(--muted);font-size:12px}
    .state[hidden]{display:none}
    .spinner{width:13px;height:13px;margin-right:8px;display:inline-block;border:1.5px solid currentColor;border-top-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/"}}</script>
</head>
<body>
  <div class="card" id="card">
    <div class="stage" id="stage"></div>
    <button class="open" id="open" type="button" aria-label="Open this model in Printa"></button>
    <span class="name" id="name"></span>
    <a class="cta" id="cta" href="${origin}" target="_blank" rel="noopener">Open in Printa ↗</a>
    <div class="bar">
      <span id="stats"></span>
      <a id="download" href="#" download hidden>Download STL</a>
      <span class="hint">click to edit</span>
    </div>
    <div class="state" id="state"><span><i class="spinner"></i>Building the model…</span></div>
  </div>

  <script type="module">
    const ORIGIN = ${safeOrigin};
    const KIND = ${safeKind};
    const stage = document.getElementById("stage");
    const nameEl = document.getElementById("name");
    const statsEl = document.getElementById("stats");
    const stateEl = document.getElementById("state");
    const ctaEl = document.getElementById("cta");
    const openEl = document.getElementById("open");
    const downloadEl = document.getElementById("download");

    let current = null;
    let received = false;

    function applyTheme(theme){
      if(theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    }
    applyTheme(window.openai && window.openai.theme);

    /* ---- the host frame: report a height, or the iframe collapses -------- */
    function reportHeight(){
      const height = Math.round(document.getElementById("card").getBoundingClientRect().height) + 2;
      try{ if(window.openai && window.openai.notifyIntrinsicHeight) window.openai.notifyIntrinsicHeight(height); }catch{}
      post({ jsonrpc:"2.0", method:"notifications/ui/size-changed", params:{ height } });
    }
    function post(message){
      try{ window.parent && window.parent.postMessage(message, "*"); }catch{}
    }
    window.addEventListener("resize", reportHeight);
    reportHeight();

    function setState(text){
      if(!text){ stateEl.hidden = true; return; }
      stateEl.hidden = false;
      stateEl.innerHTML = text;
    }
    function showError(message){
      setState('<span>' + String(message || "Waiting for the model tool.") + '</span>');
    }

    /* ---- three.js, loaded from a CDN that may not be reachable ----------- */
    let rendererReady = false;
    let showMesh = async () => {};

    async function bootRenderer(){
      const [THREE, controlsModule, loaderModule] = await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
        import("three/addons/loaders/STLLoader.js"),
      ]);
      const { OrbitControls } = controlsModule;
      const { STLLoader } = loaderModule;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 6000);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      stage.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xcbc5b8, 2.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(-60, -90, 130);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xb8a4ed, 1.1);
      rim.position.set(80, 60, 50);
      scene.add(rim);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.8;
      /* The stage is a link; dragging it should orbit, not navigate. */
      let dragged = false;
      renderer.domElement.addEventListener("pointerdown", () => { dragged = false; controls.autoRotate = false; });
      renderer.domElement.addEventListener("pointermove", (event) => { if(event.buttons) dragged = true; });
      renderer.domElement.addEventListener("click", () => { if(!dragged) openStudio(); });
      openEl.remove();

      let mesh = null;
      function resize(){
        const rect = stage.getBoundingClientRect();
        if(rect.width < 2 || rect.height < 2) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
      }
      window.addEventListener("resize", resize);
      resize();

      (function frame(){
        requestAnimationFrame(frame);
        controls.update();
        renderer.render(scene, camera);
      })();

      showMesh = async (url) => {
        const response = await fetch(url, { mode:"cors" });
        if(!response.ok) throw new Error("The model service returned " + response.status + ".");
        const geometry = new STLLoader().parse(await response.arrayBuffer());
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        if(mesh){ scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
        mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0xe9e4d8, roughness: 0.62, metalness: 0.02, flatShading: false,
        }));
        const box = geometry.boundingBox;
        const centre = box.getCenter(new THREE.Vector3());
        mesh.position.set(-centre.x, -centre.y, -box.min.z);
        scene.add(mesh);

        /* Frame the whole model, whatever size it came out. */
        const radius = geometry.boundingSphere.radius || 40;
        const height = box.max.z - box.min.z;
        controls.target.set(0, 0, height / 2);
        const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.35;
        camera.position.set(distance * 0.62, -distance * 0.72, distance * 0.55 + height / 2);
        camera.near = Math.max(0.1, distance / 400);
        camera.far = distance * 12;
        camera.updateProjectionMatrix();
        controls.update();
        setState("");
      };
      rendererReady = true;
    }

    bootRenderer().catch(() => {
      showError("The 3D preview could not load — the model is still ready to download.");
    });

    /* ---- what the tool gave us ------------------------------------------ */
    function openStudio(){
      const url = current && current.studioUrl;
      window.open(url || ORIGIN + "/editor", "_blank", "noopener");
    }
    openEl.addEventListener("click", openStudio);

    function millimetres(value){
      return typeof value === "number" && isFinite(value) ? value.toFixed(value < 10 ? 1 : 0) : "?";
    }

    async function show(output){
      current = output;
      received = true;
      const name = output.name || output.text || output.filename || "Printable model";
      nameEl.textContent = name;
      document.title = "Printa — " + name;

      const width = output.widthMm;
      const depth = output.depthMm !== undefined ? output.depthMm : output.modelDepthMm;
      const height = output.heightMm;
      const size = millimetres(width) + " × " + millimetres(depth) + " × " + millimetres(height) + " mm";
      const triangles = typeof output.triangles === "number" ? " · " + output.triangles.toLocaleString() + " tris" : "";
      statsEl.textContent = size + triangles;
      statsEl.className = output.exceedsBuildVolume ? "warn" : "";

      if(output.studioUrl) ctaEl.href = output.studioUrl;
      if(output.stlUrl){
        downloadEl.href = output.stlUrl;
        downloadEl.hidden = false;
        if(output.filename) downloadEl.setAttribute("download", output.filename);
      }

      const previewUrl = output.previewUrl || output.stlUrl;
      if(!previewUrl){ showError("That tool returned no geometry to show."); return; }
      /* The renderer may still be importing three.js; wait briefly for it. */
      for(let attempt = 0; attempt < 60 && !rendererReady; attempt += 1){
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if(!rendererReady) return;
      try{ await showMesh(previewUrl); }
      catch(error){ showError(error && error.message ? error.message : "The model could not be drawn."); }
      reportHeight();
    }

    function accept(candidate){
      if(!candidate || typeof candidate !== "object") return false;
      const output = candidate.structuredContent || candidate;
      if(!output || (!output.previewUrl && !output.stlUrl)) return false;
      void show(output);
      return true;
    }

    /* (a) ChatGPT's globals, which may arrive after this module evaluates. */
    function hostGlobals(){
      const api = window.openai;
      if(!api) return null;
      return api.toolOutput || null;
    }
    accept(hostGlobals());
    window.addEventListener("openai:set_globals", (event) => {
      const globals = (event && event.detail && event.detail.globals) || {};
      applyTheme(globals.theme);
      if(globals.toolOutput) accept(globals.toolOutput);
    });
    /* Some builds mutate window.openai without firing an event. */
    const poll = setInterval(() => {
      if(received){ clearInterval(poll); return; }
      accept(hostGlobals());
    }, 250);
    setTimeout(() => clearInterval(poll), 15000);

    /* (b) the raw JSON-RPC channel, for hosts without the SDK. */
    window.addEventListener("message", (event) => {
      const data = event && event.data;
      if(!data || typeof data !== "object") return;
      if(data.method === "notifications/ui/tool-result" || data.method === "ui/tool-result"){
        accept(data.params && (data.params.result || data.params));
      }
      if(data.result && data.result.structuredContent) accept(data.result);
    });

    /* (c) the MCP Apps SDK handshake, best effort. */
    import("https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@1.7.4/+esm").then(({ App }) => {
      const app = new App({ name:"printa-" + KIND, version:"1.0.0" }, {}, { autoResize:false });
      app.ontoolresult = (result) => { accept(result); };
      app.ontoolcancelled = (params) => showError((params && params.reason) || "That model was cancelled.");
      return app.connect();
    }).catch(() => {
      post({ jsonrpc:"2.0", id:"printa-init", method:"initialize", params:{
        protocolVersion:"2025-06-18",
        capabilities:{},
        clientInfo:{ name:"printa-" + KIND, version:"1.0.0" },
      }});
      post({ jsonrpc:"2.0", method:"notifications/initialized", params:{} });
    });

    /* (d) self-bootstrap, so the frame is never an empty box. */
    setTimeout(() => {
      if(received) return;
      fetch(ORIGIN + "/api/model/inspect", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ demo:"type-specimen", format:"json" }),
      }).then((response) => {
        if(!response.ok) throw new Error("Could not reach the Printa model service.");
        return response.json();
      }).then((data) => {
        if(received) return;
        void show({
          name: data.document && data.document.name,
          widthMm: data.stats.widthMm,
          depthMm: data.stats.depthMm,
          heightMm: data.stats.heightMm,
          triangles: data.stats.triangles,
          previewUrl: ORIGIN + "/api/model/stl?spec=" + data.encoded + "&preview=true",
          stlUrl: data.stlUrl,
          studioUrl: data.studioUrl,
        });
      }).catch((error) => showError(error && error.message ? error.message : "Waiting for the model tool."));
    }, 6000);
  </script>
</body>
</html>`;
}

/** The text tool's app: the same viewer, told which tool it belongs to. */
export function createWidgetHtml(origin: string) {
  return createSimpleWidgetHtml(origin, "text");
}

/** The procedural model tool's app. */
export function createModelWidgetHtml(origin: string) {
  return createSimpleWidgetHtml(origin, "model");
}
