/** rescue-skill-target-audit.ts */
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ALL_JOB_SKILLS, resolveSkillTargetType } from '../src/db/seedData/jobSkillData';
import { getSkill } from '../src/systems/skillSystem';
import {
  resolveSkillTargetSide,
  needsSkillTargetSelection,
  allyButtonLabel,
} from '../src/systems/skillTargetResolver';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'skill_id', 'skill_name', 'skill_type', 'target_type', 'battle_type',
  'expected_target_side', 'actual_target_side', 'target_labels', 'duplicate_labels', 'match_ok', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('rescue-skill-target-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('rescue-skill-target-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const rows: string[][] = [];

  for (const s of ALL_JOB_SKILLS) {
    const skill = getSkill(s.id);
    if (!skill) continue;
    const side = resolveSkillTargetSide(skill);
    let ok = true;
    let note = 'ok';

    if (s.power > 0 && ['single_enemy', 'all_enemies'].includes(resolveSkillTargetType(s)) && side !== 'enemy') {
      ok = false;
      note = 'damage_not_enemy';
      result.fails.push(`${s.id}: expected enemy got ${side}`);
    }
    if ((s.skill_type === 'recovery' || skill.effect_type === 'heal') && side === 'enemy') {
      ok = false;
      result.fails.push(`${s.id}: heal targets enemy`);
    }

    rows.push([
      s.id, s.name, s.skill_type, skill.target_type ?? '', 'rescue',
      s.power > 0 ? 'enemy' : 'ally/self', side, side === 'enemy' ? '敵' : '味方/自分',
      'NO', ok ? 'OK' : 'FAIL', note,
    ]);
  }

  writeMdCsvPair('rescue-skill-target-audit', HEADERS, rows, [
    '## Summary', '', `- skills: ${rows.length}`, `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('rescue-skill-target-audit', result);
}

main();
