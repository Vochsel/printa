import { inflateSync } from "node:zlib";
import type { CurveCommandSpec, VectorContourSpec } from "@/lib/model-spec";
import {
  boundsSize,
  contourBounds,
  emptyBounds,
  flattenContour,
  growBounds,
  isFiniteBounds,
  mergeBounds,
  roundContour,
  signedArea,
  simplifyContour,
  type Bounds,
  type ImportedDocument,
  type ImportedShape,
} from "@/lib/vector-shapes";

/*
 * SVG and PDF importers. Both read a file into the same normalized shape list:
 * closed contours in millimetres with Y pointing up, one shape per fill/stroke
 * in the artwork, so the editor and the geometry evaluator never have to care
 * which format the outlines came from.
 *
 * These are deliberately dependency-free readers for 2D outline data — not
 * renderers. Raster images, gradients, clipping, and PDF text are reported as
 * warnings rather than silently approximated.
 */

export type VectorImportOptions = {
  name?: string;
  /** 1-based page for multi-page PDFs. */
  page?: number;
  /** Simplification tolerance in millimetres; 0 keeps every point. */
  tolerance?: number;
};

const PX_TO_MM = 25.4 / 96;
const MAX_CONTOUR_COMMANDS = 4000;
const MAX_SHAPES = 512;
const COORDINATE_PRECISION = 4;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Result of applying `outer` after `inner` — SVG/PDF nesting order. */
function concat(outer: Matrix, inner: Matrix): Matrix {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
  ];
}

function apply(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

/*
 * Accumulates path construction into closed contours, applying the active
 * transform as points arrive so downstream code only ever sees final geometry.
 */
class ContourBuilder {
  private contours: VectorContourSpec[] = [];
  private current: CurveCommandSpec[] | null = null;
  private cursorX = 0;
  private cursorY = 0;
  private startX = 0;
  private startY = 0;

  constructor(public matrix: Matrix = IDENTITY) {}

  moveTo(x: number, y: number) {
    this.flush();
    this.current = [{ op: "move", to: apply(this.matrix, x, y) }];
    this.cursorX = x;
    this.cursorY = y;
    this.startX = x;
    this.startY = y;
  }

  lineTo(x: number, y: number) {
    if (!this.current) this.moveTo(x, y);
    else this.current.push({ op: "line", to: apply(this.matrix, x, y) });
    this.cursorX = x;
    this.cursorY = y;
  }

  quadraticTo(cx: number, cy: number, x: number, y: number) {
    if (!this.current) this.moveTo(this.cursorX, this.cursorY);
    this.current!.push({ op: "quadratic", control: apply(this.matrix, cx, cy), to: apply(this.matrix, x, y) });
    this.cursorX = x;
    this.cursorY = y;
  }

  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.current) this.moveTo(this.cursorX, this.cursorY);
    this.current!.push({
      op: "bezier",
      control1: apply(this.matrix, c1x, c1y),
      control2: apply(this.matrix, c2x, c2y),
      to: apply(this.matrix, x, y),
    });
    this.cursorX = x;
    this.cursorY = y;
  }

  close() {
    if (!this.current) return;
    this.current.push({ op: "close" });
    this.cursorX = this.startX;
    this.cursorY = this.startY;
    this.contours.push(this.current);
    this.current = null;
  }

  get position() {
    return { x: this.cursorX, y: this.cursorY, startX: this.startX, startY: this.startY };
  }

  get isEmpty() {
    return this.contours.length === 0 && !this.current;
  }

  private flush() {
    // Contours left open by the source are closed implicitly — an extrusion
    // needs a closed loop, and this matches how both formats fill open paths.
    if (this.current && this.current.length > 1) this.contours.push([...this.current, { op: "close" }]);
    this.current = null;
  }

  take(): VectorContourSpec[] {
    this.flush();
    const output = this.contours;
    this.contours = [];
    return output;
  }
}

