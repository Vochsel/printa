"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sfxTap, sfxTick, sfxToggle } from "@/lib/sfx";

/**
 * Text input that keeps its own draft while focused, so parent re-renders
 * (live recompiles, stats updates) can never clobber the caret or the value
 * mid-typing. The document is updated on every keystroke; the field only
 * re-syncs from the document when it is not focused.
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  const input = (
    <Input
      value={draft}
      placeholder={placeholder}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        setDraft(value);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
  if (!label) return input;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {input}
    </div>
  );
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Number input with the same draft-while-focused behaviour: intermediate
 * states like "12." or "-" or "" stay on screen, and only parseable values
 * are committed to the document.
 */
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  className,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(formatNumber(value));
  }, [value]);
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) onChange(next);
  };
  const field = (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        value={draft}
        step={step}
        min={min}
        max={max}
        className={cn("font-mono text-xs tabular-nums", unit && "pr-9")}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          setDraft(formatNumber(value));
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
          sfxTick();
        }}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10px] font-semibold text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
  if (!label) return field;
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <Label className="truncate">{label}</Label>
      {field}
    </div>
  );
}

/** Slider + number entry pair for bounded continuous values. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_5rem] items-center gap-2.5">
        <Slider
          value={[Math.min(max, Math.max(min, value))]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => {
            sfxTick();
            onChange(next);
          }}
        />
        <NumberField value={value} min={min} step={step} unit={unit} onChange={onChange} />
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  const select = (
    <Select
      value={value}
      onValueChange={(next) => {
        sfxTap();
        onChange(next as T);
      }}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!label) return select;
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <Label className="truncate">{label}</Label>
      {select}
    </div>
  );
}

export function SwitchField({
  label,
  detail,
  value,
  onChange,
  className,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3 py-0.5", className)}>
      <span className="grid gap-0.5">
        <span className="text-xs leading-none font-medium text-foreground/80">{label}</span>
        {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
      </span>
      <Switch
        checked={value}
        onCheckedChange={(next) => {
          sfxToggle(next);
          onChange(next);
        }}
      />
    </label>
  );
}

/**
 * Compact JSON editor for inherently structured values (paths, profiles,
 * drops, colliders). Invalid drafts stay visible and are flagged, never
 * committed.
 */
export function JsonField({
  label,
  value,
  onChange,
  rows = 5,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  rows?: number;
}) {
  const serialized = JSON.stringify(value);
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(JSON.stringify(JSON.parse(serialized), null, 2));
      setInvalid(false);
    }
  }, [serialized]);
  return (
    <div className="grid gap-1.5">
      <Label>
        {label}
        {invalid && <span className="font-mono text-[10px] font-semibold text-destructive">invalid JSON</span>}
      </Label>
      <Textarea
        value={draft}
        rows={rows}
        spellCheck={false}
        className={cn("font-mono text-[11px] leading-relaxed", invalid && "border-destructive/60 focus-visible:border-destructive/60 focus-visible:ring-destructive/20")}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
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
      />
    </div>
  );
}

/** Three-number row for positions and rotations. */
export function VectorField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
  step?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {value.map((item, index) => (
          <NumberField
            key={index}
            value={item}
            step={step}
            onChange={(next) => {
              const vector = [...value] as [number, number, number];
              vector[index] = next;
              onChange(vector);
            }}
          />
        ))}
      </div>
    </div>
  );
}
