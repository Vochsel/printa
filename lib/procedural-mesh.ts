import "server-only";
import { createHash } from "node:crypto";
import { Box3, BufferGeometry, Mesh, Vector3 } from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { createTextServerGeometry } from "@/lib/text-mesh";
import {
  applyModifiers,
  applyTransform,
  createSourceGeometryParts,
  mergeModelGeometries,
  repeatedTransform,
} from "@/lib/procedural-geometry";
import { unionClosedGeometryParts } from "@/lib/manifold-geometry";
import {
  parseModelDocument,
  type InteriorStrutsSpec,
  type ModelDocument,
  type ModelNode,
  type ModifierSpec,
} from "@/lib/model-spec";

export type ProceduralModelStats = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  triangles: number;
  volumeEstimateMm3: number;
};

export type ProceduralBuildOptions = { quality?: "full" | "preview" };

type GeometryCacheEntry = { geometry: BufferGeometry; bytes: number };
const geometryCache = new Map<string, GeometryCacheEntry>();
const geometryInflight = new Map<string, Promise<BufferGeometry>>();
const sourceInflight = new Map<string, Promise<BufferGeometry>>();
const GEOMETRY_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const GEOMETRY_CACHE_MAX_ENTRIES = 48;
let geometryCacheBytes = 0;
let geometryCacheHits = 0;
let geometryCacheMisses = 0;
let geometryCoalescedBuilds = 0;

function fingerprint(...parts: Array<string | undefined>) {
  const hash = createHash("sha256");
  parts.forEach((part) => hash.update(part ?? "").update("\0"));
  return hash.digest("base64url");
}

function nodeFingerprint(node: ModelNode, memo: WeakMap<object, string>): string {
  const known = memo.get(node);
  if (known) return known;
  let key: string;
  if (node.kind === "shape") key = fingerprint("shape", JSON.stringify(node));
  else if (node.kind === "assembly") {
    key = fingerprint("assembly", node.id, JSON.stringify(node.transform), JSON.stringify(node.modifiers), ...node.children.map((child) => nodeFingerprint(child, memo)));
  } else {
    key = fingerprint("repeat", node.id, String(node.count), JSON.stringify(node.step), JSON.stringify(node.transform), JSON.stringify(node.modifiers), nodeFingerprint(node.child, memo));
  }
  memo.set(node, key);
  return key;
}

function geometryByteLength(geometry: BufferGeometry) {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return bytes;
}

function cachedGeometry(key: string) {
  const cached = geometryCache.get(key);
  if (!cached) { geometryCacheMisses += 1; return null; }
  geometryCacheHits += 1;
  geometryCache.delete(key);
  geometryCache.set(key, cached);
  return cached.geometry.clone();
}

function cacheGeometry(key: string, geometry: BufferGeometry) {
  const bytes = geometryByteLength(geometry);
  if (bytes > GEOMETRY_CACHE_MAX_BYTES / 4) return;
  const previous = geometryCache.get(key);
  if (previous) {
    geometryCacheBytes -= previous.bytes;
    previous.geometry.dispose();
    geometryCache.delete(key);
  }
  geometryCache.set(key, { geometry: geometry.clone(), bytes });
  geometryCacheBytes += bytes;
  while (geometryCache.size > GEOMETRY_CACHE_MAX_ENTRIES || geometryCacheBytes > GEOMETRY_CACHE_MAX_BYTES) {
    const oldestKey = geometryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = geometryCache.get(oldestKey)!;
    geometryCacheBytes -= oldest.bytes;
    oldest.geometry.dispose();
    geometryCache.delete(oldestKey);
  }
}

export function proceduralCacheMetrics() {
  return { hits: geometryCacheHits, misses: geometryCacheMisses, coalesced: geometryCoalescedBuilds, entries: geometryCache.size, bytes: geometryCacheBytes };
}

function firstMaterial(node: ModelNode): "pla-orange" | "pla-matte" | "pla-silk" | "petg" | "resin" {
  if (node.kind === "shape") return node.material ?? "pla-orange";
  if (node.kind === "repeat") return firstMaterial(node.child);
  return firstMaterial(node.children[0]);
}