/** Endpoint-parametrized elliptical arc converted to cubic segments. */
function arcToCubics(
  x1: number, y1: number, rx: number, ry: number, rotationDeg: number,
  largeArc: boolean, sweep: boolean, x2: number, y2: number,
): Array<[number, number, number, number, number, number]> {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);
  const lambda = (x1p * x1p) / (radiusX * radiusX) + (y1p * y1p) / (radiusY * radiusY);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    radiusX *= scale;
    radiusY *= scale;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const numerator = Math.max(0, radiusX * radiusX * radiusY * radiusY - radiusX * radiusX * y1p * y1p - radiusY * radiusY * x1p * x1p);
  const denominator = radiusX * radiusX * y1p * y1p + radiusY * radiusY * x1p * x1p;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxp = (coefficient * radiusX * y1p) / radiusY;
  const cyp = (-coefficient * radiusY * x1p) / radiusX;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const value = Math.acos(Math.min(1, Math.max(-1, dot)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };
  const startAngle = angle(1, 0, (x1p - cxp) / radiusX, (y1p - cyp) / radiusY);
  let deltaAngle = angle((x1p - cxp) / radiusX, (y1p - cyp) / radiusY, (-x1p - cxp) / radiusX, (-y1p - cyp) / radiusY);
  if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
  const step = deltaAngle / segments;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const output: Array<[number, number, number, number, number, number]> = [];
  let theta = startAngle;
  let currentX = x1;
  let currentY = y1;
  for (let index = 0; index < segments; index += 1) {
    const next = theta + step;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosNext = Math.cos(next);
    const sinNext = Math.sin(next);
    const endX = cos * radiusX * cosNext - sin * radiusY * sinNext + cx;
    const endY = sin * radiusX * cosNext + cos * radiusY * sinNext + cy;
    const derivativeStartX = -radiusX * sinTheta;
    const derivativeStartY = radiusY * cosTheta;
    const derivativeEndX = -radiusX * sinNext;
    const derivativeEndY = radiusY * cosNext;
    const control1X = currentX + alpha * (cos * derivativeStartX - sin * derivativeStartY);
    const control1Y = currentY + alpha * (sin * derivativeStartX + cos * derivativeStartY);
    const control2X = endX - alpha * (cos * derivativeEndX - sin * derivativeEndY);
    const control2Y = endY - alpha * (sin * derivativeEndX + cos * derivativeEndY);
    output.push([control1X, control1Y, control2X, control2Y, endX, endY]);
    currentX = endX;
    currentY = endY;
    theta = next;
  }
  return output;
}

const KAPPA = 0.5522847498307936;

function ellipseContour(builder: ContourBuilder, cx: number, cy: number, rx: number, ry: number) {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  builder.moveTo(cx + rx, cy);
  builder.cubicTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry);
  builder.cubicTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy);
  builder.cubicTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry);
  builder.cubicTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy);
  builder.close();
}

