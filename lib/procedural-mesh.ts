import "server-only";
import { Box3, BufferGeometry, Mesh, Vector3 } from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { createTextServerGeometry } from "@/lib/text-mesh";
import {
  applyModifiers,
  applyTransform,
  createSourceGeometry,
  mergeModelGeometries,
  repeatedTransform,
} from "@/lib/procedural-geometry";
import {
  parseModelDocument,
  type ModelDocument,
  type ModelNode,
} from "@/lib/model-spec";

export type ProceduralModelStats = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  triangles: number;
  volumeEstimateMm3: number;
};

function firstMaterial(node: ModelNode): "pla-orange" | "pla-matte" | "pla-silk" | "petg" | "resin" {
  if (node.kind === "shape") return node.material ?? "pla-orange";
  if (node.kind === "repeat") return firstMaterial(node.child);
  return firstMaterial(node.children[0]);
}

async function shapeGeometry(node: Extract<ModelNode, { kind: "shape" }>) {
  let geometry: BufferGeometry;
  if (node.source.type === "text") {
    const result = await createTextServerGeometry({
      text: node.source.text,
      font: node.source.font,
      sizeMm: node.source.size,
      depthMm: node.source.depth,
      bevelMm: node.source.bevel,
      fontWeight: node.source.weight,
      italic: node.source.italic,
      smoothNormals: true,
    });
    geometry = result.geometry;
  } else {
    geometry = createSourceGeometry(node.source);
  }
  geometry = applyModifiers(geometry, node.modifiers);
  applyTransform(geometry, node.transform);
  return geometry;
}

async function nodeGeometry(node: ModelNode): Promise<BufferGeometry> {
  if (node.kind === "shape") return shapeGeometry(node);
  if (node.kind === "assembly") {
    const children = await Promise.all(node.children.map(nodeGeometry));
    const geometry = mergeModelGeometries(children);
    children.forEach((child) => {
      if (child !== geometry) child.dispose();
    });
    return applyTransform(applyModifiers(geometry, node.modifiers), node.transform);
  }
  const source = await nodeGeometry(node.child);
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
  return applyTransform(applyModifiers(geometry, node.modifiers), node.transform);
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

export async function createProceduralGeometry(input: string | unknown) {
  const document = parseModelDocument(input);
  const geometry = finishGeometry(await nodeGeometry(document.root), document);
  return { document, geometry };
}

function signedVolume(geometry: BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  let volume = 0;
  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const bx = position.getX(index + 1);
    const by = position.getY(index + 1);
    const bz = position.getZ(index + 1);
    const cx = position.getX(index + 2);
    const cy = position.getY(index + 2);
    const cz = position.getZ(index + 2);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  if (source !== geometry) source.dispose();
  return Math.abs(volume / 6);
}

export function proceduralGeometryStats(geometry: BufferGeometry): ProceduralModelStats {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new Box3();
  return {
    widthMm: bounds.max.x - bounds.min.x,
    depthMm: bounds.max.y - bounds.min.y,
    heightMm: bounds.max.z - bounds.min.z,
    triangles: Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3),
    volumeEstimateMm3: signedVolume(geometry),
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
  return { document, stats, materialPreset: firstMaterial(document.root), exceedsBuildVolume, warnings };
}

export async function createProceduralStl(input: string | unknown) {
  const { document, geometry } = await createProceduralGeometry(input);
  const stats = proceduralGeometryStats(geometry);
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
