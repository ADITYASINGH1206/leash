// Copies the latest AgentPay-Bench results into the console so the benchmark
// page always shows what the runner last produced (never hand-typed numbers).
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../../bench/results/summary.json', import.meta.url));
const dest = fileURLToPath(new URL('../src/data/bench-summary.json', import.meta.url));
if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log('bench summary synced');
} else {
  console.warn('bench/results/summary.json not found; keeping existing copy');
}