function roundedRectContour(builder: ContourBuilder, x: number, y: number, width: number, height: number, rx: number, ry: number) {
  if (rx <= 0 || ry <= 0) {
    builder.moveTo(x, y);
    builder.lineTo(x + width, y);
    builder.lineTo(x + width, y + height);
    builder.lineTo(x, y + height);
    builder.close();
    return;
  }
  const radiusX = Math.min(rx, width / 2);
  const radiusY = Math.min(ry, height / 2);
  const ox = radiusX * KAPPA;
  const oy = radiusY * KAPPA;
  builder.moveTo(x + radiusX, y);
  builder.lineTo(x + width - radiusX, y);
  builder.cubicTo(x + width - radiusX + ox, y, x + width, y + radiusY - oy, x + width, y + radiusY);
  builder.lineTo(x + width, y + height - radiusY);
  builder.cubicTo(x + width, y + height - radiusY + oy, x + width - radiusX + ox, y + height, x + width - radiusX, y + height);
  builder.lineTo(x + radiusX, y + height);
  builder.cubicTo(x + radiusX - ox, y + height, x, y + height - radiusY + oy, x, y + height - radiusY);
  builder.lineTo(x, y + radiusY);
  builder.cubicTo(x, y + radiusY - oy, x + radiusX - ox, y, x + radiusX, y);
  builder.close();
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

const NUMBER_PATTERN = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

function readNumbers(input: string) {
  return (input.match(NUMBER_PATTERN) ?? []).map(Number).filter((value) => Number.isFinite(value));
}

function parseLength(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const match = value.trim().match(/^([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)\s*([a-z%]*)$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  const unit = match[2].toLowerCase();
  if (unit === "mm") return amount;
  if (unit === "cm") return amount * 10;
  if (unit === "in") return amount * 25.4;
  if (unit === "pt") return amount * (25.4 / 72);
  if (unit === "pc") return amount * (25.4 / 6);
  if (unit === "q") return amount * 0.25;
  if (unit === "%") return fallback;
  return amount * PX_TO_MM;
}

function parseSvgTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let matrix = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const args = readNumbers(match[2]);
    let next: Matrix = IDENTITY;
    if (match[1] === "matrix" && args.length >= 6) next = [args[0], args[1], args[2], args[3], args[4], args[5]];
    else if (match[1] === "translate") next = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    else if (match[1] === "scale") next = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
    else if (match[1] === "rotate") {
      const radians = ((args[0] ?? 0) * Math.PI) / 180;
      const rotation: Matrix = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
      next = args.length >= 3
        ? concat(concat([1, 0, 0, 1, args[1], args[2]], rotation), [1, 0, 0, 1, -args[1], -args[2]])
        : rotation;
    } else if (match[1] === "skewX") next = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (match[1] === "skewY") next = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    matrix = concat(matrix, next);
  }
  return matrix;
}

function parseAttributes(raw: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
  const style = attributes.style;
  if (style) {
    for (const declaration of style.split(";")) {
      const [property, value] = declaration.split(":");
      if (property && value) attributes[property.trim().toLowerCase()] ||= value.trim();
    }
  }
  return attributes;
}

function parsePathData(builder: ContourBuilder, data: string) {
  const tokens = data.match(/[MmZzLlHhVvCcSsQqTtAa]|[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) ?? [];
  let index = 0;
  let command = "";
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommand = "";
  const number = () => Number(tokens[index++] ?? 0);
  // Arc flags may be written without separators ("a5 5 0 011 1"), so a flag
  // splits one character off the current token instead of consuming it whole.
  const flag = () => {
    const token = tokens[index] ?? "0";
    if (token.length > 1 && /^[01]\d/.test(token)) {
      tokens[index] = token.slice(1);
      return token[0] === "1";
    }
    index += 1;
    return token === "1";
  };
  while (index < tokens.length) {
    const guardIndex = index;
    const token = tokens[index];
    if (/[MmZzLlHhVvCcSsQqTtAa]/.test(token)) {
      command = token;
      index += 1;
    } else if (!command) {
      index += 1;
      continue;
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";

    const { x: cursorX, y: cursorY, startX, startY } = builder.position;
    const relative = command === command.toLowerCase();
    const baseX = relative ? cursorX : 0;
    const baseY = relative ? cursorY : 0;

    switch (command.toUpperCase()) {
      case "M": {
        builder.moveTo(baseX + number(), baseY + number());
        break;
      }
      case "L": {
        builder.lineTo(baseX + number(), baseY + number());
        break;
      }
      case "H": {
        builder.lineTo(baseX + number(), cursorY);
        break;
      }
      case "V": {
        builder.lineTo(cursorX, baseY + number());
        break;
      }
      case "C": {
        const c1x = baseX + number();
        const c1y = baseY + number();
        const c2x = baseX + number();
        const c2y = baseY + number();
        builder.cubicTo(c1x, c1y, c2x, c2y, baseX + number(), baseY + number());
        lastControlX = c2x;
        lastControlY = c2y;
        break;
      }
      case "S": {
        const smooth = /[CS]/.test(lastCommand.toUpperCase());
        const c1x = smooth ? 2 * cursorX - lastControlX : cursorX;
        const c1y = smooth ? 2 * cursorY - lastControlY : cursorY;
        const c2x = baseX + number();
        const c2y = baseY + number();
        builder.cubicTo(c1x, c1y, c2x, c2y, baseX + number(), baseY + number());
        lastControlX = c2x;
        lastControlY = c2y;
        break;
      }
      case "Q": {
        const cx = baseX + number();
        const cy = baseY + number();
        builder.quadraticTo(cx, cy, baseX + number(), baseY + number());
        lastControlX = cx;
        lastControlY = cy;
        break;
      }
      case "T": {
        const smooth = /[QT]/.test(lastCommand.toUpperCase());
        const cx = smooth ? 2 * cursorX - lastControlX : cursorX;
        const cy = smooth ? 2 * cursorY - lastControlY : cursorY;
        builder.quadraticTo(cx, cy, baseX + number(), baseY + number());
        lastControlX = cx;
        lastControlY = cy;
        break;
      }
      case "A": {
        const rx = number();
        const ry = number();
        const rotation = number();
        const largeArc = flag();
        const sweep = flag();
        const endX = baseX + number();
        const endY = baseY + number();
        for (const [c1x, c1y, c2x, c2y, x, y] of arcToCubics(cursorX, cursorY, rx, ry, rotation, largeArc, sweep, endX, endY)) {
          builder.cubicTo(c1x, c1y, c2x, c2y, x, y);
        }
        break;
      }
      case "Z": {
        builder.close();
        builder.moveTo(startX, startY);
        break;
      }
      default:
        index += 1;
    }
    lastCommand = command;
    // Malformed data must never leave the cursor parked on the same token.
    if (index === guardIndex) index += 1;
  }
}

const SKIPPED_CONTAINERS = new Set(["defs", "clippath", "mask", "symbol", "marker", "pattern", "style", "script", "text", "textpath", "tspan", "filter"]);

export function parseSvgDocument(text: string, options: VectorImportOptions = {}): ImportedDocument {
  const warnings: string[] = [];
  const source = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");

  const rootMatch = source.match(/<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i);
  if (!rootMatch) throw new Error("This file does not contain an <svg> element.");
  const rootAttributes = parseAttributes(rootMatch[1]);
  const viewBox = readNumbers(rootAttributes.viewbox ?? "");
  const hasViewBox = viewBox.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0;
  const [viewX, viewY, viewWidth, viewHeight] = hasViewBox ? viewBox : [0, 0, 0, 0];

  // Resolve one user unit to millimetres. An explicit width/height wins; the
  // viewBox alone falls back to the CSS pixel definition.
  let scaleX: number;
  let scaleY: number;
  let widthMm: number;
  let heightMm: number;
  if (hasViewBox) {
    widthMm = parseLength(rootAttributes.width, viewWidth * PX_TO_MM);
    heightMm = parseLength(rootAttributes.height, viewHeight * PX_TO_MM);
    scaleX = widthMm / viewWidth;
    scaleY = heightMm / viewHeight;
  } else {
    widthMm = parseLength(rootAttributes.width, 100);
    heightMm = parseLength(rootAttributes.height, 100);
    scaleX = PX_TO_MM;
    scaleY = PX_TO_MM;
    warnings.push("The SVG has no viewBox; it was measured with its width and height attributes.");
  }
  // SVG is Y-down and model space is Y-up, so the root matrix flips Y once.
  const rootMatrix: Matrix = hasViewBox
    ? [scaleX, 0, 0, -scaleY, -viewX * scaleX, (viewHeight + viewY) * scaleY]
    : [scaleX, 0, 0, -scaleY, 0, heightMm];

  const shapes: RawShape[] = [];
  // Only container elements push a transform, and a closing tag pops just the
  // group it opened — otherwise </path> would unwind its parent's transform.
  const groups: Array<{ name: string; matrix: Matrix }> = [{ name: "", matrix: rootMatrix }];
  let skipDepth = 0;
  let warnedText = false;
  let warnedImage = false;
  let warnedUse = false;

  const tagPattern = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(source))) {
    const closing = tag[1] === "/";
    const name = tag[2].toLowerCase().replace(/^svg:/, "");
    const selfClosing = tag[4] === "/";

    if (closing) {
      if (SKIPPED_CONTAINERS.has(name) && skipDepth > 0) skipDepth -= 1;
      else if (skipDepth === 0 && groups.length > 1 && groups.at(-1)!.name === name) groups.pop();
      continue;
    }
    if (skipDepth > 0) {
      if (SKIPPED_CONTAINERS.has(name) && !selfClosing) skipDepth += 1;
      continue;
    }
    if (SKIPPED_CONTAINERS.has(name)) {
      if (name === "text" || name === "tspan" || name === "textpath") {
        if (!warnedText) warnings.push("SVG text was skipped. Convert text to outlines before exporting to import it.");
        warnedText = true;
      }
      if (!selfClosing) skipDepth += 1;
      continue;
    }

    const attributes = parseAttributes(tag[3]);
    const matrix = concat(groups.at(-1)!.matrix, parseSvgTransform(attributes.transform));

    if (name === "svg" || name === "g" || name === "a" || name === "switch") {
      if (!selfClosing) groups.push({ name, matrix });
      continue;
    }
    if (name === "image") {
      if (!warnedImage) warnings.push("Raster images inside the SVG were skipped; only vector outlines can be extruded.");
      warnedImage = true;
      continue;
    }
    if (name === "use") {
      if (!warnedUse) warnings.push("<use> references were skipped; flatten or expand them before exporting.");
      warnedUse = true;
      continue;
    }

    const builder = new ContourBuilder(matrix);
    if (name === "path") parsePathData(builder, attributes.d ?? "");
    else if (name === "rect") {
      const width = Number(attributes.width ?? 0);
      const height = Number(attributes.height ?? 0);
      if (!(width > 0 && height > 0)) continue;
      const rx = Number(attributes.rx ?? attributes.ry ?? 0) || 0;
      const ry = Number(attributes.ry ?? attributes.rx ?? 0) || 0;
      roundedRectContour(builder, Number(attributes.x ?? 0), Number(attributes.y ?? 0), width, height, rx, ry);
    } else if (name === "circle") {
      const radius = Number(attributes.r ?? 0);
      if (!(radius > 0)) continue;
      ellipseContour(builder, Number(attributes.cx ?? 0), Number(attributes.cy ?? 0), radius, radius);
    } else if (name === "ellipse") {
      const rx = Number(attributes.rx ?? 0);
      const ry = Number(attributes.ry ?? 0);
      if (!(rx > 0 && ry > 0)) continue;
      ellipseContour(builder, Number(attributes.cx ?? 0), Number(attributes.cy ?? 0), rx, ry);
    } else if (name === "line") {
      builder.moveTo(Number(attributes.x1 ?? 0), Number(attributes.y1 ?? 0));
      builder.lineTo(Number(attributes.x2 ?? 0), Number(attributes.y2 ?? 0));
    } else if (name === "polygon" || name === "polyline") {
      const points = readNumbers(attributes.points ?? "");
      if (points.length < 4) continue;
      builder.moveTo(points[0], points[1]);
      for (let index = 2; index + 1 < points.length; index += 2) builder.lineTo(points[index], points[index + 1]);
      builder.close();
    } else continue;

    if (builder.isEmpty) continue;
    const fill = (attributes.fill ?? "").trim().toLowerCase();
    const strokeOnly = fill === "none" || (name === "line" || name === "polyline") && !attributes.fill;
    shapes.push({
      kind: name,
      contours: builder.take(),
      fillRule: (attributes["fill-rule"] ?? "").toLowerCase() === "evenodd" ? "evenodd" : "nonzero",
      strokeOnly,
    });
  }

  return finalizeDocument({
    kind: "svg",
    name: options.name ?? "artwork.svg",
    widthMm,
    heightMm,
    pageCount: 1,
    page: 1,
    shapes,
    warnings,
  }, options);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

type PdfObject = { id: number; body: string; stream?: Uint8Array };

function pngPredictor(data: Uint8Array, colors: number, bitsPerComponent: number, columns: number) {
  const bytesPerPixel = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  const rows = Math.floor(data.length / (rowLength + 1));
  const output = new Uint8Array(rows * rowLength);
  let previous = new Uint8Array(rowLength);
  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * (rowLength + 1)];
    const line = data.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
    const current = new Uint8Array(rowLength);
    for (let index = 0; index < rowLength; index += 1) {
      const raw = line[index] ?? 0;
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const up = previous[index];
      const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      current[index] = value & 0xff;
    }
    output.set(current, row * rowLength);
    previous = current;
  }
  return output;
}

