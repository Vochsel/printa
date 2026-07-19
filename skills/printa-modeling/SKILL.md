---
name: printa-modeling
description: Create, revise, validate, preview, and export composable Printa Spec 1.0 JSON or YAML models through the Printa MCP server. Use for printable primitives, custom-curve extrusion, text, revolved profiles and vases, ordered deformation modifiers, assemblies, repeated forms, deterministic water surfaces, cloth drapes, editor previews, and STL output.
---

# Printa procedural modeling

Build a complete Printa Spec 1.0 document, call `create_procedural_model`, inspect the returned bounds and warnings, then refine the spec until it matches the request.

## Connect

Use the streamable HTTP MCP endpoint at `https://printa.vochsel.com/mcp`.

Read the machine schema at `https://printa.vochsel.com/api/model/schema` when exact field validation is needed. Read [the spec reference](https://printa.vochsel.com/skills/spec-reference) for field semantics and [the examples](https://printa.vochsel.com/skills/examples) for reusable patterns.

## Model workflow

1. Translate the request into one source node or a small graph of nodes.
2. Choose document units and keep every dimensional value in those units.
3. Create the base form with `primitive`, `extrude`, `revolve`, `text`, `water`, or `cloth`.
4. Apply modifiers in intentional order. Modifier order changes the result.
5. Use `assembly` to merge distinct parts or `repeat` to make transformed copies.
6. Keep the graph compact. Prefer modifiers and repeats over enumerating many nodes.
7. Call `create_procedural_model` with the complete JSON or YAML document.
8. Inspect dimensions, triangle count, volume estimate, and warnings.
9. Refine the profile, amplitude, twist, resolution, wall, base/cap thickness, or transforms as needed.
10. Return both the unified Printa editor link (`/editor`) and STL link.

## Choose a construction

- Use `revolve` for vases, vessels, knobs, bowls, columns, and any radial profile.
- Use `extrude` for badges, signs, trays, cutters, and custom 2D Bézier outlines.
- Use `primitive` for structural parts and assembly building blocks.
- Treat primitive `width`, `depth`, and `height` as exact outer bounds. For text, set `height` and `depth` for exact final dimensions and add `width` only when stretching or fitting to an exact width is intended.
- Use `text` for any Google-Font solid. Font, weight, case, italic, underline, bevel faces, smoothing, and curve resolution all belong in the source spec.
- Use `water` to freeze a deterministic damped-wave simulation into a solid tile.
- Use `cloth` to drape a thickened printable sheet over a spherical collider.
- Use `repeat` for radial-looking stacks, columns, ribs made from parts, and regular arrays.

## Shape vases

Represent the silhouette as `[radius, height]` profile points in a `revolve` source. Set `wall` to create a hollow printable shell, keep `bottomCap: true` with a suitable `bottomThickness` for a usable vessel, and enable `topCap` only for sealed forms. Then:

- Add `radialWave` for flutes or lobes.
- Add `twist` after `radialWave` to turn those ribs into helices.
- Add `taper` after the ribs when the whole upper section should narrow.
- Use three or four large lobes for sculptural twists; use 12–24 shallow lobes for fine fluting.
- Keep the smallest inside radius larger than the wall.
- Use a solid base at least as thick as the wall; 2.4–3.2 mm is a practical FDM default.
- Use `topThickness` when `topCap: true`; open vases should keep `topCap: false`.
- Enable `print.interiorStruts` when a revolved shell needs an explicit printable internal truss. Choose `diamond` for general stiffness, `cross` for a lighter horizontal brace system, or `radial` for spokes around a center mast.
- Start around 16–24 mm spacing and 1.6–2.4 mm diameter for common FDM work, then adjust for scale and nozzle size.

## Preserve printability

- Keep all dimensions positive and avoid zero-thickness parts.
- Use vessel walls of at least 1.2 mm for common FDM printers unless the user specifies another process.
- Keep repeated parts intersecting when they must print as one physical object.
- Treat `assembly: merge` as a shared STL containing its child solids; it does not perform a CAD boolean union.
- Check cloth output for steep overhangs and support requirements.
- Keep simulation resolution proportional to required physical detail; do not maximize it by default.
- Do not silently shrink forms that exceed the configured build volume. Return the warning and offer a revised spec.

## Write promptable specs

- Use descriptive node ids such as `outer-vessel`, `rim`, or `water-surface`.
- Add a concise document description and metadata family.
- Set `display.dimensions` when W/H floor gizmos should be visible in the editor handoff.
- Prefer 4–9 profile control points and smooth interpolation over dense profiles.
- Use one modifier per conceptual change.
- Return a complete document beginning with `version: "1.0"`; never return a fragment unless explicitly requested.
