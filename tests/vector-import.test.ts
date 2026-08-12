import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { importVectorDocument, parsePdfDocument, parseSvgDocument } from "../lib/vector-import";
import {
  boundsSize,
  contourBounds,
  flattenContour,
  nestContours,
  shapeToSvgPath,
  signedArea,
  simplifyContour,
  transformContour,
  type ImportedShape,
} from "../lib/vector-shapes";
import { createSourceGeometry } from "../lib/procedural-geometry";
import { MAX_VECTOR_COMMANDS, parseModelDocument, validateModelDocument, type VectorContourSpec } from "../lib/model-spec";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 160 80">
  <defs><rect id="hidden" x="0" y="0" width="20" height="20"/></defs>
  <g transform="translate(10 10)">
    <path d="M0 0 H60 V60 H0 Z M10 10 V50 H50 V10 Z" fill="#000" fill-rule="evenodd"/>
  </g>
  <circle cx="120" cy="40" r="30" fill="#e2571e"/>
  <path d="M100 5 a5 5 0 015 5 l10 0 z" fill="none"/>
  <text x="10" y="70" font-size="12">not imported</text>
</svg>`;

function shapeById(shapes: ImportedShape[], index: number) {
  const shape = shapes[index];
  assert.ok(shape, `expected a shape at index ${index}`);
  return shape;
}

test("SVG import resolves real-world units, viewBox scaling, and the Y-up flip", () => {
  const document = parseSvgDocument(SVG, { name: "mark.svg" });
  assert.equal(document.kind, "svg");
  assert.equal(document.widthMm, 80);
  assert.equal(document.heightMm, 40);
  assert.equal(document.pageCount, 1);

  // A viewBox of 160x80 rendered at 80x40 mm halves every user unit, and the
  // 10,10 group translation lands the plate at 5..35 mm with Y pointing up.
  const plate = shapeById(document.shapes, 0);
  assert.deepEqual(boundsSize(plate.bounds), { width: 30, height: 30 });
  assert.equal(plate.bounds.minX, 5);
  assert.equal(plate.bounds.minY, 5);
  assert.equal(plate.contours.length, 2, "the counter is kept as its own contour");
  assert.equal(plate.fillRule, "evenodd");

  const circle = shapeById(document.shapes, 1);
  assert.equal(circle.kind, "circle");
  assert.deepEqual(boundsSize(circle.bounds), { width: 30, height: 30 });
});

test("SVG import skips defs and text, and flags stroke-only artwork", () => {
  const document = parseSvgDocument(SVG, { name: "mark.svg" });
  assert.ok(!document.shapes.some((shape) => shape.bounds.minX === 0 && shape.bounds.minY === 30), "content inside <defs> is not imported");
  assert.match(document.warnings.join(" "), /text was skipped/i);

  const outline = document.shapes.find((shape) => shape.strokeOnly);
  assert.ok(outline, "fill:none paths are imported but marked as outlines");
  assert.equal(outline.recommended, false, "outlines are not preselected when filled artwork exists");
  assert.ok(document.shapes.some((shape) => shape.recommended), "filled artwork stays preselected");
});

test("SVG arcs parse with compact flag notation", () => {
  // "a5 5 0 015 5" packs largeArc, sweep, and x into one token run.
  const document = parseSvgDocument(
    `<svg viewBox="0 0 100 100" width="100" height="100"><path d="M10 50 a20 20 0 0140 0 z"/></svg>`,
    { name: "arc.svg" },
  );
  const size = boundsSize(shapeById(document.shapes, 0).bounds);
  assert.ok(Math.abs(size.width - 40 * (25.4 / 96)) < 0.2, `arc spans its 40-unit chord, got ${size.width}`);
  assert.ok(size.height > 0.5, "the arc bulges rather than collapsing to its chord");
});

test("SVG shape primitives, transforms, and polygons all import", () => {
  const document = parseSvgDocument(
    `<svg viewBox="0 0 100 100" width="100mm" height="100mm">
       <rect x="10" y="10" width="20" height="10" rx="3"/>
       <ellipse cx="50" cy="50" rx="20" ry="10"/>
       <polygon points="70,70 90,70 80,90"/>
       <g transform="rotate(90 50 50)"><rect x="10" y="10" width="20" height="10"/></g>
     </svg>`,
    { name: "shapes.svg" },
  );
  assert.equal(document.shapes.length, 4);
  assert.deepEqual(boundsSize(shapeById(document.shapes, 0).bounds), { width: 20, height: 10 });
  assert.deepEqual(boundsSize(shapeById(document.shapes, 1).bounds), { width: 40, height: 20 });
  assert.deepEqual(boundsSize(shapeById(document.shapes, 2).bounds), { width: 20, height: 20 });
  // A 90-degree rotation swaps the rectangle's measured width and height.
  assert.deepEqual(boundsSize(shapeById(document.shapes, 3).bounds), { width: 10, height: 20 });
});

function buildPdf({ compress, pages = 1 }: { compress: boolean; pages?: number }) {
  const content = "0.5 0 0 0.5 0 0 cm\n100 100 m 300 100 l 300 400 l 100 400 l h f\n"
    + "200 500 m 250 600 350 600 400 500 c 400 700 l 200 700 l h f\n";
  const stream = compress ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const kids = Array.from({ length: pages }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} /MediaBox [0 0 595 842] >>`,
  ];
  for (let page = 0; page < pages; page += 1) {
    objects.push(`<< /Type /Page /Parent 2 0 R /Contents ${4 + page * 2} 0 R /Resources << >> >>`);
    objects.push(`<< /Length ${stream.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n@@STREAM@@\nendstream`);
  }
  const parts: Buffer[] = [Buffer.from("%PDF-1.7\n", "latin1")];
  objects.forEach((body, index) => {
    const [head, tail] = body.split("@@STREAM@@");
    parts.push(Buffer.from(`${index + 1} 0 obj\n${head}`, "latin1"));
    if (tail !== undefined) parts.push(stream, Buffer.from(tail, "latin1"));
    parts.push(Buffer.from("\nendobj\n", "latin1"));
  });
  parts.push(Buffer.from("trailer << /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}

test("PDF import reads page geometry from raw and Flate-compressed content streams", () => {
  for (const compress of [false, true]) {
    const document = parsePdfDocument(buildPdf({ compress }), { name: "art.pdf" });
    assert.equal(document.kind, "pdf");
    // A4 in points converts to millimetres once.
    assert.ok(Math.abs(document.widthMm - 209.9) < 0.1, `page width ${document.widthMm}`);
    assert.ok(Math.abs(document.heightMm - 297.04) < 0.1, `page height ${document.heightMm}`);
    assert.equal(document.shapes.length, 2, `two painted paths (compressed=${compress})`);

    // The `re`-free rectangle spans 200x300 user units under a 0.5 scale CTM.
    const size = boundsSize(shapeById(document.shapes, 0).bounds);
    assert.ok(Math.abs(size.width - 100 * (25.4 / 72)) < 0.01, `rect width ${size.width}`);
    assert.ok(Math.abs(size.height - 150 * (25.4 / 72)) < 0.01, `rect height ${size.height}`);
  }
});

test("PDF import selects pages and reports the page count", () => {
  const data = buildPdf({ compress: true, pages: 3 });
  assert.equal(parsePdfDocument(data, {}).pageCount, 3);
  assert.equal(parsePdfDocument(data, { page: 2 }).page, 2);
  // Out-of-range requests clamp instead of throwing.
  assert.equal(parsePdfDocument(data, { page: 99 }).page, 3);
});

test("format detection routes by content, and unreadable files fail with a clear message", () => {
  assert.equal(importVectorDocument(buildPdf({ compress: true }), { name: "mystery" }).kind, "pdf");
  assert.equal(importVectorDocument(new TextEncoder().encode(SVG), { name: "mystery" }).kind, "svg");
  assert.throws(() => importVectorDocument(new Uint8Array(), { name: "empty.svg" }), /empty/i);
  assert.throws(() => importVectorDocument(new TextEncoder().encode("hello"), { name: "notes.txt" }), /Unsupported file/);
  assert.throws(() => importVectorDocument(new TextEncoder().encode("<svg viewBox='0 0 10 10'></svg>"), { name: "blank.svg" }), /No extrudable outlines/);
});

test("contour nesting cuts holes under even-odd and keeps same-wound shapes solid under non-zero", () => {
  const square = (size: number, clockwise = false): VectorContourSpec => {
    const points: Array<[number, number]> = [[-size, -size], [size, -size], [size, size], [-size, size]];
    const ordered = clockwise ? [...points].reverse() : points;
    return [
      { op: "move", to: ordered[0] },
      ...ordered.slice(1).map((point) => ({ op: "line", to: point }) as const),
      { op: "close" },
    ];
  };

  const evenOdd = nestContours([square(20), square(10)], "evenodd");
  assert.equal(evenOdd.length, 1);
  assert.equal(evenOdd[0].holes.length, 1, "even-odd always cuts the nested contour");

  const sameWinding = nestContours([square(20), square(10)], "nonzero");
  assert.equal(sameWinding.length, 2, "non-zero keeps a same-wound nested contour solid");

  const opposite = nestContours([square(20), square(10, true)], "nonzero");
  assert.equal(opposite.length, 1);
  assert.equal(opposite[0].holes.length, 1, "non-zero cuts a reverse-wound nested contour");
});

test("imported artwork extrudes to exact outer bounds with its holes intact", () => {
  const outer: VectorContourSpec = [
    { op: "move", to: [0, 0] }, { op: "line", to: [40, 0] },
    { op: "line", to: [40, 20] }, { op: "line", to: [0, 20] }, { op: "close" },
  ];
  const hole: VectorContourSpec = [
    { op: "move", to: [10, 5] }, { op: "line", to: [30, 5] },
    { op: "line", to: [30, 15] }, { op: "line", to: [10, 15] }, { op: "close" },
  ];

  const solid = createSourceGeometry({
    type: "vector", contours: [outer], fillRule: "nonzero", width: 60, height: 24, depth: 6,
    bevel: 0.5, bevelSegments: 3, curveSegments: 12, origin: "center",
  });
  solid.computeBoundingBox();
  const solidBox = solid.boundingBox!;
  assert.ok(Math.abs(solidBox.max.x - solidBox.min.x - 60) < 1e-4, "exact outer width including bevel");
  assert.ok(Math.abs(solidBox.max.y - solidBox.min.y - 24) < 1e-4, "exact outer height including bevel");
  assert.ok(Math.abs(solidBox.max.z - solidBox.min.z - 6) < 1e-4, "exact outer depth including bevels");
  assert.ok(Math.abs(solidBox.min.z) < 1e-6, "the plate sits on z = 0");
  assert.ok(Math.abs(solidBox.min.x + solidBox.max.x) < 1e-6, "origin: center centers the outline");

  const withHole = createSourceGeometry({
    type: "vector", contours: [outer, hole], fillRule: "evenodd", width: 60, height: 24, depth: 6,
    bevel: 0.5, bevelSegments: 3, curveSegments: 12, origin: "center",
  });
  withHole.computeBoundingBox();
  const holeBox = withHole.boundingBox!;
  assert.ok(Math.abs(holeBox.max.x - holeBox.min.x - 60) < 1e-4, "a hole does not change outer bounds");
  const solidTriangles = Math.floor((solid.index?.count ?? solid.getAttribute("position").count) / 3);
  const holeTriangles = Math.floor((withHole.index?.count ?? withHole.getAttribute("position").count) / 3);
  assert.ok(holeTriangles > solidTriangles, "the cut adds wall topology");

  for (const geometry of [solid, withHole]) {
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      assert.ok(Number.isFinite(position.getX(index)) && Number.isFinite(position.getY(index)) && Number.isFinite(position.getZ(index)));
    }
  }
});

test("imported artwork keeps its natural size and placement when unconstrained", () => {
  const contour: VectorContourSpec = [
    { op: "move", to: [100, 200] }, { op: "line", to: [130, 200] },
    { op: "line", to: [130, 210] }, { op: "line", to: [100, 210] }, { op: "close" },
  ];
  const kept = createSourceGeometry({
    type: "vector", contours: [contour], fillRule: "nonzero", depth: 3,
    bevel: 0, bevelSegments: 3, curveSegments: 12, origin: "keep",
  });
  kept.computeBoundingBox();
  const box = kept.boundingBox!;
  assert.ok(Math.abs(box.min.x - 100) < 1e-6 && Math.abs(box.max.x - 130) < 1e-6, "origin: keep preserves page placement");
  assert.ok(Math.abs(box.max.y - box.min.y - 10) < 1e-6, "no width/height keeps the imported size");
});

test("simplification thins polyline runs while preserving curves and shape", () => {
  const dense: VectorContourSpec = [{ op: "move", to: [0, 0] }];
  for (let step = 1; step <= 80; step += 1) dense.push({ op: "line", to: [step * 0.5, step % 2 === 0 ? 0.001 : 0] });
  dense.push({ op: "bezier", control1: [40, 10], control2: [10, 10], to: [0, 0] }, { op: "close" });

  const simplified = simplifyContour(dense, 0.05);
  assert.ok(simplified.length < dense.length / 4, `dropped collinear points: ${dense.length} -> ${simplified.length}`);
  assert.equal(simplified.filter((command) => command.op === "bezier").length, 1, "curve commands survive untouched");
  const before = contourBounds(dense);
  const after = contourBounds(simplified);
  assert.ok(Math.abs(before.maxX - after.maxX) < 0.06 && Math.abs(before.maxY - after.maxY) < 0.06, "bounds are preserved");
});

test("contour helpers round-trip through transforms, areas, and SVG path output", () => {
  const contour: VectorContourSpec = [
    { op: "move", to: [0, 0] }, { op: "line", to: [10, 0] },
    { op: "quadratic", control: [10, 5], to: [10, 10] },
    { op: "bezier", control1: [5, 12], control2: [0, 12], to: [0, 0] }, { op: "close" },
  ];
  const moved = transformContour(contour, 2, 5, -3);
  const bounds = contourBounds(moved);
  assert.equal(bounds.minX, 5);
  assert.equal(bounds.minY, -3);
  assert.ok(signedArea(flattenContour(contour)) > 0, "counter-clockwise contours have positive area");
  assert.match(shapeToSvgPath({ contours: [contour] }), /^M0 0 L10 0 Q10 5 10 10 C5 12 0 12 0 0 Z$/);
});

test("imported documents validate, round-trip, and stay inside the curve-command budget", () => {
  const document = parseSvgDocument(SVG, { name: "mark.svg" });
  const plate = shapeById(document.shapes, 0);
  const spec = {
    version: "1.0" as const,
    name: "Imported mark",
    root: {
      kind: "shape" as const,
      id: "mark",
      source: {
        type: "vector" as const,
        contours: plate.contours,
        fillRule: plate.fillRule,
        width: 40,
        depth: 4,
        label: "mark.svg · path 1",
      },
      modifiers: [{ type: "twist" as const, angleDeg: 30 }],
    },
  };
  const validated = validateModelDocument(spec);
  assert.equal(validated.root.kind, "shape");
  const reparsed = parseModelDocument(JSON.stringify(validated));
  assert.deepEqual(reparsed, validated);

  const oversized = {
    ...spec,
    root: {
      ...spec.root,
      source: {
        ...spec.root.source,
        contours: Array.from({ length: 40 }, () => Array.from({ length: 1200 }, (_, index): VectorContourSpec[number] =>
          index === 0 ? { op: "move", to: [0, 0] } : { op: "line", to: [index, index] })),
      },
    },
  };
  assert.throws(() => validateModelDocument(oversized), new RegExp(`${MAX_VECTOR_COMMANDS.toLocaleString("en-US")}`));
});
