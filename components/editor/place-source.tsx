"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField, SelectField, TextField } from "@/components/editor/fields";
import {
  captureBytes,
  capturePlace,
  hasCapture,
  searchPlaces,
  MAX_CAPTURE_RADIUS_M,
  type PlaceSearchHit,
  type PlaceSource,
} from "@/lib/place-capture";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

/**
 * Editing a real place.
 *
 * A place source is the one source that cannot be authored by typing numbers:
 * the ground and the buildings come off a map. So this panel is search, then
 * capture, then the ordinary print settings — and it says plainly when the
 * document holds no capture, or when the coordinates have moved away from the
 * one it does hold, because neither failure is visible in the model itself.
 */

const controlClass =
  "h-7 rounded-md border border-transparent bg-secondary px-2 text-xs md:text-xs shadow-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40";

type Progress = { stage: string; done: number; total: number } | null;

/** Identity of the baked data, so a fresh capture resets the drift baseline. */
function captureKey(source: PlaceSource): string {
  const surface = source.surface;
  const footprints = source.footprints;
  return [
    surface?.grid ?? 0,
    surface?.heights.length ?? 0,
    surface?.heights.slice(0, 32) ?? "",
    footprints?.count ?? 0,
    footprints?.data.slice(0, 32) ?? "",
  ].join("|");
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-1.5">{children}</div>;
}

