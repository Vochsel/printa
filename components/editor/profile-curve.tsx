"use client";

import { useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sfx";

/**
 * Drawing a revolved profile.
 *
 * A vase is a curve spun around an axis, and a table of numbers is a poor way
 * to hold a curve: you cannot see that the shoulder is lumpy until you have
 * compiled it. This draws the profile as it will be spun — the editable side
 * on the right of the axis, its mirror ghosted on the left — so the silhouette
 * on screen is the silhouette that prints.
 *
 * Points stay in the order they were given, bottom to top, because that order
 * is what the revolve walks; dragging one past its neighbour is allowed but
 * reordering behind the user's back is not.
 */

type Point = [number, number];

const PAD = 14;
const HANDLE = 4.6;

/** Catmull-Rom through the points, as the compiler interpolates them. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

function straightPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

export function ProfileCurveEditor({
  profile,
  smooth,
  onChange,
}: {
  profile: Point[];
  /** Whether the compiler will run a Catmull-Rom through these points. */
  smooth: boolean;
  onChange: (profile: Point[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [hint, setHint] = useState<{ x: number; y: number; index: number } | null>(null);

  const width = 240;
  const height = 190;
  const maxRadius = Math.max(1, ...profile.map(([r]) => r));
  const maxHeight = Math.max(1, ...profile.map(([, h]) => h));
  // One scale for both axes: an anisotropic plot would show a silhouette the
  // model never has.
  const scale = Math.min((width / 2 - PAD) / (maxRadius * 1.08), (height - PAD * 2) / (maxHeight * 1.04));
  const axisX = width / 2;
  const baseY = height - PAD;

  const toView = ([r, h]: Point) => ({ x: axisX + r * scale, y: baseY - h * scale });
  const toModel = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    return [
      Math.max(0, Math.round(((x - axisX) / scale) * 2) / 2),
      Math.max(0, Math.round(((baseY - y) / scale) * 2) / 2),
    ];
  };

  const view = profile.map(toView);
  const drawPath = smooth ? smoothPath : straightPath;
  const mirrored = view.map((point) => ({ x: axisX - (point.x - axisX), y: point.y }));
  const right = drawPath(view);
  const left = drawPath(mirrored);
  // The body the profile will sweep out, so the panel shows a shape rather
  // than a graph of two lines.
  const body = `${drawPath([...view, ...[...mirrored].reverse()])} Z`;

  const commit = (next: Point[]) => onChange(next.map(([r, h]) => [Number(r.toFixed(2)), Number(h.toFixed(2))] as Point));

  const movePoint = (index: number, clientX: number, clientY: number) => {
    const next = profile.map((point, i) => (i === index ? toModel(clientX, clientY) : point));
    commit(next);
  };

  /** Where a click on the background belongs in the sequence. */
  const insertionIndex = (point: Point): number => {
    let best = profile.length;
    let bestDistance = Infinity;
    for (let i = 0; i < profile.length - 1; i += 1) {
      const [ax, ay] = profile[i];
      const [bx, by] = profile[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSq));
      const distance = Math.hypot(ax + dx * t - point[0], ay + dy * t - point[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i + 1;
      }
    }
    // Past the top of the profile, a new point extends it rather than splitting it.
    if (point[1] > Math.max(...profile.map(([, h]) => h))) return profile.length;
    return best;
  };

  const addAt = (clientX: number, clientY: number) => {
    if (profile.length >= 64) return;
    const point = toModel(clientX, clientY);
    const index = insertionIndex(point);
    const next = [...profile.slice(0, index), point, ...profile.slice(index)];
    sfx("droplet");
    setSelected(index);
    commit(next);
  };

  const removeAt = (index: number) => {
    if (profile.length <= 2) return;
    sfx("tick");
    setSelected(Math.max(0, index - 1));
    commit(profile.filter((_, i) => i !== index));
  };

  const nudge = (axis: 0 | 1, delta: number) => {
    const next = profile.map((point, i) =>
      i === selected ? ([axis === 0 ? Math.max(0, point[0] + delta) : point[0], axis === 1 ? Math.max(0, point[1] + delta) : point[1]] as Point) : point,
    );
    commit(next);
  };

  const active = profile[selected] ?? profile[0];

  return (
    <div className="grid gap-1.5">
      <div className="relative overflow-hidden rounded-md border border-border bg-muted/40">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none select-none"
          style={{ aspectRatio: `${width} / ${height}` }}
          onPointerMove={(event) => {
            if (dragging === null) return;
            movePoint(dragging, event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (dragging === null) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(null);
          }}
          onDoubleClick={(event) => addAt(event.clientX, event.clientY)}
        >
          {/* Ground and axis of revolution */}
          <line x1={0} y1={baseY} x2={width} y2={baseY} stroke="currentColor" strokeOpacity={0.18} strokeWidth={0.8} />
          <line x1={axisX} y1={PAD / 2} x2={axisX} y2={baseY} stroke="currentColor" strokeOpacity={0.25} strokeWidth={0.8} strokeDasharray="3 3" />

          <path d={body} fill="var(--accent-tool)" fillOpacity={0.1} stroke="none" />
          <path d={left} fill="none" stroke="var(--accent-tool)" strokeOpacity={0.28} strokeWidth={1.4} />
          <path d={right} fill="none" stroke="var(--accent-tool)" strokeWidth={1.8} strokeLinecap="round" />

          {view.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r={HANDLE}
                className={cn("cursor-grab", dragging === index && "cursor-grabbing")}
                fill={index === selected ? "var(--accent-tool)" : "var(--background)"}
                stroke="var(--accent-tool)"
                strokeWidth={1.4}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  // Alt-click removes, which is the one destructive gesture
                  // here and so is never the plain one.
                  if (event.altKey) { removeAt(index); return; }
                  event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                  setSelected(index);
                  setDragging(index);
                  sfx("tick");
                }}
                onPointerEnter={() => setHint({ x: point.x, y: point.y, index })}
                onPointerLeave={() => setHint(null)}
              />
            </g>
          ))}

          {hint && (
            <text
              x={Math.min(width - 34, hint.x + 8)}
              y={Math.max(10, hint.y - 8)}
              className="fill-muted-foreground"
              style={{ font: "9px var(--font-geist-mono), monospace" }}
            >
              {profile[hint.index][0]} × {profile[hint.index][1]}
            </text>
          )}
        </svg>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">
          Point {selected + 1}/{profile.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <StepPair label="R" value={active?.[0] ?? 0} onStep={(delta) => nudge(0, delta)} />
          <StepPair label="H" value={active?.[1] ?? 0} onStep={(delta) => nudge(1, delta)} />
          <button
            type="button"
            aria-label="Delete point"
            disabled={profile.length <= 2}
            onClick={() => removeAt(selected)}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Drag to shape · double-click to add a point · alt-click a point to remove it.
      </p>
    </div>
  );
}

function StepPair({ label, value, onStep }: { label: string; value: number; onStep: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded bg-secondary px-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <button type="button" aria-label={`${label} down`} className="grid size-5 place-items-center text-muted-foreground hover:text-foreground" onClick={() => onStep(-0.5)}>
        <Minus size={10} />
      </button>
      <span className="min-w-[2.2rem] text-center font-mono text-[10px] tabular-nums">{value.toFixed(1)}</span>
      <button type="button" aria-label={`${label} up`} className="grid size-5 place-items-center text-muted-foreground hover:text-foreground" onClick={() => onStep(0.5)}>
        <Plus size={10} />
      </button>
    </div>
  );
}
