# Printa design and product system

Printa is a promptable 3D-model compiler for printable forms. Its primary surfaces are the MCP tools, MCP UI, and `/editor`; the homepage explains the system through interactive printing studies.

The audience is an entry-level 3D-print hobbyist or someone comfortable with 2D print/design tools — **not** a CAD professional. The editor must be legible at a glance: plain-language labels, one thing per row, advanced knobs hidden until asked for. The model is the hero; the interface is quiet scaffolding around it.

## Interface system (shadcn + Tailwind v4)

The editor and its shared controls are built from a small shadcn-style component library in `components/ui` (button, input, select, dialog, dropdown-menu, popover, slider, switch, tooltip, resizable, textarea) on Radix primitives. Design tokens live in `app/globals.css` under `@theme inline`. The MCP widgets are standalone inline-HTML documents that mirror the same tokens and patterns by hand (they can't import React).

**Restraint over decoration.** Surfaces are near-white neutrals (`#ffffff` / `#fafafa` / `#f4f4f5`), text is near-black, hairlines are light grey. There is exactly one saturated accent — Printa orange `#ff5d2e` — used for the active state, primary emphasis, and focus rings, and nothing else. No warm-paper gradients, no colored section cards, no uppercase mono eyebrows stacked on every panel. If a screen has more than one accent color competing for attention, it is wrong.

**Simplicity rules for the inspector.**
- One control per row; group at most three tightly-related numbers.
- Plain words over jargon: "Height", "Depth", "Ribs", "Bend", "Solid base" — not "extrude depth", "radialWave", "bottomCap".
- Every layer/shape shows only its essential fields inline; resolution/segment/thickness tuning goes inside a collapsed **Advanced** disclosure.
- Print/document settings collapse into a single **Print setup** section, closed by default.
- The raw JSON/YAML spec is never on the main surface — it lives behind an "Edit raw spec" action in a modal for power users.

The original brief called for a "precise workshop instrument with a playful material sensibility." That still holds, but the playfulness now lives in the **material presets and the 3D stage**, not in the chrome. The chrome is calm.

## Product principles

1. **The spec is the model.** JSON and YAML are first-class, durable representations. The editor never owns hidden geometry state.
2. **What you see is what the graph builds.** Structured controls, layer selection, dimensions, material, and the advanced document stay synchronized.
3. **Fast feedback, exact export.** Interaction uses a reduced preview compile. Download and MCP export always build the full-resolution STL.
4. **Composable before clever.** Sources, modifiers, transforms, assemblies, and repeats combine predictably. Simulations freeze into deterministic printable geometry.
5. **Printable by default.** Models are centered, placed on the bed, measured in real units, checked against build volume, and emitted as closed binary STL meshes.
6. **Camera continuity matters.** Editing a parameter never resets the user’s view. Only an explicit frame action changes the camera.

## Visual language

The interface combines warm paper-like editor surfaces with a dark model stage. The contrast should read as “design desk beside a render bay.”

### Color

| Token | Value | Use |
|---|---:|---|
| Canvas | `#fffaf0` | Homepage and editor base |
| Panel | `#f7f1e5` | Inspector sections and cards |
| Ink | `#171713` | Primary text and dark controls |
| Body | `#57534b` | Supporting copy |
| Muted | `#8a857b` | Metadata and secondary labels |
| Hairline | `#dfd8ca` | Dividers and quiet borders |
| Stage | `#11110f` | Three.js viewport |
| Orange | `#e1491f` | Print material and primary action |
| Pink | `#ff6b8f` | Width dimension and active accents |
| Lavender | `#b8a4ed` | Height/depth dimension |
| Teal | `#1a3a3a` | Deep contrast surfaces |
| Success | `#2c8a4c` | Printable/ready state |
| Warning | `#ae621e` | Build-volume warning |

The material palette is allowed to be more expressive than the UI palette. Presets should resemble common filament/resin families while maintaining readable stage contrast.

### Type

- Display: rounded, compact sans serif at medium weight.
- UI/body: Inter or system sans serif.
- Measurements, timings, schema labels, and code: system monospace.
- Avoid oversized marketing typography inside the editor. The model remains dominant.

### Shape and depth

- Editor fields: 8–10 px radius.
- Primary controls and compact cards: 10–12 px radius.
- Marketing feature cards: 18–24 px radius.
- Use one-pixel warm borders and subtle shadows. Depth should come primarily from the 3D stage and printed-layer imagery.

## Editor layout

The editor fills `100dvh` and never overflows the window. A slim (`h-13`) top bar holds the logo, an inline-editable model name, and the primary actions (Open, Save, Download STL, and an overflow menu with the raw spec / skill / schema). Below it, a **resizable two-pane split** (via `react-resizable-panels`): a minimal inspector on the left, the 3D stage on the right. The user can drag the divider; the sidebar has sensible min/max bounds and remembers its width.

- **Inspector:** independently scrollable. Order is Layers → selected shape/modifier → Print setup. It is deliberately sparse — see the simplicity rules above. No marketing intro, no demo grid living permanently in the panel.
- **Stage:** fills the rest, keeps the renderer mounted, and floats its own controls over the canvas (view settings, slice, frame, compile state, size/mesh readout).
- Starting forms and saved models live in an **Open** modal, not in the sidebar. Save/load persists to `localStorage`.

Layer rows express hierarchy through indentation. A shape row names its shape in plain language; modifier rows sit beneath the node they affect with a friendly name (Twist, Ribs, Bend…). Assemblies and repeats remain visible graph concepts.

Controls use the most direct representation:

- sliders paired with numeric entry for bounded continuous values;
- **focus-stable text and number inputs** — a field keeps its own draft while focused so live recompiles never steal the caret or reset the value mid-typing;
- unit-aware millimeter/centimeter/inch values;
- switches for booleans;
- searchable, scroll-complete Google Font picker (Radix popover) with live family previews;
- selects (Radix) for finite modes such as bevel side, material, primitive type, and case;
- compact JSON editors only for inherently structured arrays such as paths, profiles, drops, or colliders, kept inside Advanced.

## 3D stage

The default view is close enough to read the model without fog interference. Stage controls float over the canvas rather than sitting in a chrome bar. The stage includes:

- orbit, zoom, and explicit frame-model control;
- a **View settings** popover (opened from a viewport button) holding shading (**smooth / flat**), floor, grid, measurements, and an interface-sound toggle — presentation-only, never mutating printed geometry;
- a **slice slider** that clips the model along the up (Z) axis so the user can slide down and see inside;
- print-bed floor and optional grid that **scale to the model's bounding sphere**, so shadows and ground read correctly at any model size (a 5 mm charm and a 250 mm vase both sit in a fitted shadow);
- a directional key light whose shadow camera is refit to the model each load;
- spec-driven footprint width and height/depth arrows;
- material presets using physically based Three.js materials;
- no continuous render loop while idle;
- preserved camera and controls across mesh, material, and display updates.

Width uses pink; footprint height/depth uses lavender. Labels sit outside the bounds and scale with the model while remaining readable.

## Sound

Both the editor and the MCP widgets play **subtle, synthesized** interface sounds (WebAudio, no assets): a soft tap on selection/buttons, a feather tick on slider/number changes (throttled), a firmer toggle flip, open/close cues for dialogs, a two-note success on compile, and a low buzz on error. Sounds are quiet by design and can be muted from View settings; the preference persists per device.

## Model document architecture

`ModelDocument` is the single source of truth:

```text
document
├── units / print / display / metadata
└── root node
    ├── shape(source + ordered modifiers + transform + material)
    ├── assembly(children + ordered modifiers + transform)
    └── repeat(child + count + step + ordered modifiers + transform)
```

Sources currently include primitives, curve extrusion, axis revolution, Google-font text, deterministic water, and deterministic cloth. Revolved shells expose wall thickness, a solid bottom/base with independent thickness, and an optional solid top cap with independent thickness. Modifiers run in declared order: twist, taper, radial wave, axial wave, bend, noise, and smoothing.

IDs are editor identity; they do not alter geometry. Materials and display settings are presentation metadata and should not force a mesh rebuild.

## Evaluation and realtime performance

The compiler has two quality modes:

- **Preview:** capped curve/bevel/profile/solver resolution and no volume integration. Used only for live viewport feedback.
- **Full:** exact document resolution, volume estimate, and binary STL. Used for explicit inspection, MCP results, and download.

Graph execution is content-addressed. SHA-256 fingerprints are built bottom-up from source, modifiers, transform, and child fingerprints. A bounded LRU stores cloneable `BufferGeometry` results for sources, modifier chains, and final nodes. Identical in-flight source/node builds are coalesced. Editing one parent transform can reuse the unchanged child mesh.

The editor pipeline is intentionally single-pass:

1. Apply the structured change optimistically to the document/UI.
2. Skip compilation entirely for display, name, metadata, material, or build-volume-only changes.
3. Debounce geometry edits briefly and abort the previous request.
4. POST one preview compile to `/api/model/stl`.
5. Read dimensions, triangle count, material, build-volume state, cache data, and server timing from headers.
6. Parse the returned buffer directly; do not issue a second STL fetch.
7. Swap only the mesh and related dimension objects in the persistent scene.

The renderer invalidates on resize, controls, mesh, material, or gizmo changes and sleeps while idle. Full STL generation remains a GET URL encoded with the complete latest document.

## MCP and MCP UI

MCP tools accept the same schema used by the editor. Tool output should provide concise measurements, warnings, editor link, and STL link. The two MCP widgets (`lib/mcp-widget.ts` for text, `lib/mcp-model-widget.ts` for procedural) are standalone inline-HTML/JS documents that reproduce the editor's design language by hand: the same neutral surfaces and single orange accent, a **resizable, collapsible sidebar**, plain-language controls, focus-stable number inputs, a floating **View settings** popover with smooth/flat shading, fitted shadows, and subtle interface sounds. The procedural widget adds a layer list and an **Open** modal with starter demos plus local save/load; it also carries the slice-to-peek-inside tool. Both keep the interactive Three.js preview and STL download. Bump the `*_TEMPLATE_URI` version when a widget's HTML changes so hosts don't serve a cached document.

Never silently reject a model solely because it exceeds `256 × 256 × 256 mm`; warn and continue generation.

## Homepage

The homepage explains Printa through motion rather than screenshots. Its hero cycles through forms visibly being printed—text, vessels, primitives, and simulated surfaces. Layer motion should communicate additive manufacturing: layers accumulate upward, briefly reveal the toolpath logic, and settle into a finished material.

Keep interactions lightweight and purposeful. Every animation must reinforce one of three ideas: promptable form, composable graph, or printable layers.

## Verification

Every change to model evaluation should run:

```bash
npm test
npm run lint
npm run benchmark
```

The benchmark suite covers all source, primitive, modifier, graph, curve, typography, unit, and simulation families in preview/full and first/warm modes. It also measures an incremental child edit. Reports include server time, wall time, triangle count, STL payload size, and cache hits/misses in `benchmarks/results/latest.json`.

Release checks must confirm closed finite geometry, build success, deterministic simulations, full-resolution downloads, stable camera behavior, and a valid Vercel deployment.