function decodeStream(body: string, raw: Uint8Array) {
  const filter = body.match(/\/Filter\s*(\/\w+|\[[^\]]*\])/)?.[1] ?? "";
  if (!/Fl(?:ateDecode)?\b/.test(filter)) {
    if (/\/\w+/.test(filter) && !/^\s*\[\s*\]\s*$/.test(filter)) return null;
    return raw;
  }
  let data: Uint8Array;
  try {
    data = new Uint8Array(inflateSync(Buffer.from(raw)));
  } catch {
    try {
      data = new Uint8Array(inflateSync(Buffer.from(raw), { finishFlush: 2 /* Z_SYNC_FLUSH */ }));
    } catch {
      return null;
    }
  }
  const predictor = Number(body.match(/\/Predictor\s+(\d+)/)?.[1] ?? 1);
  if (predictor >= 10) {
    const colors = Number(body.match(/\/Colors\s+(\d+)/)?.[1] ?? 1);
    const bits = Number(body.match(/\/BitsPerComponent\s+(\d+)/)?.[1] ?? 8);
    const columns = Number(body.match(/\/Columns\s+(\d+)/)?.[1] ?? 1);
    return pngPredictor(data, colors, bits, columns);
  }
  return data;
}

function collectPdfObjects(bytes: Uint8Array) {
  const latin1 = Buffer.from(bytes).toString("latin1");
  const objects = new Map<number, PdfObject>();
  const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(latin1))) {
    const id = Number(match[1]);
    const start = match.index + match[0].length;
    const end = latin1.indexOf("endobj", start);
    const body = latin1.slice(start, end < 0 ? latin1.length : end);
    const streamIndex = body.search(/\bstream\r?\n?/);
    let stream: Uint8Array | undefined;
    if (streamIndex >= 0) {
      const header = body.match(/\bstream(\r\n|\n|\r)/);
      if (header) {
        const dataStart = start + body.indexOf(header[0]) + header[0].length;
        const declaredLength = Number(body.slice(0, streamIndex).match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] ?? NaN);
        const terminator = latin1.indexOf("endstream", dataStart);
        const dataEnd = Number.isFinite(declaredLength) && declaredLength > 0 && dataStart + declaredLength <= latin1.length
          ? dataStart + declaredLength
          : terminator < 0 ? latin1.length : terminator;
        stream = bytes.subarray(dataStart, dataEnd);
      }
    }
    objects.set(id, { id, body: streamIndex >= 0 ? body.slice(0, streamIndex) : body, stream });
    if (end >= 0) pattern.lastIndex = end;
  }

  // Modern PDFs pack page and resource dictionaries into compressed object
  // streams, so expand those before anything looks for pages.
  for (const object of [...objects.values()]) {
    if (!object.stream || !/\/Type\s*\/ObjStm/.test(object.body)) continue;
    const decoded = decodeStream(object.body, object.stream);
    if (!decoded) continue;
    const text = Buffer.from(decoded).toString("latin1");
    const count = Number(object.body.match(/\/N\s+(\d+)/)?.[1] ?? 0);
    const first = Number(object.body.match(/\/First\s+(\d+)/)?.[1] ?? 0);
    const header = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let index = 0; index < count; index += 1) {
      const id = header[index * 2];
      const offset = header[index * 2 + 1];
      if (!Number.isFinite(id) || !Number.isFinite(offset)) continue;
      const nextOffset = index + 1 < count ? header[index * 2 + 3] : text.length - first;
      const body = text.slice(first + offset, first + (Number.isFinite(nextOffset) ? nextOffset : text.length));
      if (!objects.has(id)) objects.set(id, { id, body });
    }
  }
  return objects;
}

