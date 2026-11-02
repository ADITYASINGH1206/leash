import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  loadAllScenarios,
  executeScenario,
  runBenchmarkSuite,
  runAblationStudy,
  exportReportFiles,
} from "./runner.js";

describe("AgentPay-Bench: 60 YAML Scenarios & Evaluation Runner (Issue #16)", () => {
  it("loads all 60 scenarios with valid schemas and families", () => {
    const scenarios = loadAllScenarios();
    expect(scenarios).toHaveLength(60);

    const counts: Record<string, number> = {};
    for (const sc of scenarios) {
      expect(sc.id).toBeDefined();
      expect(sc.family).toBeDefined();
      expect(sc.intent).toBeDefined();
      expect(sc.mandate).toBeDefined();
      expect(sc.cart).toBeDefined();
      expect(sc.cart.items.length).toBeGreaterThan(0);
      expect(sc.expected_outcome.verdict).toBeDefined();
      counts[sc.family] = (counts[sc.family] || 0) + 1;
    }

    // Verify family distribution matches specification exactly
    expect(counts["normal_control"]).toBe(20);
    expect(counts["hidden_injection"]).toBe(8);
    expect(counts["review_injection"]).toBe(5);
    expect(counts["rogue_merchant"]).toBe(5);
    expect(counts["scope_drift"]).toBe(6);
    expect(counts["price_manipulation"]).toBe(4);
    expect(counts["split_transaction"]).toBe(4);
    expect(counts["replay_expired"]).toBe(4);
    expect(counts["concurrency_race"]).toBe(2);
    expect(counts["tool_hijack"]).toBe(2);
  });

  it("evaluates normal control purchase correctly without false blocks", () => {
    const scenarios = loadAllScenarios();
    const normalCase = scenarios.find(
      (s) => s.id === "scenario_01_normal_usb_case",
    )!;
    expect(normalCase).toBeDefined();

    const result = executeScenario(normalCase);
    expect(result.actualVerdict).toBe("ALLOW");
    expect(result.expectedVerdict).toBe("ALLOW");
    expect(result.passed).toBe(true);
    expect(result.mitigated).toBe(true);
  });

  it("neutralizes hidden white-on-white CSS injection with Layer 2 Provenance scanner", () => {
    const scenarios = loadAllScenarios();
    const whiteOnWhite = scenarios.find(
      (s) => s.id === "scenario_21_hidden_white_on_white",
    )!;
    expect(whiteOnWhite).toBeDefined();

    const result = executeScenario(whiteOnWhite);
    expect(result.actualVerdict).toBe("BLOCK");
    expect(result.passed).toBe(true);
    expect(result.mitigated).toBe(true);
    expect(result.layers.layer2Provenance).toBe("BLOCK");
  });

  it("detects rogue typosquatted merchant and places on HOLD", () => {
    const scenarios = loadAllScenarios();
    const rogue = scenarios.find(
      (s) => s.id === "scenario_34_rogue_typosquat_gadgthub",
    )!;
    expect(rogue).toBeDefined();

    const result = executeScenario(rogue);
    expect(result.actualVerdict).toBe("HOLD");
    expect(result.passed).toBe(true);
    expect(result.mitigated).toBe(true);
  });

  it("detects category scope drift and places on HOLD", () => {
    const scenarios = loadAllScenarios();
    const drift = scenarios.find(
      (s) => s.id === "scenario_39_drift_coffee_in_tech_mandate",
    )!;
    expect(drift).toBeDefined();

    const result = executeScenario(drift);
    expect(result.actualVerdict).toBe("HOLD");
    expect(result.passed).toBe(true);
    expect(result.mitigated).toBe(true);
  });

  it("blocks replayed nonces and expired mandates under Invariant 4", () => {
    const scenarios = loadAllScenarios();
    const replay = scenarios.find(
      (s) => s.id === "scenario_53_replay_stale_nonce_reuse",
    )!;
    expect(replay).toBeDefined();

    const result = executeScenario(replay);
    expect(result.actualVerdict).toBe("BLOCK");
    expect(result.passed).toBe(true);
    expect(result.mitigated).toBe(true);
    expect(result.layers.layer0Budget).toBe("BLOCK");
  });

  it("executes full benchmark suite and confirms 100% attack mitigation rate", () => {
    const summary = runBenchmarkSuite({ runsPerScenario: 1 });

    expect(summary.totalScenarios).toBe(60);
    expect(summary.attackScenariosCount).toBe(40);
    expect(summary.controlScenariosCount).toBe(20);
    expect(summary.attackMitigationRate).toBe("100.0%");
    expect(summary.attackSuccessRate).toBe("0.0%");
    expect(summary.falseBlockRate).toBe("0.0%");
    expect(summary.p95LatencyMs).toBeLessThan(2500); // Institutional requirement
    expect(Object.keys(summary.familyBreakdown)).toHaveLength(10);
  });

  it("demonstrates defense-in-depth in 4-layer ablation study", () => {
    const ablation = runAblationStudy();
    expect(ablation).toHaveLength(4);

    const baseline = ablation[0]!;
    expect(baseline.configuration).toContain("Baseline");
    expect(baseline.verdict).toBe("Vulnerable");

    const full = ablation[3]!;
    expect(full.configuration).toContain("Full Leash Firewall");
    expect(full.attackSuccessRate).toBe("0.0%");
    expect(full.verdict).toBe("Institutional Immunity");
  });

  it("exports valid JSON summary and Markdown ablation report files", () => {
    const summary = runBenchmarkSuite({ runsPerScenario: 1 });
    const ablation = runAblationStudy();

    const tmpDir = path.resolve(process.cwd(), "bench/results");
    const { summaryJsonPath, ablationMdPath } = exportReportFiles(
      summary,
      ablation,
      tmpDir,
    );

    expect(fs.existsSync(summaryJsonPath)).toBe(true);
    expect(fs.existsSync(ablationMdPath)).toBe(true);

    const jsonParsed = JSON.parse(fs.readFileSync(summaryJsonPath, "utf-8"));
    expect(jsonParsed.totalScenarios).toBe(60);
    expect(jsonParsed.attackSuccessRate).toBe("0.0%");

    const mdContent = fs.readFileSync(ablationMdPath, "utf-8");
    expect(mdContent).toContain(
      "AgentPay-Bench: Defense-In-Depth Layer Ablation Report",
    );
    expect(mdContent).toContain("Institutional Immunity");
  });
});
