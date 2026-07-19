import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PRINTA_BENCH_PORT ?? 4317);
const externalUrl = process.env.PRINTA_BENCH_URL;
const baseUrl = externalUrl ?? `http://127.0.0.1:${port}`;
const serverState: { process: ChildProcess | null } = { process: null };

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
  const summary = {
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
  console.log("Wrote benchmarks/results/latest.json");
}

try {
  await main();
} finally {
  if (serverState.process && !serverState.process.killed) serverState.process.kill("SIGTERM");
}