function hasRevolvedCavity(node: ModelNode): boolean {
  if (node.kind === "shape") return node.source.type === "revolve";
  if (node.kind === "repeat") return hasRevolvedCavity(node.child);
  return node.children.some(hasRevolvedCavity);
}

async function shapeGeometry(node: Extract<ModelNode, { kind: "shape" }>, interiorStruts: InteriorStrutsSpec) {
  const strutKey = node.source.type === "revolve" ? JSON.stringify(interiorStruts) : "";
  const sourceKey = `source:${fingerprint(JSON.stringify(node.source), strutKey)}`;
  let geometry = cachedGeometry(sourceKey);
  if (!geometry) {
    const inflight = sourceInflight.get(sourceKey);
    if (inflight) {
      geometryCoalescedBuilds += 1;
      geometry = (await inflight).clone();
    } else {
      const build = (async () => {
        if (node.source.type === "text") {
          const result = await createTextServerGeometry({
            text: node.source.text,
            font: node.source.font,
            widthMm: node.source.width,
            sizeMm: node.source.height ?? node.source.size,
            depthMm: node.source.depth,
            bevelMm: node.source.bevel,
            bevelSegments: node.source.bevelSegments,
            curveSegments: node.source.curveSegments,
            extrudeSegments: node.source.extrudeSegments,
            bevelSide: node.source.bevelSide,
            textCase: node.source.textCase,
            fontWeight: node.source.weight,
            italic: node.source.italic,
            underline: node.source.underline,
            smoothNormals: node.source.smoothNormals,
          });
          return result.geometry;
        }
        const parts = createSourceGeometryParts(node.source, { interiorStruts });
        if (parts.length === 1) return parts[0];
        try { return await unionClosedGeometryParts(parts); }
        finally { parts.forEach((part) => part.dispose()); }
      })();
      sourceInflight.set(sourceKey, build);
      try { geometry = await build; } finally { sourceInflight.delete(sourceKey); }
    }
  }
  if (!geometry) throw new Error("Could not evaluate shape source.");
  if (!geometryCache.has(sourceKey)) cacheGeometry(sourceKey, geometry);
  if (node.modifiers.length) {
    const modifierKey = `modifiers:${fingerprint(sourceKey, JSON.stringify(node.modifiers))}`;
    const modified = cachedGeometry(modifierKey);
    if (modified) { geometry.dispose(); geometry = modified; }
    else { geometry = applyModifiers(geometry, node.modifiers); cacheGeometry(modifierKey, geometry); }
  }
  applyTransform(geometry, node.transform);
  return geometry;
}

async function nodeGeometry(node: ModelNode, fingerprints: WeakMap<object, string>, interiorStruts: InteriorStrutsSpec): Promise<BufferGeometry> {
  const nodeKey = `node:${fingerprint(nodeFingerprint(node, fingerprints), JSON.stringify(interiorStruts))}`;
  const cached = cachedGeometry(nodeKey);
  if (cached) return cached;
  const inflight = geometryInflight.get(nodeKey);
  if (inflight) {
    geometryCoalescedBuilds += 1;
    return (await inflight).clone();
  }
  const build = (async () => {
    let result: BufferGeometry;
    if (node.kind === "shape") result = await shapeGeometry(node, interiorStruts);
    else if (node.kind === "assembly") {
      const children = await Promise.all(node.children.map((child) => nodeGeometry(child, fingerprints, interiorStruts)));
      const geometry = mergeModelGeometries(children);
      children.forEach((child) => {
        if (child !== geometry) child.dispose();
      });
      result = applyTransform(applyModifiers(geometry, node.modifiers), node.transform);
    } else {
      const source = await nodeGeometry(node.child, fingerprints, interiorStruts);
      const copies: BufferGeometry[] = [];
      for (let index = 0; index < node.count; index += 1) {
        const copy = source.clone();
        applyTransform(copy, repeatedTransform(node.step, index));
        copies.push(copy);
      }
      source.dispose();
      const geometry = mergeModelGeometries(copies);
      copies.forEach((copy) => {
        if (copy !== geometry) copy.dispose();
      });
      result = applyTransform(applyModifiers(geometry, node.modifiers), node.transform);
    }
    cacheGeometry(nodeKey, result);
    return result;
  })();
  geometryInflight.set(nodeKey, build);
  try { return await build; } finally { geometryInflight.delete(nodeKey); }
}

