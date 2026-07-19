"use client";

import { play, setEnabled, type SoundName } from "cuelume";

const STORAGE_KEY = "printa:sound";
const throttleTimestamps = new Map<SoundName, number>();

export type { SoundName };

export function isSfxEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

export function initSfx() {
  setEnabled(isSfxEnabled());
}

export function setSfxEnabled(value: boolean) {
  window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  setEnabled(value);
  if (value) play("toggle");
}

export function sfx(name: SoundName) {
  play(name);
}

/** Plays at most once per `intervalMs` — for sliders and other rapid-fire interactions. */
export function sfxThrottled(name: SoundName, intervalMs = 90) {
  const now = performance.now();
  const last = throttleTimestamps.get(name) ?? 0;
  if (now - last < intervalMs) return;
  throttleTimestamps.set(name, now);
  play(name);
}