function resolveReference(objects: Map<number, PdfObject>, value: string | undefined) {
  const reference = value?.match(/(\d+)\s+\d+\s+R/);
  return reference ? objects.get(Number(reference[1])) : undefined;
}

function inheritedValue(objects: Map<number, PdfObject>, page: PdfObject, key: string, depth = 0): string | undefined {
  const direct = page.body.match(new RegExp(`${key}\\s*(\\[[^\\]]*\\]|\\/[\\w.-]+|[\\d.+-]+)`))?.[1];
  if (direct) return direct;
  if (depth > 8) return undefined;
  const parent = resolveReference(objects, page.body.match(/\/Parent\s+(\d+\s+\d+\s+R)/)?.[1]);
  return parent ? inheritedValue(objects, parent, key, depth + 1) : undefined;
}

type RawShape = {
  kind: string;
  contours: VectorContourSpec[];
  fillRule: "nonzero" | "evenodd";
  strokeOnly: boolean;
};

/** Resolve `/Name Do` through the resource dictionary, inline or referenced. */
function findXObject(objects: Map<number, PdfObject>, resources: PdfObject | undefined, name: string) {
  if (!resources) return undefined;
  const referenced = resolveReference(objects, resources.body.match(/\/XObject\s+(\d+\s+\d+\s+R)/)?.[1]);
  const inline = resources.body.match(/\/XObject\s*<<([\s\S]*?)>>/)?.[1];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lookup = new RegExp(`/${escaped}\\s+(\\d+)\\s+\\d+\\s+R`);
  const id = referenced?.body.match(lookup)?.[1] ?? inline?.match(lookup)?.[1];
  return id ? objects.get(Number(id)) : undefined;
}

