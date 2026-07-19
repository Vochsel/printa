import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { BENCHMARK_SPECS } from "./specs";

type Quality = "preview" | "full";
type Sample = {
  name: string;
  quality: Quality;
  pass: "first" | "warm" | "incremental";
  wallMs: number;
  serverMs: number;
  triangles: number;
  bytes: number;
  cacheHits: number;
  cacheMisses: number;
  dimensionsMm: [number, number, number];
};

type BenchmarkSummary = {
  generatedAt: string;
  runtime: string;
  platform: string;
  baseUrl: string;
  cases: number;
  builds: number;
  firstMedianServerMs: number;
  firstP95ServerMs: number;
  warmMedianServerMs: number;
  warmP95ServerMs: number;
  warmCacheHitRate: number;
  samples: Sample[];
};

type HistoryPoint = Omit<BenchmarkSummary, "samples" | "baseUrl"> & {
  revision: string;
  commit: string;
  subject: string;
  branch: string;
  dirty: boolean;
  target: "local" | "external";
  suiteFingerprint: string;
  caseMetrics: Record<string, {
    previewFirstMs?: number;
    previewWarmMs?: number;
    fullFirstMs?: number;
    fullWarmMs?: number;
    previewTriangles?: number;
    fullTriangles?: number;
    previewBytes?: number;
    fullBytes?: number;
  }>;
};

type RevisionMetadata = Pick<HistoryPoint, "revision" | "commit" | "subject" | "branch" | "dirty">;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PRINTA_BENCH_PORT ?? 4317);
const externalUrl = process.env.PRINTA_BENCH_URL;
const baseUrl = externalUrl ?? `http://127.0.0.1:${port}`;
const serverState: { process: ChildProcess | null } = { process: null };
const generatedResultPathspecs = [
  ":(exclude)benchmarks/results/latest.json",
  ":(exclude)benchmarks/results/history.json",
  ":(exclude)public/benchmarks/history.js",
];

function git(args: string[], fallback = "unknown") {
  try { return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim() || fallback; }
  catch { return fallback; }
}

function suiteFingerprint(samples: Sample[]) {
  const names = [...new Set(samples.map((sample) => sample.name))].sort().join("|");
  return createHash("sha256").update(names).digest("hex").slice(0, 12);
}

function currentRevisionMetadata(): RevisionMetadata {
  const commit = git(["rev-parse", "--short=12", "HEAD"]);
  const subject = git(["show", "-s", "--format=%s", "HEAD"]);
  const branch = git(["branch", "--show-current"], "detached");
  const status = git(["status", "--porcelain", "--untracked-files=all", "--", ".", ...generatedResultPathspecs], "");
  const dirty = Boolean(status);
  const worktree = `${git(["diff", "--binary", "HEAD", "--", ".", ...generatedResultPathspecs], "")}\n${status}`;
  const revision = dirty ? `${commit}+${createHash("sha256").update(worktree).digest("hex").slice(0, 8)}` : commit;
  return { commit, subject, branch, dirty, revision };
}

function compactCaseMetrics(samples: Sample[]) {
  const output: HistoryPoint["caseMetrics"] = {};
  for (const sample of samples) {
    if (sample.pass === "incremental") continue;
    const metrics = output[sample.name] ??= {};
    const latency = Number(sample.serverMs.toFixed(2));
    if (sample.quality === "preview") {
      if (sample.pass === "first") metrics.previewFirstMs = latency;
      else metrics.previewWarmMs = latency;
      metrics.previewTriangles = sample.triangles;
      metrics.previewBytes = sample.bytes;
    } else {
      if (sample.pass === "first") metrics.fullFirstMs = latency;
      else metrics.fullWarmMs = latency;
      metrics.fullTriangles = sample.triangles;
      metrics.fullBytes = sample.bytes;
    }
  }
  return output;
}

function historyPoint(summary: BenchmarkSummary, metadata: RevisionMetadata): HistoryPoint {
  return {
    generatedAt: summary.generatedAt,
    revision: metadata.revision,
    commit: metadata.commit,
    subject: metadata.subject,
    branch: metadata.branch,
    dirty: metadata.dirty,
    target: /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(summary.baseUrl) ? "local" : "external",
    runtime: summary.runtime,
    platform: summary.platform,
    cases: summary.cases,
    builds: summary.builds,
    firstMedianServerMs: summary.firstMedianServerMs,
    firstP95ServerMs: summary.firstP95ServerMs,
    warmMedianServerMs: summary.warmMedianServerMs,
    warmP95ServerMs: summary.warmP95ServerMs,
    warmCacheHitRate: summary.warmCacheHitRate,
    suiteFingerprint: suiteFingerprint(summary.samples),
    caseMetrics: compactCaseMetrics(summary.samples),
  };
}

