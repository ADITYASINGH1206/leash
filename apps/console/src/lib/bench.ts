/**
 * AgentPay-Bench results, copied from bench/results/summary.json at build time
 * (scripts/sync-bench.mjs). The console never types benchmark numbers by hand.
 */
import summary from '../data/bench-summary.json';

export interface BenchFamily {
  total: number;
  mitigated: number;
  passRate: string;
  meanLatencyMs: number;
  primaryDefense: string;
  badge: string;
}

export interface BenchResult {
  scenarioId: string;
  family: string;
  actualVerdict: 'ALLOW' | 'HOLD' | 'BLOCK';
  expectedVerdict: 'ALLOW' | 'HOLD' | 'BLOCK';
  passed: boolean;
  mitigated: boolean;
  latencyMs: number;
  layers: Record<string, string>;
}

export interface BenchAblationRow {
  configuration: string;
  activeLayers: string[];
  attackSuccessRate: string;
  p95Latency: string;
}

export interface BenchSummary {
  totalScenarios: number;
  attackScenariosCount: number;
  controlScenariosCount: number;
  attackMitigationRate: string;
  attackSuccessRate: string;
  falseHoldRate: string;
  falseBlockRate: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  timestamp: string;
  familyBreakdown: Record<string, BenchFamily>;
  results: BenchResult[];
  ablation?: BenchAblationRow[];
}

export const bench = summary as unknown as BenchSummary;

export const FAMILY_NAMES: Record<string, string> = {
  normal_control: 'Normal purchases',
  hidden_injection: 'Hidden text on a product page',
  review_injection: 'Injection in reviews or Q&A',
  rogue_merchant: 'Look-alike merchant',
  scope_drift: 'Scope drift',
  price_manipulation: 'Price manipulation',
  split_transaction: 'Splitting under a threshold',
  replay_expired: 'Replay and expiry',
  concurrency_race: 'Parallel race for the budget',
  tool_hijack: 'Goal hijack through a tool result',
};

export const ABLATION_NAMES: Record<string, string> = {
  'Baseline (Raw LLM Only, No Leash)': 'No Leash',
  'Leash (Layer 1 CEL Policy Only)': 'Policy rules only',
  'Leash (L1 Policy + L2 Provenance Scanner)': 'Policy and provenance',
  'Full Leash Firewall (L0 + L1 + L2 + L3 + L4)': 'All five checks',
};

export const pct = (s: string) => Number.parseFloat(s) || 0;

export const BENCH_METHOD_NOTE =
  'Produced by the AgentPay-Bench runner, which scores each scenario with its own rule-based model of the five checks. ' +
  'It is not yet wired to the live decision engine, so treat these as a test of the scenario set rather than a measurement of the gateway.';
