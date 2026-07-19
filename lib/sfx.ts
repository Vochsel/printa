"use client";

/**
 * Tiny WebAudio interface-sound engine. Every cue is synthesized — no assets.
 * Sounds are deliberately quiet and short so they read as tactile feedback,
 * not notification noise. Users can turn them off from the view settings.
 */

const STORAGE_KEY = "printa.sfx-enabled";

let context: AudioContext | null = null;
let enabled: boolean | null = null;
let lastTickAt = 0;

function audioContext() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function sfxEnabled() {
  if (enabled === null) {
    if (typeof window === "undefined") return true;
    enabled = window.localStorage.getItem(STORAGE_KEY) !== "false";
  }
  return enabled;
}

export function setSfxEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* private mode — keep the in-memory value */
  }
}

type Voice = {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  delay?: number;
};

function play(voices: Voice[]) {
  if (!sfxEnabled()) return;
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const voice of voices) {
    const start = now + (voice.delay ?? 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.max(1200, voice.frequency * 2.4);
    oscillator.type = voice.type ?? "sine";
    oscillator.frequency.setValueAtTime(voice.frequency, start);
    if (voice.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(voice.endFrequency, start + voice.duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(voice.gain, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.duration);
    oscillator.connect(filter).connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + voice.duration + 0.02);
  }
}

/** Soft tap for buttons and layer selection. */
export function sfxTap() {
  play([{ frequency: 620, endFrequency: 480, duration: 0.05, gain: 0.05, type: "triangle" }]);
}

/** Feather-light tick for sliders and steppers; throttled so drags stay quiet. */
export function sfxTick() {
  const now = performance.now();
  if (now - lastTickAt < 55) return;
  lastTickAt = now;
  play([{ frequency: 1150, endFrequency: 950, duration: 0.025, gain: 0.022, type: "sine" }]);
}

/** Toggle flip — slightly firmer than a tap. */
export function sfxToggle(on: boolean) {
  play([{ frequency: on ? 520 : 430, endFrequency: on ? 700 : 330, duration: 0.07, gain: 0.045, type: "triangle" }]);
}

/** Dialog / popover opening. */
export function sfxOpen() {
  play([
    { frequency: 340, endFrequency: 560, duration: 0.09, gain: 0.035, type: "sine" },
    { frequency: 680, endFrequency: 900, duration: 0.07, gain: 0.02, type: "sine", delay: 0.02 },
  ]);
}

/** Dialog / popover closing. */
export function sfxClose() {
  play([{ frequency: 540, endFrequency: 320, duration: 0.08, gain: 0.03, type: "sine" }]);
}

/** Model compiled successfully — a quiet two-note confirmation. */
export function sfxSuccess() {
  play([
    { frequency: 660, duration: 0.06, gain: 0.03, type: "sine" },
    { frequency: 880, duration: 0.09, gain: 0.03, type: "sine", delay: 0.055 },
  ]);
}

/** Something went wrong — a muted low buzz. */
export function sfxError() {
  play([{ frequency: 220, endFrequency: 150, duration: 0.14, gain: 0.04, type: "triangle" }]);
}