export function PlaceSourceFields({
  source,
  update,
}: {
  source: PlaceSource;
  update: (patch: Partial<PlaceSource>) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const capturingRef = useRef<AbortController | null>(null);
  const [capturing, setCapturing] = useState(false);

  // The baked data does not record where it was taken, so the panel remembers
  // it: whenever the capture itself changes — a new bake, or another document
  // loaded into the editor — the parameters it was taken with are whatever is
  // in the source at that moment.
  const key = captureKey(source);
  const [baseline, setBaseline] = useState(() => ({ key, lat: source.lat, lng: source.lng, radiusM: source.radiusM, capture: source.capture }));
  if (baseline.key !== key) {
    setBaseline({ key, lat: source.lat, lng: source.lng, radiusM: source.radiusM, capture: source.capture });
  }

  const captured = hasCapture(source);
  const stale =
    captured &&
    (baseline.lat !== source.lat ||
      baseline.lng !== source.lng ||
      baseline.radiusM !== source.radiusM ||
      baseline.capture !== source.capture);

  useEffect(() => () => capturingRef.current?.abort(), []);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || searching) return;
    setSearching(true);
    setError("");
    try {
      const results = await searchPlaces(trimmed);
      setHits(results);
      sfx(results.length > 0 ? "droplet" : "tick");
      if (results.length === 0) setError(`Nothing found for “${trimmed}”.`);
    } catch (nextError) {
      setHits(null);
      setError(nextError instanceof Error ? nextError.message : "Place search failed.");
    } finally {
      setSearching(false);
    }
  };

  const choose = (hit: PlaceSearchHit) => {
    sfx("droplet");
    setHits(null);
    setQuery("");
    setError("");
    update({
      label: hit.label.split(",")[0]?.trim() || hit.label,
      lat: Number(hit.lat.toFixed(6)),
      lng: Number(hit.lng.toFixed(6)),
      radiusM: Math.min(hit.radiusM, MAX_CAPTURE_RADIUS_M[source.capture]),
    });
  };

  const capture = async () => {
    if (capturing) return;
    const controller = new AbortController();
    capturingRef.current = controller;
    setCapturing(true);
    setError("");
    setNote("");
    setProgress({ stage: "Starting", done: 0, total: 1 });
    sfx("press");
    try {
      const result = await capturePlace(
        { lat: source.lat, lng: source.lng, radiusM: source.radiusM, capture: source.capture, label: source.label },
        {
          signal: controller.signal,
          onProgress: (stage, done, total) => setProgress({ stage, done, total }),
        },
      );
      // A surface capture leaves no outlines behind: keeping a previous set
      // would carry tens of kilobytes the model never draws.
      update({ surface: result.surface, footprints: result.footprints });
      setNote(result.note);
      sfx("success");
    } catch (nextError) {
      if (controller.signal.aborted) return;
      sfx("error");
      setError(nextError instanceof Error ? nextError.message : "Could not capture this place.");
    } finally {
      if (capturingRef.current === controller) capturingRef.current = null;
      setCapturing(false);
      setProgress(null);
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const sizeKb = Math.round(captureBytes(source) / 1024);

  return (
    <>
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <Input
            value={query}
            placeholder="Search a city, suburb or landmark…"
            className={controlClass}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void runSearch(); }
              if (event.key === "Escape") { setHits(null); setQuery(""); }
            }}
          />
          <Button variant="secondary" size="sm" className="h-7 px-2" disabled={searching || query.trim().length < 2} onClick={() => void runSearch()}>
            {searching ? <LoaderCircle className="animate-spin" /> : <Search />}
          </Button>
        </div>
        {hits && hits.length > 0 && (
          <div className="overflow-hidden rounded-md border border-border bg-popover">
            {hits.map((hit) => (
              <button
                key={`${hit.lat},${hit.lng},${hit.label}`}
                type="button"
                className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => choose(hit)}
              >
                <MapPin size={13} className="text-muted-foreground" />
                <span className="truncate text-xs">{hit.label}</span>
                <small className="text-[10px] tabular-nums text-muted-foreground">{hit.radiusM} m</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <TextField label="Name" value={source.label} onChange={(value) => update({ label: value })} />
      <Grid2>
        <NumberField label="Latitude" value={source.lat} min={-90} max={90} step={0.0001} onChange={(value) => update({ lat: value ?? 0 })} />
        <NumberField label="Longitude" value={source.lng} min={-180} max={180} step={0.0001} onChange={(value) => update({ lng: value ?? 0 })} />
      </Grid2>
      <Grid3>
        <NumberField label="Radius" value={source.radiusM} min={50} max={MAX_CAPTURE_RADIUS_M[source.capture]} step={25} unit="m" onChange={(value) => update({ radiusM: value ?? 300 })} />
        <SelectField label="Outline" value={source.shape} options={[{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }]} onChange={(value) => update({ shape: value as PlaceSource["shape"] })} />
        <SelectField
          label="Captured as"
          value={source.capture}
          options={[{ value: "buildings", label: "Mapped" }, { value: "surface", label: "Photo" }]}
          onChange={(value) => update({ capture: value as PlaceSource["capture"] })}
        />
      </Grid3>

      <div className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {source.capture === "surface"
            ? "A photogrammetric skyline: every roof, tree and quay as it is, rasterised into printable relief."
            : "Mapped OpenStreetMap outlines, extruded over sampled ground — a clean, blocky city."}
        </p>
        <Button
          size="sm"
          className="h-7 w-full"
          variant={captured && !stale ? "secondary" : "default"}
          disabled={capturing}
          onClick={() => void capture()}
        >
          {capturing ? <LoaderCircle className="animate-spin" /> : <MapPin />}
          {capturing ? "Capturing…" : captured ? "Recapture this place" : "Capture this place"}
        </Button>

        {progress && (
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
              <span className="truncate">{progress.stage}</span>
              <span>{progress.total > 1 ? `${progress.done}/${progress.total}` : `${percent}%`}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-[var(--accent-tool)] transition-[width]" style={{ width: `${Math.max(4, percent)}%` }} />
            </div>
          </div>
        )}

        {!capturing && (
          <p
            className={cn(
              "flex items-start gap-1.5 text-[11px] leading-relaxed",
              error || !captured || stale ? "text-[var(--accent-tool)]" : "text-muted-foreground",
            )}
          >
            {error || !captured || stale ? <TriangleAlert size={12} className="mt-0.5 shrink-0" /> : <Check size={12} className="mt-0.5 shrink-0" />}
            <span>
              {error
                ? error
                : !captured
                  ? source.capture === "buildings" && source.surface
                    ? "No building outlines yet — capture to map them."
                    : "No capture yet, so this builds as bare ground. Capture to fill it in."
                  : stale
                    ? "Moved since the capture. Recapture so the ground matches the coordinates."
                    : note || `Captured · ${source.surface?.grid ?? 0}² ground${source.footprints ? ` · ${source.footprints.count.toLocaleString()} buildings` : ""} · ${sizeKb} KB`}
            </span>
          </p>
        )}
      </div>

      <Grid3>
        <NumberField label="Model size" value={source.size} min={10} step={5} unit="mm" onChange={(value) => update({ size: value ?? 120 })} />
        <NumberField label="Base" value={source.plinth} min={0} max={80} step={0.5} unit="mm" onChange={(value) => update({ plinth: value ?? 0 })} />
        <NumberField label="Height boost" value={source.exaggeration} min={0.1} max={8} step={0.1} onChange={(value) => update({ exaggeration: value ?? 1 })} />
      </Grid3>
      <Grid3>
        <NumberField label="Rim" value={source.frame} min={0} max={40} step={0.5} unit="mm" onChange={(value) => update({ frame: value ?? 0 })} />
        <NumberField label="Rim height" value={source.frameHeight} min={0} max={120} step={0.5} unit="mm" onChange={(value) => update({ frameHeight: value ?? 0 })} />
        <NumberField label="Mesh detail" value={source.resolution} min={24} max={400} onChange={(value) => update({ resolution: value ?? 160 })} />
      </Grid3>
      <NumberField layout="row" label="Smoothing passes" value={source.smoothing} min={0} max={4} onChange={(value) => update({ smoothing: value ?? 0 })} />
    </>
  );
}
