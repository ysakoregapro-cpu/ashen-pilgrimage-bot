/** skill-mp-cost-design-audit.ts — npx tsx scripts/skill-mp-cost-design-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ALL_JOB_SKILLS, resolveSkillTargetType } from '../src/db/seedData/jobSkillData';
import {
  designSkillMpCost,
  learnLevelForSkill,
  skillDesignMeta,
  MAGIC_JOBS,
  type MpCostTier,
} from '../src/systems/mpCostDesign';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'skill_id', 'skill_name', 'job_id', 'job_name', 'skill_type', 'target_type', 'hits', 'power',
  'scaling_stat', 'mp_before', 'mp_after', 'expected_action_value', 'normal_attack_ratio',
  'value_per_mp', 'expected_level_band', 'max_mp_at_band', 'mp_percent_of_max', 'decision', 'balance_note',
];

function fourTurnRange(tier: MpCostTier): { min: number; max: number } {
  switch (tier) {
    case 'low': return { min: 18, max: 30 };
    case 'main': return { min: 30, max: 45 };
    case 'high': return { min: 45, max: 65 };
    case 'ultimate': return { min: 65, max: 100 };
    default: return { min: 15, max: 45 };
  }
}

function isLowMpHighPower(mp: number, ratio: number): boolean {
  if (ratio >= 2.0 && mp <= 8) return true;
  if (ratio >= 1.65 && mp <= 6) return true;
  return false;
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('skill-mp-cost-design-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('skill-mp-cost-design-audit', result);
    return;
  }

  const { db } = init;
  ensurePhase2Seed(db);
  const rows: string[][] = [];

  for (const s of ALL_JOB_SKILLS) {
    const learnLv = learnLevelForSkill(s.id, s.job);
    const meta = skillDesignMeta(s, learnLv);
    const row = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get(s.id) as { mp_cost: number } | undefined;
    const mpBefore = row?.mp_cost ?? s.mp;
    const mpAfter = meta.mpAfter;

    if (mpBefore !== mpAfter) {
      result.warns.push(`${s.id} DB mp ${mpBefore} != design ${mpAfter}`);
    }

    let decision = 'OK';
    let note = meta.tier;

    if (s.power > 0 && meta.tier !== 'utility') {
      if (isLowMpHighPower(mpAfter, meta.normalAttackRatio)) {
        decision = 'FAIL';
        note = '低MP高火力';
        result.fails.push(`${s.id}: 低MP(${mpAfter})高action(${meta.actionValue.toFixed(2)})`);
      }
      if (meta.tier === 'high' && meta.mpPercent < 10 && s.power >= 1.25) {
        decision = 'FAIL';
        note = '高火力MP軽すぎ';
        result.fails.push(`${s.id}: 高火力MP%=${meta.mpPercent.toFixed(1)}`);
      }
      if (meta.tier === 'ultimate' && mpAfter < 55) {
        decision = 'FAIL';
        note = '奥義MP不足';
        result.fails.push(`${s.id}: ultimate MP${mpAfter}`);
      }
    }

    if (MAGIC_JOBS.has(s.job) && mpAfter < mpBefore && mpBefore > 0) {
      result.warns.push(`${s.id}: mage MP reduced ${mpBefore}->${mpAfter}`);
    }

    rows.push([
      s.id, s.name, `job_${s.job}`, s.job, s.skill_type,
      resolveSkillTargetType(s), String(s.hits ?? 1), String(s.power), s.scaling_stat,
      String(mpBefore), String(mpAfter), meta.actionValue.toFixed(3), meta.normalAttackRatio.toFixed(3),
      meta.valuePerMp.toFixed(4), meta.band.label, String(meta.maxMp), meta.mpPercent.toFixed(1),
      decision, note,
    ]);
  }

  writeMdCsvPair(
    'skill-mp-cost-design-audit',
    HEADERS,
    rows,
    [
      '## Summary',
      '',
      `- skills: ${rows.length}`,
      `- fails: ${result.fails.length}`,
      `- warns: ${result.warns.length}`,
      '',
      '## Notes',
      '',
      '- 魔術師/祈祷師の15%一律軽減は撤回済み',
      '- mp_after = designSkillMpCost（DB seedと同期）',
    ],
  );

  exitCheckResult('skill-mp-cost-design-audit', result);
}

main();
