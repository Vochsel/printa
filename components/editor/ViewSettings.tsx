"use client";

import { useState } from "react";
import { Eye, Hexagon, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelDocument } from "@/lib/model-spec";
import { setSfxEnabled, sfxClose, sfxEnabled, sfxOpen, sfxToggle } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import type { ShadingMode } from "./Viewport";
import { NumberField, SelectField, SwitchField } from "./fields";

export function ViewSettings({
  display,
  shading,
  onDisplayChange,
  onShadingChange,
}: {
  display: ModelDocument["display"];
  shading: ShadingMode;
  onDisplayChange: (display: ModelDocument["display"]) => void;
  onShadingChange: (shading: ShadingMode) => void;
}) {
  const [sound, setSound] = useState(() => sfxEnabled());
  const patch = (recipe: (draft: ModelDocument["display"]) => void) => {
    const draft = structuredClone(display);
    recipe(draft);
    onDisplayChange(draft);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) sfxOpen();
        else sfxClose();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="View settings"
              className="border-white/15 bg-black/40 text-white/75 backdrop-blur-md hover:bg-black/60 hover:text-white"
            >
              <Eye className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">View settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="bottom" className="w-72 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">View settings</p>
          <p className="text-[11px] text-muted-foreground">Only changes how the preview looks — never the printed model.</p>
        </div>
        <div className="grid gap-3 px-4 py-3.5">
          <div className="grid gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
              <Hexagon className="size-3.5 text-muted-foreground" /> Shading
            </span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
              {(["smooth", "flat"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition-colors",
                    shading === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    sfxToggle(mode === "smooth");
                    onShadingChange(mode);
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <SwitchField label="Print bed" detail="Dark floor disc under the model" value={display.floor} onChange={(next) => patch((draft) => { draft.floor = next; })} />
          <SwitchField label="Grid" detail="Reference grid lines" value={display.grid} onChange={(next) => patch((draft) => { draft.grid = next; })} />
          <SwitchField label="Measurements" detail="Width / depth arrows on the floor" value={display.dimensions.visible} onChange={(next) => patch((draft) => { draft.dimensions.visible = next; })} />
          {display.dimensions.visible && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card/50 p-2.5">
              <SwitchField label="Width" value={display.dimensions.width} onChange={(next) => patch((draft) => { draft.dimensions.width = next; })} />
              <SwitchField label="Depth" value={display.dimensions.height} onChange={(next) => patch((draft) => { draft.dimensions.height = next; })} />
              <NumberField label="Offset" value={display.dimensions.offset} min={0} onChange={(next) => patch((draft) => { draft.dimensions.offset = next; })} />
              <SelectField
                label="Decimals"
                value={String(display.dimensions.precision)}
                options={["0", "1", "2", "3"]}
                onChange={(next) => patch((draft) => { draft.dimensions.precision = Number(next); })}
              />
            </div>
          )}
          <div className="border-t border-border/70 pt-3">
            <SwitchField
              label="Interface sounds"
              detail="Subtle clicks and chimes"
              value={sound}
              onChange={(next) => {
                setSfxEnabled(next);
                setSound(next);
                if (next) sfxToggle(true);
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
          <Volume2 className="size-3" /> Preferences are remembered on this device.
        </div>
      </PopoverContent>
    </Popover>
  );
}
