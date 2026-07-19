import * as opentype from "opentype.js";
import type { Font as OpenTypeFont } from "opentype.js";
import { BufferGeometry, ExtrudeGeometry, Shape, ShapePath } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type BevelSide = "both" | "top" | "bottom";
export type TextCase = "original" | "uppercase" | "lowercase" | "titlecase";
export type FontWeight = "regular" | "bold";

export const BUILD_VOLUME_WARNING_MM = 256;
const openTypeRuntime = (opentype as typeof opentype & { default?: typeof opentype }).default ?? opentype;

export type TextModelOptions = {
  text: string;
  font: string;
  widthMm?: number;
  sizeMm: number;
  depthMm: number;
  bevelMm: number;
  bevelSegments: number;
  curveSegments: number;
  extrudeSegments: number;
  bevelSide: BevelSide;
  smoothNormals: boolean;
  textCase: TextCase;
  fontWeight: FontWeight;
  italic: boolean;
  underline: boolean;
};

export type TextModelStats = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  triangles: number;
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function minimumNumber(value: number, min: number, fallback: number) {
  return Math.max(min, Number.isFinite(value) ? value : fallback);
}

function optionalPositiveNumber(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0.1, value);
}

export function fontId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "roboto";
}

export function normalizeTextModelOptions(input: Partial<TextModelOptions>): TextModelOptions {
  const textCase: TextCase = ["uppercase", "lowercase", "titlecase"].includes(input.textCase ?? "")
    ? input.textCase as TextCase
    : "original";
  const sourceText = (input.text ?? "HELLO").trim().slice(0, 24) || "HELLO";
  const text = textCase === "uppercase"
    ? sourceText.toLocaleUpperCase()
    : textCase === "lowercase"
      ? sourceText.toLocaleLowerCase()
      : textCase === "titlecase"
        ? sourceText.toLocaleLowerCase().replace(/(^|\s)\S/g, (value) => value.toLocaleUpperCase())
        : sourceText;
  const bevelSide = input.bevelSide === "top" || input.bevelSide === "bottom" ? input.bevelSide : "both";
  return {
    text,
    font: fontId(input.font ?? "roboto"),
    widthMm: optionalPositiveNumber(input.widthMm),
    sizeMm: minimumNumber(Number(input.sizeMm ?? 36), 0.1, 36),
    depthMm: minimumNumber(Number(input.depthMm ?? 4), 0.1, 4),
    bevelMm: minimumNumber(Number(input.bevelMm ?? 0.6), 0, 0.6),
    bevelSegments: Math.round(clampNumber(Number(input.bevelSegments ?? 3), 1, 12)),
    curveSegments: Math.round(clampNumber(Number(input.curveSegments ?? 10), 2, 24)),
    extrudeSegments: Math.round(clampNumber(Number(input.extrudeSegments ?? 1), 1, 64)),
    bevelSide,
    smoothNormals: input.smoothNormals ?? true,
    textCase,
    fontWeight: input.fontWeight === "bold" ? "bold" : "regular",
    italic: input.italic ?? false,
    underline: input.underline ?? false,
  };
}

export function parseOpenTypeFont(buffer: ArrayBuffer) {
  return openTypeRuntime.parse(buffer);
}

function createShapes(
  font: OpenTypeFont,
  text: string,
  size: number,
  style: { underline: boolean; syntheticItalic: boolean },
) {
  const source = font.getPath(text, 0, 0, size, { kerning: true });
  const target = new ShapePath();
  const slant = style.syntheticItalic ? Math.tan(Math.PI / 15) : 0;
  const point = (x = 0, y = 0) => ({ x: x + (-y * slant), y: -y });

  for (const command of source.commands) {
    if (command.type === "M") {
      const end = point(command.x, command.y);
      target.moveTo(end.x, end.y);
    } else if (command.type === "L") {
      const end = point(command.x, command.y);
      target.lineTo(end.x, end.y);
    }
    else if (command.type === "C") {
      const end = point(command.x, command.y);
      const first = point(command.x1, command.y1);
      const second = point(command.x2, command.y2);
      target.bezierCurveTo(
        first.x,
        first.y,
        second.x,
        second.y,
        end.x,
        end.y,
      );
    } else if (command.type === "Q") {
      const end = point(command.x, command.y);
      const control = point(command.x1, command.y1);
      target.quadraticCurveTo(control.x, control.y, end.x, end.y);
    } else if (command.type === "Z") {
      target.currentPath?.closePath();
    }
  }

  const shapes = target.toShapes(false);
  if (style.underline) {
    const bounds = source.getBoundingBox();
    const start = bounds.x1;
    const end = bounds.x2 + (style.syntheticItalic ? size * 0.2 : 0);
    const top = -size * 0.07;
    const bottom = -size * 0.13;
    const underline = new Shape();
    underline.moveTo(start, bottom);
    underline.lineTo(end, bottom);
    underline.lineTo(end, top);
    underline.lineTo(start, top);
    underline.closePath();
    shapes.push(underline);
  }
  return shapes;
}

