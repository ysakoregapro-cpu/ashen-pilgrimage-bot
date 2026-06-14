/** rescue-hp-scaling-audit.ts */
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { scaledRescueEnemyHp } from '../src/systems/coop/rescueMonsterContext';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'monster_id', 'monster_name', 'participants', 'base_hp', 'scaled_hp',
  'expected_multiplier', 'actual_multiplier', 'match_ok', 'balance_note',
];

const EXPECTED: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.4 };

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-hp-scaling-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-hp-scaling-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const rows: string[][] = [];
  const baseHp = 1000;

  for (const participants of [1, 2, 3, 4]) {
    const scaled = scaledRescueEnemyHp(baseHp, participants, {
      source_enemy_max_hp: baseHp,
      source_enemy_hp: 800,
    });
    const expMult = EXPECTED[participants] ?? 2.4;
    const actMult = scaled.maxHp / baseHp;
    const ok = Math.abs(actMult - expMult) < 0.01;
    if (!ok) result.fails.push(`${participants}p: mult ${actMult.toFixed(2)} != ${expMult}`);

    rows.push([
      'mon_furnace_defense', '炉心防衛ユニット', String(participants), String(baseHp),
      String(scaled.maxHp), expMult.toFixed(2), actMult.toFixed(2), ok ? 'OK' : 'FAIL',
      `current=${scaled.currentHp}`,
    ]);
  }

  writeMdCsvPair('rescue-hp-scaling-audit', HEADERS, rows, [
    '## Summary', '', `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('rescue-hp-scaling-audit', result);
}

main();
