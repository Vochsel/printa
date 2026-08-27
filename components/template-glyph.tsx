import type { Template, TemplateCategory } from "@/lib/templates";

/**
 * A card thumbnail that is not a 3D viewport.
 *
 * A hundred templates on one page cannot each hold a WebGL context — browsers
 * drop the oldest once a page passes about sixteen, so the grid would eat
 * itself as you scrolled. Each card draws a flat silhouette taken from the
 * template's own document instead: the revolved profile of a vase, the
 * outline of a tray, the word a sign says. It is derived from the same spec
 * the model is compiled from, so it cannot drift from what prints, and the
 * real turning model lives on the template's own page.
 */

const ACCENT: Record<TemplateCategory, string> = {
  vessels: "#7b63ce",
  lighting: "#e0a03c",
  signage: "#e58fb4",
  desk: "#4aa3c9",
  jewellery: "#c96f9c",
  structural: "#5f8f6a",
  organic: "#c9743f",
  tabletop: "#6d7fc9",
  kitchen: "#3f9a8f",
  garden: "#6a9a3f",
};

type Point = [number, number];
type LooseNode = {
  kind?: string;
  source?: Record<string, unknown>;
  children?: LooseNode[];
  child?: LooseNode;
  count?: number;
};

/** Fit a set of rings into the 100×100 viewBox, keeping their proportions. */
function fit(rings: Point[][]): string {
  const all = rings.flat();
  if (all.length === 0) return "";
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = 74 / Math.max(maxX - minX, maxY - minY, 1);
  const offsetX = 50 - ((minX + maxX) / 2) * scale;
  const offsetY = 50 + ((minY + maxY) / 2) * scale;

  return rings
    .map((ring) =>
      ring
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${(x * scale + offsetX).toFixed(2)} ${(offsetY - y * scale).toFixed(2)}`)
        .join(" ") + " Z",
    )
    .join(" ");
}

function firstShape(node: LooseNode | undefined): LooseNode | undefined {
  if (!node) return undefined;
  if (node.kind === "shape") return node;
  if (node.child) return firstShape(node.child);
  for (const child of node.children ?? []) {
    const found = firstShape(child);
    if (found) return found;
  }
  return undefined;
}

/** The silhouette a template's own document implies, seen from the front. */
function silhouette(root: LooseNode | undefined): { path?: string; word?: string } {
  const node = firstShape(root);
  const source = node?.source;
  if (!source) return {};

  if (source.type === "revolve") {
    const profile = (source.profile as Point[] | undefined) ?? [];
    if (profile.length < 2) return {};
    // A revolve is symmetrical about its axis: the outline is the profile and
    // its mirror image, which is exactly the shape you would see on a shelf.
    const right = profile.map(([r, h]) => [r, h] as Point);
    const left = [...profile].reverse().map(([r, h]) => [-r, h] as Point);
    return { path: fit([[...right, ...left]]) };
  }

  if (source.type === "extrude") {
    const path = source.path as { commands?: Array<{ to?: Point }>; holes?: Array<Array<{ to?: Point }>> } | undefined;
    const ring = (commands: Array<{ to?: Point }> = []) =>
      commands.map((command) => command.to).filter((point): point is Point => Array.isArray(point));
    const rings = [ring(path?.commands), ...(path?.holes ?? []).map(ring)].filter((points) => points.length >= 3);
    if (rings.length === 0) return {};
    return { path: fit(rings) };
  }

  if (source.type === "text") return { word: String(source.text ?? "").slice(0, 8) };

  if (source.type === "primitive") {
    const width = Number(source.width ?? (source.radius ? Number(source.radius) * 2 : 40));
    const height = Number(source.height ?? (source.radius ? Number(source.radius) * 2 : 40));
    const shape = String(source.shape ?? "box");
    const halfWidth = width / 2;
    if (shape === "cone") return { path: fit([[[-halfWidth, 0], [halfWidth, 0], [0, height]]]) };
    if (shape === "sphere" || shape === "torus") {
      const ring = Array.from({ length: 40 }, (_, i) => {
        const angle = (i / 40) * Math.PI * 2;
        return [Math.cos(angle) * halfWidth, Math.sin(angle) * (height / 2)] as Point;
      });
      const inner = shape === "torus"
        ? Array.from({ length: 40 }, (_, i) => {
            const angle = (i / 40) * Math.PI * 2;
            const tube = Number(source.tube ?? 5);
            return [Math.cos(angle) * Math.max(1, halfWidth - tube * 2), Math.sin(angle) * Math.max(1, height / 2 - tube * 2)] as Point;
          })
        : null;
      return { path: fit(inner ? [ring, inner] : [ring]) };
    }
    return { path: fit([[[-halfWidth, 0], [halfWidth, 0], [halfWidth, height], [-halfWidth, height]]]) };
  }

  if (source.type === "cellular" || source.type === "organic" || source.type === "cloth" || source.type === "fluid" || source.type === "water") {
    const width = Number(source.width ?? 60);
    const height = Number(source.height ?? source.base ?? 20);
    return { path: fit([[[-width / 2, 0], [width / 2, 0], [width / 2, height], [-width / 2, height]]]) };
  }

  return {};
}

export function TemplateGlyph({
  template,
  className = "",
}: {
  template: Template;
  className?: string;
}) {
  const accent = ACCENT[template.category];
  const { path, word } = silhouette(template.document.root as LooseNode);

  return (
    <div className={className} style={{ background: `radial-gradient(circle at 50% 12%, ${accent}22, transparent 74%)` }}>
      <svg viewBox="0 0 100 100" role="presentation" className="size-full">
        {path && (
          <path
            d={path}
            fillRule="evenodd"
            fill={accent}
            fillOpacity={0.16}
            stroke={accent}
            strokeOpacity={0.75}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        )}
        {word && (
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fill={accent}
            fillOpacity={0.85}
            style={{ font: "600 20px var(--font-space-grotesk), sans-serif" }}
          >
            {word}
          </text>
        )}
        {!path && !word && (
          <circle cx="50" cy="50" r="26" fill="none" stroke={accent} strokeOpacity={0.6} strokeWidth={1.4} />
        )}
      </svg>
    </div>
  );
}

export const templateAccent = (category: TemplateCategory) => ACCENT[category];
