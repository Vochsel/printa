# Model build benchmarks

The suite measures the production HTTP build path used by the editor and MCP. It validates every returned binary STL and records server compile time, end-to-end time, triangle count, payload size, and graph-cache behavior.

```bash
npm run benchmark
```

Use `npm run benchmark:model` after an existing production build. Set `PRINTA_BENCH_URL` to measure an already-running deployment instead of starting a local server.

Coverage includes all six source families, all five primitives, all seven modifiers, every curve command, all three interior-strut patterns, full typography styling, assemblies, nested repeats, transforms, unit scaling, water and cloth simulation, preview/full quality, cold/warm passes, and an incremental child edit. Primitive and OpenType text cases include explicit non-uniform outer dimensions, so dimensional normalization is exercised in both preview and full STL builds. A dense 149,888-triangle MCP vase fixture protects the large-model widget path that previously remained on “Evaluating model graph…”. Warm builds must hit the graph cache and stay below the suite's regression budget.

Each successful run updates three artifacts:

- `benchmarks/results/latest.json` contains the complete latest run and every sample.
- `benchmarks/results/history.json` contains the compact, commit-tagged time series.
- `public/benchmarks/history.js` feeds the dependency-free static report at `/benchmarks/index.html` and also lets the report work when opened directly from disk.

The runner seeds history from earlier committed `latest.json` reports when needed, then compares the new result with the most recent run that has the same suite fingerprint. Its console summary reports first-build and warm-cache deltas. The report charts suite and workload history, supports explicit compatible-baseline selection, and flags latency regressions larger than both 15% and 5 ms for review.

Do not edit generated benchmark result files by hand. Run the suite, inspect the console comparison, and use the static report to understand whether a change is a real regression, ordinary measurement noise, or an intentional tradeoff.
