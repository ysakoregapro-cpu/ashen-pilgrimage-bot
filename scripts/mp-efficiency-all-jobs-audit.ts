/**
 * mp-efficiency-all-jobs-audit.ts — 全9基本職×全スキルのMP効率監査
 * npx tsx scripts/mp-efficiency-all-jobs-audit.ts
 */
import { readFileSync } from 'fs';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ALL_JOB_SKILLS, resolveSkillTargetType } from '../src/db/seedData/jobSkillData';
import { BASIC_MAIN_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import {
  designSkillMpCost,
  learnLevelForSkill,
  skillDesignMeta,
  MAGIC_JOBS,
  pickMainSkillForJob,
  expectedMaxMpForJob,
  type MpCostTier,
} from '../src/systems/mpCostDesign';
import { emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';

function fourTurnRange(tier: MpCostTier): { min: number; max: number } {
  switch (tier) {
    case 'low': return { min: 18, max: 30 };
    case 'main': return { min: 30, max: 45 };
    case 'high': return { min: 45, max: 65 };
    default: return { min: 18, max: 45 };
  }
}

const HEADERS = [
  'player_level', 'job', 'skill_id', 'skill_name', 'learn_level',
  'power', 'hits', 'mp_cost', 'designed_mp', 'action_value', 'value_per_mp',
  'max_mp', 'mp_percent', 'tier', 'status',
];

function main() {
  const result = emptyResult();
  const db = getDb();
  ensurePhase2Seed(db);

  const rows: string[][] = [];
  const summaryLines: string[] = ['## 魔術師/祈祷師 主力4T MP消費', ''];

  for (const job of MAGIC_JOBS) {
    for (const lv of [30, 50, 70]) {
      const maxMp = expectedMaxMpForJob(job, lv);
      const main = pickMainSkillForJob(job, lv);
      if (!main) continue;
      const meta = skillDesignMeta(main);
      const fourPct = ((meta.mpAfter * 4) / maxMp) * 100;
      const range = fourTurnRange(meta.tier);
      summaryLines.push(`- ${job} Lv${lv}: ${main.name} MP${meta.mpAfter} ×4 = ${fourPct.toFixed(0)}% (${meta.tier})`);
      if (fourPct < range.min) result.fails.push(`${job} Lv${lv} 4T ${fourPct.toFixed(0)}% too light`);
    }
  }
  summaryLines.push('');

  for (const s of ALL_JOB_SKILLS) {
    const learnLv = learnLevelForSkill(s.id, s.job);
    const meta = skillDesignMeta(s, learnLv);
    const row = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get(s.id) as { mp_cost: number } | undefined;
    const mp = row?.mp_cost ?? meta.mpAfter;
    const designed = designSkillMpCost(s);

    let status = 'OK';
    if (mp !== designed) {
      status = 'WARN';
      result.warns.push(`${s.id} DB ${mp} != design ${designed}`);
    }
    if (s.power > 0 && meta.tier !== 'utility' && mp <= 6 && meta.actionValue >= 1.65) {
      status = 'FAIL';
      result.fails.push(`${s.id}: low MP high power`);
    }

    rows.push([
      String(meta.band.evalLevel), s.job, s.id, s.name, String(learnLv),
      String(s.power), String(s.hits ?? 1), String(mp), String(designed),
      meta.actionValue.toFixed(3), meta.valuePerMp.toFixed(4),
      String(meta.maxMp), meta.mpPercent.toFixed(1), meta.tier, status,
    ]);
  }

  const src = readFileSync('src/systems/mpCostDesign.ts', 'utf8');
  if (/0\.85|15%|mpEfficientJobs/.test(src)) {
    result.fails.push('15% mage discount still present in mpCostDesign.ts');
  }

  writeMdCsvPair(
    'mp-efficiency-all-jobs-audit',
    HEADERS,
    rows,
    [
      '## Summary',
      '',
      `- skills: ${rows.length}`,
      `- fails: ${result.fails.length}`,
      '',
      ...summaryLines,
      '## Notes',
      '',
      '- 魔術師/祈祷師一律15%軽減は撤回',
      '- 固定設計基準: action value + maxMP% + 4T/8T rotation',
    ],
  );

  exitCheckResult('mp-efficiency-all-jobs-audit', result);
}

main();