type Quality = "full" | "preview";

const clampRound = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(value)));

// Largest value of `field` among the enabled modifiers of a given type.
function activeModifierMax(modifiers: ModifierSpec[], type: ModifierSpec["type"], field: string) {
  let max = 0;
  for (const modifier of modifiers) {
    if (modifier.disabled || modifier.type !== type) continue;
    const value = (modifier as unknown as Record<string, number>)[field];
    if (typeof value === "number") max = Math.max(max, Math.abs(value));
  }
  return max;
}

// Auto radial (around-the-axis) resolution. The user's spec value is the base
// (preview keeps a speed cap); a radialWave adds enough segments to render its
// lobes smoothly (~12 per lobe at full, ~7 at preview), since modifiers only
// displace existing vertices. The user's value is a floor — never reduced.
function autoRadialSegments(userSegments: number, maxLobes: number, quality: Quality, ceiling: number, previewCap: number) {
  const lobeFull = maxLobes ? Math.ceil(maxLobes * 12) : 0;
  const full = clampRound(Math.max(userSegments, lobeFull), 24, ceiling);
  if (quality === "full") return full;
  const lobePreview = maxLobes ? Math.ceil(maxLobes * 7) : 0;
  return clampRound(Math.max(Math.min(userSegments, previewCap), lobePreview), 24, Math.min(full, previewCap + 64));
}

// Auto profile (along-the-height) resolution for revolved shells — boosted for
// an axialWave's cycles so ripples up the height stay smooth.
function autoProfileSegments(userSegments: number, maxCycles: number, quality: Quality) {
  const cycleFull = maxCycles ? Math.ceil(maxCycles * 16) : 0;
  const full = clampRound(Math.max(userSegments, cycleFull), 16, 256);
  if (quality === "full") return full;
  const cyclePreview = maxCycles ? Math.ceil(maxCycles * 10) : 0;
  return clampRound(Math.max(Math.min(userSegments, 72), cyclePreview), 16, Math.min(full, 130));
}

// Derive effective mesh resolution from model size and modifier detail. Curved
// sources (revolve, primitive) get an auto radial/profile count for both a
// lighter preview and a detailed full/export build; simulation and text/extrude
// sources keep the preview-speed caps.
function resolveNode(node: ModelNode, quality: Quality): ModelNode {
  const next = structuredClone(node);
  if (next.kind === "assembly") next.children = next.children.map((child) => resolveNode(child, quality));
  if (next.kind === "repeat") next.child = resolveNode(next.child, quality);
  if (next.kind !== "shape") return next;
  const source = next.source;
  const maxLobes = activeModifierMax(next.modifiers, "radialWave", "count");
  const maxCycles = activeModifierMax(next.modifiers, "axialWave", "cycles");
  if (source.type === "revolve") {
    source.segments = autoRadialSegments(source.segments, maxLobes, quality, 512, 96);
    source.profileSegments = autoProfileSegments(source.profileSegments, maxCycles, quality);
  } else if (source.type === "primitive") {
    if (source.shape !== "box") {
      source.segments = autoRadialSegments(source.segments, maxLobes, quality, 256, 64);
    }
  } else if (quality === "preview") {
    if (source.type === "text") {
      source.curveSegments = Math.min(source.curveSegments, 8);
      source.bevelSegments = Math.min(source.bevelSegments, 3);
      source.extrudeSegments = Math.min(source.extrudeSegments, 4);
    } else if (source.type === "extrude") {
      source.curveSegments = Math.min(source.curveSegments, 12);
      source.bevelSegments = Math.min(source.bevelSegments, 3);
    } else if (source.type === "water") {
      source.resolution = Math.min(source.resolution, 40);
      source.steps = Math.min(source.steps, 60);
    } else if (source.type === "cloth") {
      source.resolution = Math.min(source.resolution, 24);
      source.steps = Math.min(source.steps, 70);
      source.constraintIterations = Math.min(source.constraintIterations, 4);
    }
  }
  return next;
}