async function historicalPoints(): Promise<HistoryPoint[]> {
  const commits = git(["log", "--format=%H", "--", "benchmarks/results/latest.json"], "").split("\n").filter(Boolean).reverse();
  const points: HistoryPoint[] = [];
  for (const commit of commits) {
    try {
      const summary = JSON.parse(git(["show", `${commit}:benchmarks/results/latest.json`], "")) as BenchmarkSummary;
      if (!summary.generatedAt || !Array.isArray(summary.samples)) continue;
      points.push(historyPoint(summary, {
        commit: commit.slice(0, 12),
        subject: git(["show", "-s", "--format=%s", commit]),
        branch: "main",
        dirty: false,
        revision: commit.slice(0, 12),
      }));
    } catch {}
  }
  return points;
}

async function updateHistory(summary: BenchmarkSummary, metadata: RevisionMetadata) {
  const resultsDirectory = new URL("./results/", import.meta.url);
  const publicDirectory = new URL("../public/benchmarks/", import.meta.url);
  await Promise.all([mkdir(resultsDirectory, { recursive: true }), mkdir(publicDirectory, { recursive: true })]);
  let history: HistoryPoint[];
  try { history = JSON.parse(await readFile(new URL("history.json", resultsDirectory), "utf8")) as HistoryPoint[]; }
  catch { history = await historicalPoints(); }

  const point = historyPoint(summary, metadata);
  const existing = history.findIndex((item) => item.revision === point.revision && item.suiteFingerprint === point.suiteFingerprint);
  if (existing >= 0) history[existing] = point;
  else history.push(point);
  history.sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));

  const compatible = history.filter((item) => item.suiteFingerprint === point.suiteFingerprint && item.revision !== point.revision);
  const baseline = compatible.at(-1);
  if (baseline) {
    const delta = (value: number, previous: number) => previous ? (value - previous) / previous * 100 : 0;
    console.log(`Compared with ${baseline.revision}: warm median ${delta(point.warmMedianServerMs, baseline.warmMedianServerMs).toFixed(1)}% · warm p95 ${delta(point.warmP95ServerMs, baseline.warmP95ServerMs).toFixed(1)}% · first median ${delta(point.firstMedianServerMs, baseline.firstMedianServerMs).toFixed(1)}%`);
  } else {
    console.log("No prior compatible benchmark suite found; recorded a new baseline.");
  }

  const json = `${JSON.stringify(history, null, 2)}\n`;
  await Promise.all([
    writeFile(new URL("history.json", resultsDirectory), json),
    writeFile(new URL("history.js", publicDirectory), `window.PRINTA_BENCHMARK_HISTORY = ${JSON.stringify(history)};\n`),
  ]);
  console.log(`Updated benchmark history (${history.length} runs) and public/benchmarks/history.js`);
}

