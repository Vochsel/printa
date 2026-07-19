# Printa Spec 1.0 reference

## Document

Every document has this shape:

```yaml
version: "1.0"
name: Human-readable model name
description: What the model is intended to be
units: mm # mm | cm | in
root: {}  # one model node
print:
  buildVolume: [256, 256, 256]
  autoCenter: true
  placeOnBed: true
  interiorStruts:
    enabled: false
    pattern: diamond # diamond | cross | radial
    spacing: 18
    diameter: 1.8
    boundaryInset: 3
    wallOverlap: 0.8
    radialSegments: 10
display:
  floor: true
  grid: true
  dimensions:
    visible: true
    width: true
    height: true # footprint height/depth on the floor plane
    offset: 9
    precision: 1
metadata:
  family: vase
```

The renderer converts final geometry to millimetres, centers it in X/Y, and places its lowest point at Z=0 when the print flags are enabled.

`print.interiorStruts` is export geometry, not slicer metadata. When enabled, Printa builds a deterministic lattice inside every revolved cavity and includes it in preview and STL. `spacing` controls lattice levels, `diameter` controls printable member size, `boundaryInset` keeps members away from the floor/ceiling or open rim, and `wallOverlap` anchors members into the shell. `radialSegments` trades roundness for mesh size. Other already-solid sources should use slicer infill; explicit interior struts currently target revolved shells where the cavity boundary is known exactly.

## Nodes

### Shape

```yaml
kind: shape
id: body
source: {}
modifiers: []
transform:
  translate: [0, 0, 0]
  rotate: [0, 0, 0] # degrees
  scale: 1          # scalar or [x, y, z]
material: pla-matte
```

Materials affect preview appearance, not STL geometry. Valid materials are `pla-orange`, `pla-matte`, `pla-silk`, `petg`, and `resin`.

### Assembly

```yaml
kind: assembly
id: complete-model
operation: merge
children: []
modifiers: [] # optional post-assembly deformation
```

Merge collects child triangle solids into one STL. Make child parts intersect when the slicer should treat them as one connected part.

### Repeat

```yaml
kind: repeat
id: ring-stack
count: 6
child: {}
modifiers: [] # optional post-repeat deformation
step:
  translate: [0, 0, 8]
  rotate: [0, 0, 12]
  scale: 0.98
```

The step transform is compounded by copy index. Repeat counts are limited to 32 and expanded graphs to 64 nodes.

## Sources

### Revolve

Create a hollow z-axis vessel by revolving `[radius, height]` control points.

```yaml
type: revolve
profile: [[28, 0], [40, 45], [30, 100], [25, 130]]
segments: 160
profileSegments: 100
wall: 2.2
bottomCap: true
bottomThickness: 3
topCap: false
topThickness: 2.4
interpolation: catmull-rom # linear | catmull-rom
axis: z # x | y | z
```

`wall` controls the side shell. `bottomCap: true` creates a solid base whose interior floor is raised by `bottomThickness`. `topCap: true` seals the form and lowers the interior ceiling by `topThickness`. With either cap disabled, that end remains open but receives a watertight annular rim. Ordinary vases normally use a solid bottom and open top; sculptures and enclosed forms can enable both caps.

### Extrude

Extrude one closed 2D path, optionally with hole paths. Commands are `move`, `line`, `quadratic`, `bezier`, and `close`.

```yaml
type: extrude
depth: 6
bevel: 0.8
bevelSegments: 4
curveSegments: 16
direction: [0, 0, 1]
path:
  commands:
    - { op: move, to: [0, 30] }
    - { op: line, to: [30, -20] }
    - { op: line, to: [-30, -20] }
    - { op: close }
  holes: []
```

### Primitive

Use `shape: box | cylinder | cone | sphere | torus`. Relevant fields include `width`, `depth`, `height`, `radius`, `radiusTop`, `radiusBottom`, `tube`, and `segments`.

### Text

```yaml
type: text
text: PRINTA
font: Space Grotesk
size: 36
depth: 4
bevel: 0.6
bevelSegments: 4
curveSegments: 12
bevelSide: both # both | top | bottom
smoothNormals: true
textCase: original # original | uppercase | lowercase | titlecase
weight: bold
italic: false
underline: false
```

`font` accepts any Google Fonts family. All typography and printable styling fields are part of the source, so the editor, MCP tool, preview, and STL generator use the same values.

## Display

`display` is non-geometric preview state stored with the model. `floor` and `grid` control the build plate. `display.dimensions` controls the floor-plane W/H arrows, labels, spacing, and numeric precision. These settings do not add triangles to the exported STL.

### Water

Run a deterministic damped heightfield wave simulation and close it into a printable solid.

```yaml
type: water
width: 110
depth: 90
base: 4
resolution: 64
steps: 36
damping: 0.989
drops:
  - { x: -20, y: 0, radius: 6, amplitude: 7 }
```

### Cloth

Run a deterministic Verlet sheet simulation with structural constraints.

```yaml
type: cloth
width: 110
depth: 110
thickness: 1.4
resolution: 30
steps: 110
startHeight: 45
gravity: 0.2
constraintIterations: 5
pins: corners # corners | top-edge | none
collider:
  type: sphere
  center: [0, 0, 4]
  radius: 27
```

## Modifiers

Modifiers run from first to last.

- `twist`: `angleDeg`, normalized `start`, normalized `end`.
- `taper`: radial scale `from`, `to`, and `easing: linear | smoothstep`.
- `radialWave`: `amplitude`, angular `count`, `phaseDeg`, and optional `axialTurns`.
- `axialWave`: radial `amplitude`, heightwise `cycles`, and `phaseDeg`.
- `bend`: `angleDeg` and XY `directionDeg`.
- `noise`: deterministic radial `amplitude`, feature `scale`, and integer `seed`.
- `smooth`: Laplacian `iterations` and `strength`. Apply sparingly because it changes dimensions.

## Limits

- Complete text specs: 80 KB through the HTTP API and 6 KB through the MCP tool.
- Expanded nodes: 64.
- Repeat count: 32.
- Revolve radial segments: 512.
- Water resolution: 160; water steps: 400.
- Cloth resolution: 80; cloth steps: 300.
