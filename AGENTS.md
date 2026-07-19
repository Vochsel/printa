# Printa engineering instructions

## Benchmarks are part of the definition of done

Always implement performance-sensitive work together with benchmark coverage and compare the result with an existing compatible baseline. This applies to geometry sources and modifiers, model-spec parsing, graph evaluation, caching, dimensions, STL generation, MCP previews, editor previews, and related hot paths.

Before changing one of those paths, inspect `benchmarks/results/latest.json`, `benchmarks/results/history.json`, and `/benchmarks/index.html` when available. Add or extend a fixture in `benchmarks/specs.ts` when a feature, regression, or representative complexity is not already covered. A benchmark must exercise the real production HTTP build path and must not replace correctness tests.

After the implementation:

1. Run `npm run benchmark`; do not create or edit benchmark outputs manually.
2. Compare the new point with the most recent compatible suite in the console and static report.
3. Report cases/builds, first median and p95, warm median and p95, cache-hit rate, and the affected workload metrics.
4. Investigate any latency regression larger than both 15% and 5 ms. Do not silently accept it; fix it or explicitly document the measured tradeoff.
5. Never weaken fixtures, precision, mesh quality, or budgets merely to make a benchmark pass.
6. Run `npm test` and `npm run lint` before handoff.

Commit generated `latest.json`, `history.json`, and `public/benchmarks/history.js` only when they came from a successful benchmark run representing the committed implementation. If a change cannot affect performance, say why a benchmark rerun was unnecessary; do not invent measurements.
