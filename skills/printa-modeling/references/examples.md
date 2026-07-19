# Printa Spec examples

## Fine spiral vase

```yaml
version: "1.0"
name: Fine spiral vase
description: A printable hollow vessel with eighteen helical ribs.
units: mm
root:
  kind: shape
  id: vessel
  source:
    type: revolve
    profile: [[31, 0], [39, 50], [36, 92], [27, 145]]
    segments: 192
    profileSegments: 110
    wall: 2.2
    interpolation: catmull-rom
  modifiers:
    - { type: radialWave, amplitude: 1.7, count: 18, phaseDeg: 0, axialTurns: 0 }
    - { type: twist, angleDeg: 220, start: 0, end: 1 }
  material: pla-matte
print: { buildVolume: [256, 256, 256], autoCenter: true, placeOnBed: true }
metadata: { family: vase }
```

## Three-lobe sculptural vase

Use a large three-count radial wave before twisting:

```yaml
modifiers:
  - { type: radialWave, amplitude: 7, count: 3, phaseDeg: 90, axialTurns: 0 }
  - { type: twist, angleDeg: 180, start: 0, end: 1 }
  - { type: taper, from: 1.04, to: 0.84, easing: smoothstep }
```

## Frozen water tile

```yaml
version: "1.0"
name: Interference ripple tile
description: Three wave fronts frozen into a printable relief.
units: mm
root:
  kind: shape
  id: water
  source:
    type: water
    width: 112
    depth: 88
    base: 4
    resolution: 64
    steps: 34
    damping: 0.989
    drops:
      - { x: -22, y: -8, radius: 6, amplitude: 7 }
      - { x: 20, y: 12, radius: 7, amplitude: -5.5 }
      - { x: 4, y: -24, radius: 5, amplitude: 4.5 }
  modifiers: []
  material: petg
print: { buildVolume: [256, 256, 256], autoCenter: true, placeOnBed: true }
metadata: { family: simulation, solver: damped-wave }
```
