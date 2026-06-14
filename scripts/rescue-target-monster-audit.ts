/** rescue-target-monster-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  enrichRescueContext,
  resolveRescueMonsterId,
  snapshotFromBattleSession,
} from '../src/systems/coop/rescueMonsterContext';
import { getRecruitTargetLabel } from '../src/systems/coop/coopRecruitSystem';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'case_id', 'source_monster_id', 'source_monster_name', 'recruit_target_monster_id',
  'recruit_target_name', 'battle_monster_id', 'battle_monster_name', 'uses_fallback', 'match_ok', 'balance_note',
];

const CASES = [
  { id: 'mon_furnace_defense', name: '炉心防衛ユニット' },
  { id: 'mon_deep_core_boss', name: '深層炉心核' },
  { id: 'mon_bandit', name: '野盗見習い' },
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-target-monster-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-target-monster-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const rows: string[][] = [];

  for (const c of CASES) {
    const ctx = enrichRescueContext({
      rescue_type: 'battle',
      monster_id: c.id,
      monster_name: c.name,
      battle_session_id: `test_${c.id}`,
    }, 'audit_user');
    const resolved = resolveRescueMonsterId(ctx);
    const label = getRecruitTargetLabel('rescue', ctx);
    const match = resolved.monsterId === c.id && label.includes(c.name);
    if (!match) result.fails.push(`${c.id}: recruit=${resolved.monsterId} label=${label}`);
    if (resolved.usesFallback) result.fails.push(`${c.id}: unexpected fallback`);

    rows.push([
      c.id, c.id, c.name, resolved.monsterId, resolved.monsterName,
      resolved.monsterId, resolved.monsterName,
      resolved.usesFallback ? 'YES' : 'NO', match ? 'OK' : 'FAIL', resolved.resolution,
    ]);
  }

  const snap = snapshotFromBattleSession('nonexistent');
  if (snap) result.warns.push('nonexistent session returned snapshot');

  writeMdCsvPair('rescue-target-monster-audit', HEADERS, rows, [
    '## Summary', '', `- cases: ${rows.length}`, `- fails: ${result.fails.length}`,
    '', '## Notes', '', '- mon_bandit は fallback のみ（通常 battle_session / monster_id 必須）',
  ]);
  exitCheckResult('rescue-target-monster-audit', result);
}

main();
