export interface ScenarioCartItem {
  name: string;
  unit_amount: string;
  qty: number;
  category: string;
  sku?: string;
}

export interface ScenarioMandate {
  mandate_id: string;
  max_amount: string;
  currency: string;
  categories: string[];
}

export interface ScenarioCart {
  merchant_id: string;
  merchant_name?: string;
  total: string;
  currency: string;
  items: ScenarioCartItem[];
}

export interface ScenarioEvidence {
  url: string;
  page_html?: string;
}

export interface ScenarioExpectedOutcome {
  verdict: "ALLOW" | "HOLD" | "BLOCK";
  primary_layer?: string;
  failure_code?: string;
  hold_reason?: string;
  reason?: string;
}

export interface BenchmarkScenario {
  id: string;
  family:
    | "normal_control"
    | "hidden_injection"
    | "review_injection"
    | "rogue_merchant"
    | "scope_drift"
    | "price_manipulation"
    | "split_transaction"
    | "replay_expired"
    | "concurrency_race"
    | "tool_hijack";
  intent: string;
  mandate: ScenarioMandate;
  cart: ScenarioCart;
  rationale: string;
  evidence: ScenarioEvidence;
  expected_outcome: ScenarioExpectedOutcome;
  attack_type?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  family: string;
  actualVerdict: "ALLOW" | "HOLD" | "BLOCK";
  expectedVerdict: "ALLOW" | "HOLD" | "BLOCK";
  passed: boolean;
  mitigated: boolean;
  latencyMs: number;
  layers: {
    layer0Budget?: string;
    layer1Policy?: string;
    layer2Provenance?: string;
    layer3Intent?: string;
    layer4Risk?: string;
  };
}

export interface FamilyMetrics {
  total: number;
  mitigated: number;
  passRate: string;
  meanLatencyMs: number;
  primaryDefense: string;
  badge: string;
}

export interface BenchmarkSuiteSummary {
  totalScenarios: number;
  totalRuns: number;
  attackScenariosCount: number;
  controlScenariosCount: number;
  attackMitigationRate: string;
  attackSuccessRate: string;
  falsePositiveRate: string;
  falseHoldRate: string;
  falseBlockRate: string;
  meanLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  familyBreakdown: Record<string, FamilyMetrics>;
  timestamp: string;
  results: ScenarioResult[];
}

export interface LayerAblationResult {
  configuration: string;
  activeLayers: string[];
  attackSuccessRate: string;
  p95Latency: string;
  verdict: string;
  statusColor: string;
  defenseGrade: string;
}
