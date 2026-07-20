import "server-only";
import { createHash } from "node:crypto";
import { Box3, BufferGeometry, Vector3 } from "three";
import { createBinaryStl } from "@/lib/binary-stl";
import { createTextServerGeometry } from "@/lib/text-mesh";
import {
  applyModifiers,
  applyTransform,
  createSourceGeometryParts,
  mergeModelGeometries,
  repeatedTransform,
} from "@/lib/procedural-geometry";
import { unionClosedGeometryParts } from "@/lib/manifold-geometry";
import { buildSceneCollider } from "@/lib/scene-collider";
import type { SceneCollider } from "@/lib/fluid-sim";
import {
  parseModelDocument,
  type InteriorStrutsSpec,
  type ModelDocument,
  type ModelNode,
  type ModifierSpec,
  type SourceSpec,
} from "@/lib/model-spec";

export type ProceduralModelStats = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  triangles: number;
  volumeEstimateMm3: number;
};

export type ProceduralBuildOptions = { quality?: "full" | "preview" };

export type ProceduralBuildTimings = {
  geometryMs: number;
  statsMs: number;
  stlMs: number;
};

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

// Sources that are simulations — they collide with the rest of the scene and
// are excluded from the collider so they don't collide with themselves.
function isSimSource(type: SourceSpec["type"]) {
  return type === "water" || type === "fluid" || type === "cloth";
}

// Modifiers that run a scene-colliding simulation on the shape's own geometry.
function hasSimModifier(modifiers: ModifierSpec[]) {
  return modifiers.some((m) => m.type === "drape" || m.type === "melt");
}

// Whether a node itself is a simulation (sim source or a shape/group carrying a
// sim modifier) — such nodes collide with the scene and are pruned from it.
function nodeIsSim(node: ModelNode): boolean {
  if (node.kind === "shape") return isSimSource(node.source.type) || hasSimModifier(node.modifiers);
  return hasSimModifier(node.modifiers);
}

function subtreeHasSim(node: ModelNode): boolean {
  if (nodeIsSim(node)) return true;
  if (node.kind === "shape") return false;
  if (node.kind === "repeat") return subtreeHasSim(node.child);
  return node.children.some(subtreeHasSim);
}

// Returns the tree with all simulation nodes removed (empty groups pruned),
// used to build the solid collider the sims collide against.
function pruneSimShapes(node: ModelNode): ModelNode | null {
  if (nodeIsSim(node)) return null;
  if (node.kind === "shape") return node;
  if (node.kind === "repeat") { const child = pruneSimShapes(node.child); return child ? { ...node, child } : null; }
  const children = node.children.map(pruneSimShapes).filter((child): child is ModelNode => child !== null);
  return children.length ? { ...node, children } : null;
}

async function shapeGeometry(node: Extract<ModelNode, { kind: "shape" }>, interiorStruts: InteriorStrutsSpec, sceneCollider: SceneCollider | null, colliderFp: string) {
  const strutKey = node.source.type === "revolve" ? JSON.stringify(interiorStruts) : "";
  const collideKey = isSimSource(node.source.type) ? colliderFp : "";
  const sourceKey = `source:${fingerprint(JSON.stringify(node.source), strutKey, collideKey)}`;
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
        const parts = createSourceGeometryParts(node.source, { interiorStruts, sceneCollider });
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
    const modCollideKey = hasSimModifier(node.modifiers) ? colliderFp : "";
    const modifierKey = `modifiers:${fingerprint(sourceKey, JSON.stringify(node.modifiers), modCollideKey)}`;
    const modified = cachedGeometry(modifierKey);
    if (modified) { geometry.dispose(); geometry = modified; }
    else { geometry = applyModifiers(geometry, node.modifiers, sceneCollider); cacheGeometry(modifierKey, geometry); }
  }
  applyTransform(geometry, node.transform);
  return geometry;
}

async function nodeGeometry(node: ModelNode, fingerprints: WeakMap<object, string>, interiorStruts: InteriorStrutsSpec, sceneCollider: SceneCollider | null = null, colliderFp = ""): Promise<BufferGeometry> {
  // Fold the collider fingerprint into the key only for subtrees that simulate,
  // so a scene change re-bakes the sim without busting every other node's cache.
  const collideKey = subtreeHasSim(node) ? colliderFp : "";
  const nodeKey = `node:${fingerprint(nodeFingerprint(node, fingerprints), JSON.stringify(interiorStruts), collideKey)}`;
  const cached = cachedGeometry(nodeKey);
  if (cached) return cached;
  const inflight = geometryInflight.get(nodeKey);
  if (inflight) {
    geometryCoalescedBuilds += 1;
    return (await inflight).clone();
  }
  const build = (async () => {
    let result: BufferGeometry;
    if (node.kind === "shape") result = await shapeGeometry(node, interiorStruts, sceneCollider, colliderFp);
    else if (node.kind === "assembly") {
      const children = await Promise.all(node.children.map((child) => nodeGeometry(child, fingerprints, interiorStruts, sceneCollider, colliderFp)));
      const geometry = mergeModelGeometries(children);
      children.forEach((child) => {
        if (child !== geometry) child.dispose();
      });
      result = applyTransform(applyModifiers(geometry, node.modifiers, sceneCollider), node.transform);
    } else {
      const source = await nodeGeometry(node.child, fingerprints, interiorStruts, sceneCollider, colliderFp);
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
      result = applyTransform(applyModifiers(geometry, node.modifiers, sceneCollider), node.transform);
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
  // A drape/melt modifier bakes on command from the shape's own mesh, so the
  // preview must build the same geometry the download will — never a coarser one.
  if (hasSimModifier(next.modifiers)) quality = "full";
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
    }
    // cloth and fluid run on command, so they always bake at full quality —
    // the editor preview must match the downloaded STL.
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
  // Build a collider from the solid (non-sim) shapes so fluid and cloth can
  // collide with the rest of the scene.
  let sceneCollider: SceneCollider | null = null;
  let colliderGeometry: BufferGeometry | null = null;
  let colliderFp = "";
  if (subtreeHasSim(renderRoot)) {
    const solidRoot = pruneSimShapes(renderRoot);
    if (solidRoot) {
      colliderFp = fingerprint(JSON.stringify(solidRoot));
      colliderGeometry = await nodeGeometry(solidRoot, new WeakMap(), interiorStruts);
      sceneCollider = buildSceneCollider(colliderGeometry);
    }
  }
  const geometry = finishGeometry(await nodeGeometry(renderRoot, new WeakMap(), interiorStruts, sceneCollider, colliderFp), document);
  colliderGeometry?.dispose();
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
  const geometryStartedAt = performance.now();
  const { document, geometry } = await createProceduralGeometry(input, options);
  const geometryMs = performance.now() - geometryStartedAt;
  const statsStartedAt = performance.now();
  const stats = proceduralGeometryStats(geometry, { includeVolume: false });
  const statsMs = performance.now() - statsStartedAt;
  const stlStartedAt = performance.now();
  const encoded = createBinaryStl(geometry, { includeVolume: options.quality !== "preview" });
  stats.volumeEstimateMm3 = encoded.volumeEstimate;
  const bytes = encoded.bytes;
  const stlMs = performance.now() - stlStartedAt;
  geometry.dispose();
  return { document, stats, bytes, timings: { geometryMs, statsMs, stlMs } satisfies ProceduralBuildTimings };
}

export function makeProceduralFilename(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `printa-${slug || "model"}.stl`;
}
