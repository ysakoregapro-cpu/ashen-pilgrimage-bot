/** inn-price-cap-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { calcInnCostForProgressTier } from '../src/systems/innSystem';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'progress_tier', 'highest_unlocked_town', 'current_town', 'inn_price',
  'min_allowed', 'max_allowed', 'uses_progress', 'within_cap', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('inn-price-cap-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('inn-price-cap-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const db = init.db;
  const towns = db.prepare('SELECT id, name, required_level FROM towns ORDER BY required_level').all() as Array<{
    id: string; name: string; required_level: number;
  }>;

  const rows: string[][] = [];
  for (const town of towns) {
    const price = calcInnCostForProgressTier(town.required_level);
    const within = price >= 100 && price <= 400;
    if (price > 400) result.fails.push(`${town.id}: ${price}G > 400`);
    if (price < 100 && town.required_level >= 1) result.fails.push(`${town.id}: ${price}G < 100`);

    rows.push([
      String(town.required_level), town.id, town.id, String(price), '100', '400', 'YES',
      within ? 'OK' : 'FAIL', town.name,
    ]);
  }

  writeMdCsvPair('inn-price-cap-audit', HEADERS, rows, ['## Summary', '', `- fails: ${result.fails.length}`]);
  exitCheckResult('inn-price-cap-audit', result);
}

main();
