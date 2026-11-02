export interface BenchmarkScenario {
  id: string;
  family: string;
  intent: string;
  expectedVerdict: 'ALLOW' | 'HOLD' | 'BLOCK';
}

export function loadScenario(id: string): BenchmarkScenario {
  return {
    id,
    family: 'control',
    intent: 'Buy USB-C case under $20',
    expectedVerdict: 'ALLOW'
  };
}