export function createTextGeometry(
  font: OpenTypeFont,
  input: Partial<TextModelOptions>,
  renderStyle: { syntheticItalic?: boolean } = {},
) {
  const options = normalizeTextModelOptions(input);
  const bevel = Math.min(options.bevelMm, options.depthMm * 0.3, options.sizeMm * 0.08);
  const bevelFaces = options.bevelSide === "both" ? 2 : 1;
  const coreDepth = Math.max(1e-5, options.depthMm - bevel * bevelFaces);
  const extrude = (fontSize: number) => {
    const next = new ExtrudeGeometry(createShapes(font, options.text, fontSize, {
      underline: options.underline,
      syntheticItalic: Boolean(renderStyle.syntheticItalic),
    }), {
      depth: coreDepth,
      steps: options.extrudeSegments,
      curveSegments: options.curveSegments,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel * 0.72,
      bevelSegments: bevel > 0 ? options.bevelSegments : 1,
    });
    if (bevel > 0 && options.bevelSide !== "both") {
      const positions = next.getAttribute("position");
      for (let index = 0; index < positions.count; index += 1) {
        const z = positions.getZ(index);
        if (options.bevelSide === "top" && z < 0) positions.setZ(index, 0);
        if (options.bevelSide === "bottom" && z > coreDepth) positions.setZ(index, coreDepth);
      }
      positions.needsUpdate = true;
    }
    next.computeBoundingBox();
    return next;
  };

  // OpenType.js scales outlines from the font's unitsPerEm. Iterate against the
  // tessellated bounds so requested height remains exact across fonts, glyphs,
  // underlines, synthetic italics, and bevel configurations.
  let fontSize = options.sizeMm;
  let geometry: BufferGeometry = extrude(fontSize);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const bounds = geometry.boundingBox!;
    const measuredHeight = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 1e-8) break;
    const ratio = options.sizeMm / measuredHeight;
    if (Math.abs(1 - ratio) < 1e-5) break;
    fontSize *= ratio;
    geometry.dispose();
    geometry = extrude(fontSize);
  }

  geometry.computeBoundingBox();
  const measured = geometry.boundingBox!;
  const measuredWidth = measured.max.x - measured.min.x;
  const measuredHeight = measured.max.y - measured.min.y;
  geometry.scale(
    options.widthMm && measuredWidth > 1e-8 ? options.widthMm / measuredWidth : 1,
    measuredHeight > 1e-8 ? options.sizeMm / measuredHeight : 1,
    1,
  );

  geometry.deleteAttribute("normal");
  if (options.smoothNormals) geometry = mergeVertices(geometry, 1e-4);
  geometry.computeVertexNormals();

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds) {
    geometry.translate(
      -(bounds.min.x + bounds.max.x) / 2,
      -(bounds.min.y + bounds.max.y) / 2,
      -bounds.min.z,
    );
  }
  geometry.computeBoundingBox();
  return { geometry, options };
}

export function geometryStats(geometry: BufferGeometry): TextModelStats {
  const bounds = geometry.boundingBox;
  return {
    widthMm: bounds ? bounds.max.x - bounds.min.x : 0,
    heightMm: bounds ? bounds.max.y - bounds.min.y : 0,
    depthMm: bounds ? bounds.max.z - bounds.min.z : 0,
    triangles: Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3),
  };
}
