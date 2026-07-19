# Printa design and product system

Printa is a promptable 3D-model compiler for printable forms. Its primary surfaces are the MCP tools, MCP UI, and `/editor`; the homepage explains the system through interactive printing studies. The product should feel like a precise workshop instrument with a playful material sensibility—not a generic CAD suite and not a conventional SaaS dashboard.

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

The editor occupies `100dvh`. Its top bar is fixed-height; the remaining workspace is a two-column grid.

- **Inspector:** independently scrollable, contains starting forms, the layer graph, selection-specific fields, print/display settings, and advanced JSON/YAML.
- **Stage:** fills all remaining space, keeps the renderer mounted, and contains model status, download, viewport, and mesh measurements.
- On narrow screens, simplify secondary status and advanced spec controls before reducing the model viewport.

Layer rows express hierarchy through indentation. A shape row names its source; modifier rows sit beneath the node they affect. Assemblies and repeats are visible graph concepts, not flattened UI conveniences.

Controls use the most direct representation:

- sliders paired with numeric entry for bounded continuous values;
- unit-aware millimeter/centimeter/inch values;
- switches for booleans;
- searchable, virtualized/scroll-complete Google Font picker with live family previews;
- selects for finite modes such as bevel side, material, primitive type, and case;
- compact JSON editors only for inherently structured arrays such as paths, profiles, drops, or colliders.

## 3D stage

The default view is close enough to read the model without fog interference. The stage includes:

- orbit, zoom, and explicit frame-model control;
- print-bed floor and optional grid;
- spec-driven footprint width and height/depth arrows;
- material presets using physically based Three.js materials;
- no continuous render loop while idle;
- preserved camera and controls across mesh, material, and display updates.

Width uses pink; footprint height/depth uses lavender. Labels sit outside the bounds and scale with the model while remaining readable.

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

IDs are editor identity; they do not alter geometry. Materials and display settings are presentation metadata and should not force a mesh rebuild. `print.interiorStruts` is geometric export state: it creates cross, diamond, or radial structural members inside known revolved cavities, so changing it must invalidate the affected graph cache. Members and node joints are fused to the shell with the Apache-2.0 Manifold WASM Boolean engine before modifiers and STL export; overlapping triangle soups are not an acceptable final result.

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

MCP tools accept the same schema used by the editor. Tool output should provide concise measurements, warnings, editor link, and STL link. The MCP UI mirrors the web controls with proper selects, sliders, unit handling, complete searchable font access, typography options, smoothing/bevel controls, material selection, build-volume warning, and an interactive preview.

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