function parseMetric(header: string | null, key: string) {
  const match = header?.match(new RegExp(`${key}=([0-9]+)`));
  return Number(match?.[1] ?? 0);
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function waitForServer() {
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Benchmark server did not start at ${baseUrl}. Run npm run build first.`);
}

async function startServer() {
  if (externalUrl) return;
  serverState.process = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  serverState.process.stdout?.on("data", (chunk) => { diagnostics += String(chunk); });
  serverState.process.stderr?.on("data", (chunk) => { diagnostics += String(chunk); });
  serverState.process.once("exit", (code) => {
    if (code && !serverState.process?.killed && diagnostics) process.stderr.write(diagnostics);
  });
  await waitForServer();
}

async function build(name: string, spec: unknown, quality: Quality, pass: Sample["pass"]): Promise<Sample> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/model/stl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec, preview: quality === "preview" }),
  });
  const bytes = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${name} (${quality}) failed: ${new TextDecoder().decode(bytes)}`);
  const triangles = Number(response.headers.get("X-Printa-Triangles") ?? 0);
  const dimensionsMm = (response.headers.get("X-Printa-Dimensions") ?? "").split(",").map(Number) as [number, number, number];
  if (bytes.byteLength <= 84 || !Number.isFinite(triangles) || triangles <= 0) throw new Error(`${name} (${quality}) returned an invalid STL.`);
  if (dimensionsMm.length !== 3 || dimensionsMm.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error(`${name} (${quality}) returned invalid dimensions.`);
  const expected = (spec as { metadata?: { expectedBoundsMm?: string } }).metadata?.expectedBoundsMm?.split(",").map(Number);
  if (expected?.length === 3 && expected.some((value, index) => Math.abs(value - dimensionsMm[index]) > 0.02)) {
    throw new Error(`${name} (${quality}) dimensions ${dimensionsMm.join(" × ")} mm do not match expected ${expected.join(" × ")} mm.`);
  }
  const serverTiming = response.headers.get("Server-Timing")?.match(/dur=([0-9.]+)/);
  const cache = response.headers.get("X-Printa-Cache");
  return {
    name,
    quality,
    pass,
    wallMs: performance.now() - startedAt,
    serverMs: Number(serverTiming?.[1] ?? 0),
    triangles,
    bytes: bytes.byteLength,
    cacheHits: parseMetric(cache, "hit"),
    cacheMisses: parseMetric(cache, "miss"),
    dimensionsMm,
  };
}

function printTable(samples: Sample[]) {
  const heading = ["case", "quality", "pass", "server ms", "wall ms", "triangles", "STL KB", "cache h/m"];
  const rows = samples.map((sample) => [
    sample.name, sample.quality, sample.pass, sample.serverMs.toFixed(1), sample.wallMs.toFixed(1),
    sample.triangles.toLocaleString("en-US"), (sample.bytes / 1024).toFixed(1), `${sample.cacheHits}/${sample.cacheMisses}`,
  ]);
  const widths = heading.map((value, column) => Math.max(value.length, ...rows.map((row) => row[column].length)));
  const line = (row: string[]) => row.map((value, column) => value.padEnd(widths[column])).join("  ");
  console.log(line(heading));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  rows.forEach((row) => console.log(line(row)));
}

async function main() {
  const revisionMetadata = currentRevisionMetadata();
  await startServer();
  const samples: Sample[] = [];
  for (const [name, spec] of Object.entries(BENCHMARK_SPECS)) {
    samples.push(await build(name, spec, "preview", "first"));
    samples.push(await build(name, spec, "preview", "warm"));
    samples.push(await build(name, spec, "full", "first"));
    samples.push(await build(name, spec, "full", "warm"));
  }

  const incremental = JSON.parse(JSON.stringify(BENCHMARK_SPECS["deep-repeat-graph"])) as { root: { step: { translate: [number, number, number] } } };
  incremental.root.step.translate[0] += 0.15;
  samples.push(await build("deep-repeat-graph", incremental, "preview", "incremental"));

  printTable(samples);
  const warm = samples.filter((sample) => sample.pass === "warm");
  const first = samples.filter((sample) => sample.pass === "first");
  const summary: BenchmarkSummary = {
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    platform: `${process.platform}-${process.arch}`,
    baseUrl,
    cases: Object.keys(BENCHMARK_SPECS).length,
    builds: samples.length,
    firstMedianServerMs: percentile(first.map((sample) => sample.serverMs), 0.5),
    firstP95ServerMs: percentile(first.map((sample) => sample.serverMs), 0.95),
    warmMedianServerMs: percentile(warm.map((sample) => sample.serverMs), 0.5),
    warmP95ServerMs: percentile(warm.map((sample) => sample.serverMs), 0.95),
    warmCacheHitRate: warm.reduce((sum, sample) => sum + sample.cacheHits, 0) / Math.max(1, warm.reduce((sum, sample) => sum + sample.cacheHits + sample.cacheMisses, 0)),
    samples,
  };
  const uncachedWarm = warm.filter((sample) => sample.cacheHits < 1);
  const slowWarm = warm.filter((sample) => sample.serverMs > 500);
  if (uncachedWarm.length) throw new Error(`Warm-cache regression: ${uncachedWarm.map((sample) => `${sample.name}/${sample.quality}`).join(", ")}`);
  if (slowWarm.length) throw new Error(`Warm-build budget exceeded: ${slowWarm.map((sample) => `${sample.name}/${sample.quality} ${sample.serverMs.toFixed(1)}ms`).join(", ")}`);
  console.log(`\n${summary.cases} cases · ${summary.builds} builds · first median ${summary.firstMedianServerMs.toFixed(1)} ms · warm median ${summary.warmMedianServerMs.toFixed(1)} ms · warm cache ${(summary.warmCacheHitRate * 100).toFixed(1)}%`);
  const outputDirectory = new URL("./results/", import.meta.url);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(new URL("latest.json", outputDirectory), `${JSON.stringify(summary, null, 2)}\n`);
  await updateHistory(summary, revisionMetadata);
  console.log("Wrote benchmarks/results/latest.json");
}

try {
  await main();
} finally {
  if (serverState.process && !serverState.process.killed) serverState.process.kill("SIGTERM");
}