/** Content-stream tokens: numbers, names, and operators; everything else is opaque. */
function tokenizeContent(content: string) {
  const tokens: string[] = [];
  let index = 0;
  while (index < content.length) {
    const character = content[index];
    if (character === undefined) break;
    if (/\s/.test(character)) { index += 1; continue; }
    if (character === "%") {
      while (index < content.length && content[index] !== "\n") index += 1;
      continue;
    }
    if (character === "(") {
      let depth = 1;
      index += 1;
      while (index < content.length && depth > 0) {
        if (content[index] === "\\") index += 1;
        else if (content[index] === "(") depth += 1;
        else if (content[index] === ")") depth -= 1;
        index += 1;
      }
      tokens.push("(string)");
      continue;
    }
    if (content.startsWith("<<", index) || content.startsWith(">>", index)) {
      tokens.push(content.slice(index, index + 2));
      index += 2;
      continue;
    }
    if (character === "<") {
      const end = content.indexOf(">", index);
      index = end < 0 ? content.length : end + 1;
      tokens.push("(hex)");
      continue;
    }
    if (character === "[" || character === "]" || character === "{" || character === "}") {
      tokens.push(character);
      index += 1;
      continue;
    }
    let end = index;
    while (end < content.length && !/[\s()<>[\]{}/%]/.test(content[end])) end += 1;
    if (character === "/") {
      end = index + 1;
      while (end < content.length && !/[\s()<>[\]{}/%]/.test(content[end])) end += 1;
    }
    if (end === index) end = index + 1;
    tokens.push(content.slice(index, end));
    index = end;
  }
  return tokens;
}

