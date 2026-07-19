"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sfx";

/*
 * Inputs here hold a local draft while focused and only sync from props when
 * blurred. Every keystroke still commits valid values upward, but the parent
 * re-render can never reformat or clear the text mid-typing — which is what
 * previously made fields feel like they "lost" each keypress.
 *
 * Layout: "row" puts the label in a fixed left column (properties-panel style)
 * and is the default for full-width fields; "stack" keeps a tiny label above
 * the control and is used inside 2/3-column grids.
 *
 * Styling: filled controls (soft gray fill, borderless at rest) at 12px in a
 * 28px box — the dense, monochrome look of a real design tool. The explicit
 * `text-xs md:text-xs` is required to beat shadcn's base `md:text-sm`.
 */

type FieldLayout = "row" | "stack";

const rowLabelClass = "truncate text-[11px] text-muted-foreground";
const stackLabelClass = "truncate text-[10px] font-medium text-muted-foreground";
const controlClass =
  "h-7 rounded-md border border-transparent bg-secondary px-2 text-xs md:text-xs shadow-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40";

export function FieldShell({ label, layout = "stack", htmlFor, children, className }: { label?: string; layout?: FieldLayout; htmlFor?: string; children: React.ReactNode; className?: string }) {
  if (!label) return <div className={cn("min-w-0", className)}>{children}</div>;
  if (layout === "row") {
    return (
      <div className={cn("grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2", className)}>
        <Label htmlFor={htmlFor} className={rowLabelClass}>{label}</Label>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <Label htmlFor={htmlFor} className={stackLabelClass}>{label}</Label>
      {children}
    </div>
  );
}

export function NumberField({
  label,
  layout = "stack",
  value,
  min,
  max,
  step = 1,
  unit,
  placeholder,
  optional = false,
  className,
  inputClassName,
  onChange,
}: {
  label?: string;
  layout?: FieldLayout;
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  optional?: boolean;
  className?: string;
  inputClassName?: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));

  const commitText = (text: string) => {
    if (text.trim() === "") {
      if (optional) onChange(undefined);
      return;
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
  };

  const nudge = (direction: 1 | -1) => {
    const base = draft !== null && Number.isFinite(Number(draft)) && draft.trim() !== "" ? Number(draft) : value ?? 0;
    const decimals = Math.max(0, -Math.floor(Math.log10(step || 1) + 1e-9));
    const next = clamp(Number((base + direction * step).toFixed(Math.min(6, decimals + 2))));
    setDraft(String(next));
    onChange(next);
  };

  const shown = draft ?? (value === undefined ? "" : String(value));

  return (
    <FieldShell label={label} layout={layout} className={className}>
      <div className="relative min-w-0">
        <Input
          type="text"
          inputMode="decimal"
          value={shown}
          placeholder={placeholder ?? (optional ? "Auto" : undefined)}
          className={cn(controlClass, "tabular-nums", unit && "pr-6", inputClassName)}
          onFocus={(event) => setDraft(event.currentTarget.value)}
          onChange={(event) => {
            setDraft(event.target.value);
            commitText(event.target.value);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
            if (event.key === "ArrowUp") { event.preventDefault(); nudge(1); }
            if (event.key === "ArrowDown") { event.preventDefault(); nudge(-1); }
          }}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[9px] font-medium text-muted-foreground/60">
            {unit}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

export function TextField({
  label,
  layout = "row",
  value,
  placeholder,
  commit = "live",
  className,
  onChange,
}: {
  label?: string;
  layout?: FieldLayout;
  value: string;
  placeholder?: string;
  /** "blur" defers the commit until focus leaves — for fields whose value re-keys other UI (e.g. layer ids). */
  commit?: "live" | "blur";
  className?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <FieldShell label={label} layout={layout} className={className}>
      <Input
        value={draft ?? value}
        placeholder={placeholder}
        className={controlClass}
        onFocus={(event) => setDraft(event.currentTarget.value)}
        onChange={(event) => {
          setDraft(event.target.value);
          if (commit === "live") onChange(event.target.value);
        }}
        onBlur={() => {
          if (commit === "blur" && draft !== null && draft !== value) onChange(draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
        }}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  layout = "stack",
  value,
  options,
  className,
  onChange,
}: {
  label?: string;
  layout?: FieldLayout;
  value: string;
  options: readonly { value: string; label: string }[] | readonly string[];
  className?: string;
  onChange: (value: string) => void;
}) {
  const items = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  return (
    <FieldShell label={label} layout={layout} className={className}>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null && next !== value) {
            sfx("tick");
            onChange(String(next));
          }
        }}
      >
        <SelectTrigger className={cn(controlClass, "w-full data-[size=sm]:h-7")} size="sm">
          <SelectValue>{items.find((item) => item.value === value)?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="text-xs">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export function ToggleField({
  label,
  detail,
  value,
  disabled = false,
  className,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-7 min-w-0 cursor-pointer items-center justify-between gap-3",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      <span className="grid min-w-0 gap-px">
        <span className="truncate text-[11px] text-foreground/90">{label}</span>
        {detail && <span className="truncate text-[10px] leading-tight text-muted-foreground">{detail}</span>}
      </span>
      <Switch
        size="sm"
        checked={value}
        disabled={disabled}
        onCheckedChange={(next) => {
          sfx("toggle");
          onChange(next);
        }}
      />
    </label>
  );
}

/** JSON.stringify, but short arrays/objects stay on one line — keeps point lists like [[24, 0], …] readable. */
export function formatCompactJson(value: unknown, indent = 0): string {
  const inline = JSON.stringify(value);
  if (inline === undefined) return "null";
  if (inline.length <= 56 || typeof value !== "object" || value === null) return inline;
  const pad = "  ".repeat(indent + 1);
  const close = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => pad + formatCompactJson(item, indent + 1)).join(",\n")}\n${close}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([key, item]) => `${pad}${JSON.stringify(key)}: ${formatCompactJson(item, indent + 1)}`).join(",\n")}\n${close}}`;
}

export function JsonField({
  label,
  value,
  rows = 6,
  className,
  onChange,
}: {
  label?: string;
  value: unknown;
  rows?: number;
  className?: string;
  onChange: (value: unknown) => void;
}) {
  const serialized = formatCompactJson(value);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const focusedRef = useRef(false);

  // Adopt external changes only while the field is not being edited.
  useEffect(() => {
    if (!focusedRef.current) { setDraft(null); setInvalid(false); }
  }, [serialized]);

  return (
    <FieldShell label={label} layout="stack" className={className}>
      <Textarea
        value={draft ?? serialized}
        rows={rows}
        spellCheck={false}
        className={cn(
          "resize-y rounded-md border-transparent bg-zinc-900 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-zinc-100 caret-[#ff4d8b] shadow-none dark:bg-zinc-900",
          invalid && "border-destructive ring-2 ring-destructive/25",
        )}
        onFocus={(event) => { focusedRef.current = true; setDraft(event.currentTarget.value); }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          try {
            onChange(JSON.parse(next));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
        onBlur={() => {
          focusedRef.current = false;
          setDraft(null);
          setInvalid(false);
        }}
      />
    </FieldShell>
  );
}

/** Friendly editor for [x, y] point lists (e.g. a revolve profile) — no raw JSON in the main UI. */
export function PointListField({
  label,
  columns,
  value,
  minRows = 2,
  onChange,
}: {
  label: string;
  columns: [string, string];
  value: readonly (readonly [number, number])[];
  minRows?: number;
  onChange: (value: [number, number][]) => void;
}) {
  const points = value.map((point) => [point[0], point[1]] as [number, number]);
  return (
    <div className="grid min-w-0 gap-1">
      <Label className={stackLabelClass}>{label}</Label>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22px] gap-1 border-b border-border bg-muted/60 px-1.5 py-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{columns[0]}</span>
          <span>{columns[1]}</span>
          <span />
        </div>
        <div className="grid gap-1 p-1">
          {points.map((point, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22px] items-center gap-1">
              {([0, 1] as const).map((axis) => (
                <NumberField
                  key={axis}
                  value={point[axis]}
                  step={1}
                  inputClassName="h-6 px-1.5 text-center"
                  onChange={(next) => {
                    const draft = points.map((item) => [...item] as [number, number]);
                    draft[index][axis] = next ?? 0;
                    onChange(draft);
                  }}
                />
              ))}
              <button
                type="button"
                aria-label="Remove point"
                disabled={points.length <= minRows}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                onClick={() => { sfx("whisper"); onChange(points.filter((_, i) => i !== index)); }}
              >
                <Minus size={11} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="flex h-6 w-full items-center justify-center gap-1 border-t border-border text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            sfx("droplet");
            const last = points[points.length - 1] ?? [20, 0];
            onChange([...points, [last[0], last[1] + 20]]);
          }}
        >
          <Plus size={10} /> Add point
        </button>
      </div>
    </div>
  );
}

export function VectorField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: readonly [number, number, number];
  step?: number;
  onChange: (value: [number, number, number]) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_repeat(3,minmax(0,1fr))] items-center gap-1.5">
      <span className={rowLabelClass}>{label}</span>
      {value.map((item, index) => (
        <NumberField
          key={index}
          value={item}
          step={step}
          inputClassName="h-7 px-1 text-center"
          onChange={(next) => {
            const vector = [...value] as [number, number, number];
            vector[index] = next ?? 0;
            onChange(vector);
          }}
        />
      ))}
    </div>
  );
}
