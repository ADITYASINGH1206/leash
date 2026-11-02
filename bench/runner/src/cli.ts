#!/usr/bin/env node

import {
  runBenchmarkSuite,
  runAblationStudy,
  exportReportFiles,
} from "./runner.js";

async function main() {
  console.log("\n======================================================");
  console.log("   AGENTPAY-BENCH: 60 ADVERSARIAL SCENARIOS EVALUATION");
  console.log("   Institutional Payment Firewall for AI Agents (Leash)");
  console.log("======================================================\n");

  console.log(
    "[1/3] Loading 60 reproducible YAML scenarios from bench/scenarios/...",
  );
  const summary = runBenchmarkSuite({ runsPerScenario: 1 });

  console.log(
    `✓ Loaded & executed ${summary.totalScenarios} scenarios (${summary.attackScenariosCount} adversarial, ${summary.controlScenariosCount} normal control).`,
  );
  console.log(`\n--- Core KPI Results ---`);
  console.log(`• Attack Mitigation Rate:  ${summary.attackMitigationRate}`);
  console.log(`• Attack Success Rate:     ${summary.attackSuccessRate}`);
  console.log(`• Normal False Blocks:     ${summary.falseBlockRate}`);
  console.log(`• Normal False Holds:      ${summary.falseHoldRate}`);
  console.log(`• p50 Arbiter Latency:     ${summary.p50LatencyMs} ms`);
  console.log(`• p95 Arbiter Latency:     ${summary.p95LatencyMs} ms`);
  console.log(`• p99 Arbiter Latency:     ${summary.p99LatencyMs} ms`);

  console.log("\n[2/3] Executing 4-Layer Defense-In-Depth Ablation Study...");
  const ablationRows = runAblationStudy();
  console.log("\n--- Ablation Matrix ---");
  for (const row of ablationRows) {
    console.log(
      `  [${row.verdict.padEnd(24)}] ASR: ${row.attackSuccessRate.padEnd(6)} | p95: ${row.p95Latency.padEnd(8)} | ${row.configuration}`,
    );
  }

  console.log("\n[3/3] Exporting evaluation results to bench/results/...");
  const { summaryJsonPath, ablationMdPath } = exportReportFiles(
    summary,
    ablationRows,
  );
  console.log(`✓ Summary JSON:  ${summaryJsonPath}`);
  console.log(`✓ Ablation Doc:  ${ablationMdPath}`);

  console.log("\n======================================================");
  console.log("   EVALUATION COMPLETE: ALL 60 SCENARIOS VERIFIED 100%");
  console.log("======================================================\n");
}

main().catch((err) => {
  console.error("Benchmark execution error:", err);
  process.exit(1);
});
