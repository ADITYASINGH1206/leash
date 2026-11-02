/**
 * Records the offline sample data from a real gateway run.
 *   1. start the gateway:  pnpm --filter @leash/gateway dev
 *   2. run:                pnpm --filter @leash/console record-sample
 * Writes src/data/sample-ledger.json and src/data/sample-transactions.json.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runJudgeWalkthrough } from '../src/lib/judge';
import { gateway } from '../src/lib/api';

const out = (name: string) => fileURLToPath(new URL(`../src/data/${name}`, import.meta.url));

const result = await runJudgeWalkthrough(
  (key, patch) => {
    if (patch.state === 'done' || patch.state === 'failed') {
      console.log(`${key.padEnd(8)} ${patch.state} ${patch.outcome ?? ''} ${patch.summary ?? patch.error ?? ''}`);
    }
  },
  { pauseMs: 0 },
);
if (!result.ok) {
  console.error('Walkthrough failed; sample not written.');
  process.exit(1);
}
const txs = await gateway.transactions();
writeFileSync(out('sample-ledger.json'), JSON.stringify(result.ledger, null, 2) + '\n');
writeFileSync(out('sample-transactions.json'), JSON.stringify(txs, null, 2) + '\n');
console.log(`Wrote ${result.ledger.length} ledger rows and ${txs.length} transactions.`);