function unitScale(units: ModelDocument["units"]) {
  if (units === "cm") return 10;
  if (units === "in") return 25.4;
  return 1;
}

function finishGeometry(geometry: BufferGeometry, document: ModelDocument) {
  const scale = unitScale(document.units);
  if (scale !== 1) geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds) {
    const translation = new Vector3();
    if (document.print.autoCenter) {
      translation.x = -(bounds.min.x + bounds.max.x) / 2;
      translation.y = -(bounds.min.y + bounds.max.y) / 2;
    }
    if (document.print.placeOnBed) translation.z = -bounds.min.z;
    geometry.translate(translation.x, translation.y, translation.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  return geometry;
}

export async function createProceduralGeometry(input: string | unknown, options: ProceduralBuildOptions = {}) {
  const document = parseModelDocument(input);
  const quality: Quality = options.quality === "preview" ? "preview" : "full";
  const renderRoot = resolveNode(document.root, quality);
  const interiorStruts = structuredClone(document.print.interiorStruts);
  if (options.quality === "preview" && interiorStruts.enabled) {
    interiorStruts.spacing = Math.max(interiorStruts.spacing, 22);
    interiorStruts.radialSegments = Math.min(interiorStruts.radialSegments, 8);
  }
  const geometry = finishGeometry(await nodeGeometry(renderRoot, new WeakMap(), interiorStruts), document);
  return { document, geometry };
}

function signedVolume(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  let volume = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const a = index ? index.getX(offset) : offset;
    const b = index ? index.getX(offset + 1) : offset + 1;
    const c = index ? index.getX(offset + 2) : offset + 2;
    const ax = position.getX(a);
    const ay = position.getY(a);
    const az = position.getZ(a);
    const bx = position.getX(b);
    const by = position.getY(b);
    const bz = position.getZ(b);
    const cx = position.getX(c);
    const cy = position.getY(c);
    const cz = position.getZ(c);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return Math.abs(volume / 6);
}

export function proceduralGeometryStats(geometry: BufferGeometry, options: { includeVolume?: boolean } = {}): ProceduralModelStats {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new Box3();
  return {
    widthMm: bounds.max.x - bounds.min.x,
    depthMm: bounds.max.y - bounds.min.y,
    heightMm: bounds.max.z - bounds.min.z,
    triangles: Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3),
    volumeEstimateMm3: options.includeVolume === false ? 0 : signedVolume(geometry),
  };
}

export async function inspectProceduralModel(input: string | unknown) {
  const { document, geometry } = await createProceduralGeometry(input);
  const stats = proceduralGeometryStats(geometry);
  geometry.dispose();
  const exceedsBuildVolume = stats.widthMm > document.print.buildVolume[0]
    || stats.depthMm > document.print.buildVolume[1]
    || stats.heightMm > document.print.buildVolume[2];
  const warnings: string[] = [];
  if (exceedsBuildVolume) warnings.push(`Model exceeds the ${document.print.buildVolume.join(" × ")} mm reference build volume.`);
  if (document.root.kind === "shape" && document.root.source.type === "cloth") warnings.push("Cloth forms can contain steep overhangs; inspect support requirements in your slicer.");
  if (document.print.interiorStruts.enabled && !hasRevolvedCavity(document.root)) warnings.push("Interior struts currently require at least one revolved cavity source.");
  return { document, stats, materialPreset: firstMaterial(document.root), exceedsBuildVolume, warnings };
}

export async function createProceduralStl(input: string | unknown, options: ProceduralBuildOptions = {}) {
  const { document, geometry } = await createProceduralGeometry(input, options);
  const stats = proceduralGeometryStats(geometry, { includeVolume: options.quality !== "preview" });
  const mesh = new Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const view = new STLExporter().parse(mesh, { binary: true });
  const bytes = new Uint8Array(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  geometry.dispose();
  return { document, stats, bytes };
}

export function makeProceduralFilename(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `printa-${slug || "model"}.stl`;
}