function parseContentStream(
  content: string,
  baseMatrix: Matrix,
  objects: Map<number, PdfObject>,
  resources: PdfObject | undefined,
  shapes: RawShape[],
  warnings: Set<string>,
  depth = 0,
) {
  const tokens = tokenizeContent(content);
  const stack: Matrix[] = [];
  let matrix = baseMatrix;
  let builder = new ContourBuilder(matrix);
  const operands: string[] = [];
  const number = (offset: number) => {
    const value = Number(operands[operands.length - offset]);
    return Number.isFinite(value) ? value : 0;
  };
  const emit = (fillRule: "nonzero" | "evenodd", strokeOnly: boolean) => {
    const contours = builder.take();
    if (contours.length) shapes.push({ kind: strokeOnly ? "stroke" : "fill", contours, fillRule, strokeOnly });
    builder = new ContourBuilder(matrix);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (/^[+-]?(?:\d*\.\d+|\d+\.?)$/.test(token) || token.startsWith("/") || token === "[" || token === "]" || token === "<<" || token === ">>" || token === "(string)" || token === "(hex)") {
      operands.push(token);
      continue;
    }
    switch (token) {
      case "q":
        stack.push(matrix);
        break;
      case "Q":
        matrix = stack.pop() ?? baseMatrix;
        builder.matrix = matrix;
        break;
      case "cm": {
        matrix = concat(matrix, [number(6), number(5), number(4), number(3), number(2), number(1)]);
        builder.matrix = matrix;
        break;
      }
      case "m":
        builder.moveTo(number(2), number(1));
        break;
      case "l":
        builder.lineTo(number(2), number(1));
        break;
      case "c":
        builder.cubicTo(number(6), number(5), number(4), number(3), number(2), number(1));
        break;
      case "v": {
        const { x, y } = builder.position;
        builder.cubicTo(x, y, number(4), number(3), number(2), number(1));
        break;
      }
      case "y": {
        const endX = number(2);
        const endY = number(1);
        builder.cubicTo(number(4), number(3), endX, endY, endX, endY);
        break;
      }
      case "h":
        builder.close();
        break;
      case "re": {
        const x = number(4);
        const y = number(3);
        const width = number(2);
        const height = number(1);
        builder.moveTo(x, y);
        builder.lineTo(x + width, y);
        builder.lineTo(x + width, y + height);
        builder.lineTo(x, y + height);
        builder.close();
        break;
      }
      case "f": case "F": case "b": case "B":
        emit("nonzero", false);
        break;
      case "f*": case "b*": case "B*":
        emit("evenodd", false);
        break;
      case "S": case "s":
        emit("nonzero", true);
        break;
      case "n":
        builder.take();
        break;
      case "BT": {
        warnings.add("PDF text was skipped. Convert text to outlines before exporting to import it.");
        while (index < tokens.length && tokens[index] !== "ET") index += 1;
        break;
      }
      case "BI": {
        warnings.add("Raster images in the PDF were skipped; only vector outlines can be extruded.");
        while (index < tokens.length && tokens[index] !== "EI") index += 1;
        break;
      }
      case "Do": {
        // Illustrator and friends nest most artwork in form XObjects, so a
        // vector import that ignored them would come back nearly empty.
        const name = operands.at(-1) ?? "";
        const form = name.startsWith("/") ? findXObject(objects, resources, name.slice(1)) : undefined;
        if (!form) break;
        if (!form.stream || !/\/Subtype\s*\/Form/.test(form.body)) {
          warnings.add("Raster images in the PDF were skipped; only vector outlines can be extruded.");
          break;
        }
        if (depth >= 6) break;
        const decoded = decodeStream(form.body, form.stream);
        if (!decoded) break;
        const formMatrix = readNumbers(form.body.match(/\/Matrix\s*\[([^\]]*)\]/)?.[1] ?? "");
        const nested = formMatrix.length >= 6
          ? concat(matrix, [formMatrix[0], formMatrix[1], formMatrix[2], formMatrix[3], formMatrix[4], formMatrix[5]] as Matrix)
          : matrix;
        const formResources = resolveReference(objects, form.body.match(/\/Resources\s+(\d+\s+\d+\s+R)/)?.[1]) ?? form;
        parseContentStream(Buffer.from(decoded).toString("latin1"), nested, objects, formResources, shapes, warnings, depth + 1);
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
  const trailing = builder.take();
  if (trailing.length) shapes.push({ kind: "fill", contours: trailing, fillRule: "nonzero", strokeOnly: false });
}

export function parsePdfDocument(bytes: Uint8Array, options: VectorImportOptions = {}): ImportedDocument {
  const objects = collectPdfObjects(bytes);
  const pages = [...objects.values()].filter((object) => /\/Type\s*\/Page(?![a-zA-Z])/.test(object.body));
  if (!pages.length) throw new Error("No readable page was found in this PDF. Encrypted or scanned PDFs cannot be imported.");
  const pageIndex = Math.min(Math.max(1, Math.round(options.page ?? 1)), pages.length) - 1;
  const page = pages[pageIndex];

  const mediaBox = readNumbers(inheritedValue(objects, page, "/MediaBox") ?? "");
  const box = mediaBox.length >= 4 ? mediaBox : [0, 0, 595.276, 841.89];
  const pageWidth = Math.abs(box[2] - box[0]);
  const pageHeight = Math.abs(box[3] - box[1]);
  const scale = 25.4 / 72;
  // PDF user space is already Y-up; only the MediaBox origin and the
  // point-to-millimetre scale need normalizing.
  const baseMatrix: Matrix = [scale, 0, 0, scale, -Math.min(box[0], box[2]) * scale, -Math.min(box[1], box[3]) * scale];

  const contentReference = page.body.match(/\/Contents\s+(\d+\s+\d+\s+R|\[[^\]]*\])/)?.[1] ?? "";
  const contentIds = [...contentReference.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => Number(match[1]));
  const warnings = new Set<string>();
  const chunks: string[] = [];
  for (const id of contentIds) {
    const object = objects.get(id);
    if (!object?.stream) continue;
    const decoded = decodeStream(object.body, object.stream);
    if (!decoded) {
      warnings.add("Part of the page uses a compression filter Printa cannot read and was skipped.");
      continue;
    }
    chunks.push(Buffer.from(decoded).toString("latin1"));
  }
  if (!chunks.length) throw new Error("The PDF page has no readable content stream. Encrypted PDFs cannot be imported.");

  const resources = resolveReference(objects, page.body.match(/\/Resources\s+(\d+\s+\d+\s+R)/)?.[1]) ?? page;
  const shapes: RawShape[] = [];
  parseContentStream(chunks.join("\n"), baseMatrix, objects, resources, shapes, warnings);

  return finalizeDocument({
    kind: "pdf",
    name: options.name ?? "artwork.pdf",
    widthMm: pageWidth * scale,
    heightMm: pageHeight * scale,
    pageCount: pages.length,
    page: pageIndex + 1,
    shapes,
    warnings: [...warnings],
  }, options);
}

// ---------------------------------------------------------------------------
// Shared finalization
// ---------------------------------------------------------------------------

type DraftDocument = {
  kind: "svg" | "pdf";
  name: string;
  widthMm: number;
  heightMm: number;
  pageCount: number;
  page: number;
  shapes: RawShape[];
  warnings: string[];
};

function finalizeDocument(draft: DraftDocument, options: VectorImportOptions): ImportedDocument {
  const warnings = [...draft.warnings];
  const pageArea = Math.max(1e-6, draft.widthMm * draft.heightMm);
  const diagonal = Math.hypot(draft.widthMm, draft.heightMm) || 100;
  const tolerance = options.tolerance ?? diagonal * 0.0005;
  const minimumArea = pageArea * 1e-6;

  const shapes: ImportedShape[] = [];
  let dropped = 0;
  let simplified = false;
  for (const raw of draft.shapes) {
    if (shapes.length >= MAX_SHAPES) {
      dropped += 1;
      continue;
    }
    const contours: VectorContourSpec[] = [];
    let area = 0;
    for (const contour of raw.contours) {
      let next = tolerance > 0 ? simplifyContour(contour, tolerance) : contour;
      // A contour still over the per-outline budget gets progressively coarser
      // rather than failing the import outright.
      for (let attempt = 1; next.length > MAX_CONTOUR_COMMANDS && attempt <= 6; attempt += 1) {
        next = simplifyContour(next, Math.max(tolerance, diagonal * 0.0005) * 2 ** attempt);
        simplified = true;
      }
      if (next.length > MAX_CONTOUR_COMMANDS) {
        next = next.slice(0, MAX_CONTOUR_COMMANDS - 1).concat([{ op: "close" }]);
        simplified = true;
      }
      const points = flattenContour(next);
      if (points.length < 3) continue;
      area += Math.abs(signedArea(points));
      contours.push(roundContour(next, COORDINATE_PRECISION));
    }
    if (!contours.length || area < minimumArea) continue;
    const bounds = mergeBounds(contours.map(contourBounds));
    if (!isFiniteBounds(bounds)) continue;
    shapes.push({
      id: `shape-${shapes.length + 1}`,
      label: `${raw.kind} ${shapes.length + 1}`,
      kind: raw.kind,
      contours,
      fillRule: raw.fillRule,
      strokeOnly: raw.strokeOnly,
      bounds,
      area,
      commands: contours.reduce((total, contour) => total + contour.length, 0),
      recommended: true,
    });
  }

  if (dropped) warnings.push(`Only the first ${MAX_SHAPES} shapes were imported; ${dropped} more were skipped.`);
  if (simplified) warnings.push("Very dense outlines were simplified to keep the model buildable.");
  if (!shapes.length) throw new Error("No extrudable outlines were found in this file.");

  // Default the selection to the artwork the user probably means: filled shapes,
  // minus any full-page background plate.
  const hasFill = shapes.some((shape) => !shape.strokeOnly);
  for (const shape of shapes) {
    const size = boundsSize(shape.bounds);
    const coversPage = size.width * size.height >= pageArea * 0.98;
    shape.recommended = !(hasFill && shape.strokeOnly) && !coversPage;
  }
  if (!shapes.some((shape) => shape.recommended)) shapes.forEach((shape) => { shape.recommended = true; });

  const bounds = mergeBounds(shapes.map((shape) => shape.bounds));
  return {
    kind: draft.kind,
    name: draft.name,
    widthMm: draft.widthMm,
    heightMm: draft.heightMm,
    bounds,
    pageCount: draft.pageCount,
    page: draft.page,
    shapes,
    warnings,
  };
}

function looksLikePdf(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");
}

export function importVectorDocument(data: Uint8Array, options: VectorImportOptions = {}): ImportedDocument {
  if (!data.byteLength) throw new Error("The file is empty.");
  const name = options.name ?? "";
  if (looksLikePdf(data) || /\.pdf$/i.test(name)) return parsePdfDocument(data, options);
  const text = Buffer.from(data).toString("utf8");
  if (/<svg[\s>]/i.test(text) || /\.svg$/i.test(name)) return parseSvgDocument(text, options);
  throw new Error("Unsupported file. Import an SVG or a PDF that contains vector outlines.");
}

/** Bounds helper kept next to the importers so callers do not re-derive it. */
export function documentContentBounds(document: ImportedDocument, shapeIds?: Iterable<string>): Bounds {
  const wanted = shapeIds ? new Set(shapeIds) : null;
  const bounds = emptyBounds();
  for (const shape of document.shapes) {
    if (wanted && !wanted.has(shape.id)) continue;
    growBounds(bounds, shape.bounds.minX, shape.bounds.minY);
    growBounds(bounds, shape.bounds.maxX, shape.bounds.maxY);
  }
  return bounds;
}
