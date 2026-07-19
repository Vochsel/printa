# Printa repository guidance

Treat benchmark implementation and comparison as mandatory engineering work, not optional follow-up. Any change that can affect model parsing, geometry, modifiers, graph evaluation, caching, exact dimensions, preview generation, MCP rendering, or STL output must preserve or extend the representative cases in `benchmarks/specs.ts`.

Use this workflow every time:

- Inspect the current benchmark baseline and history before editing performance-sensitive code.
- Add a benchmark fixture for every new feature or reproduced performance failure that is not already represented.
- Run `npm run benchmark` after implementation. The command must generate the result artifacts; never hand-edit them.
- Compare against the most recent compatible suite using the console output and `/benchmarks/index.html`.
- Include cases/builds, first median/p95, warm median/p95, warm cache-hit rate, and relevant per-workload changes in the handoff.
- Investigate a regression that exceeds both 15% and 5 ms. Optimize it or clearly document why the measured tradeoff is intentional.
- Never reduce coverage, dimensional precision, mesh fidelity, or performance budgets to manufacture an improvement.
- Finish with `npm test` and `npm run lint`.

The benchmark files are documented in `benchmarks/README.md`. Correctness tests and benchmarks are both required: one cannot substitute for the other.
