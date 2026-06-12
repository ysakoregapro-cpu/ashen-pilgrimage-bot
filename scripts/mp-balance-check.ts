/** mp-balance-check — npx tsx scripts/mp-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ALL_JOB_SKILLS, JOB_SKILL_UNLOCKS } from '../src/db/seedData/jobSkillData';
import {
  classifySkillEffect,
  designSkillMpCost,
  learnLevelForSkill,
} from '../src/systems/mpCostDesign';
import {
  baseMaxMpFromLevel,
  computeExpectedMaxMp,
  referenceMaxMpTable,
} from '../src/systems/combatMp';

const warns: string[] = [];
const bands = [
  { name: 'Lv1-10', min: 1, max: 10 },
  { name: 'Lv11-25', min: 11, max: 25 },
  { name: 'Lv26-40', min: 26, max: 40 },
  { name: 'Lv41-60', min: 41, max: 60 },
  { name: 'Lv61-70', min: 61, max: 70 },
];

function judgeMp(lv: number, mp: number, fx: string): string {
  if (lv >= 40 && fx === 'high_damage' && mp < 20) return 'WARN';
  if (lv >= 60 && fx !== 'damage' && fx !== 'support' && mp < 20 && ['heal', 'revive', 'strong_guard', 'cover', 'taunt'].includes(fx)) return 'WARN';
  if (lv >= 61 && mp < 45 && fx === 'high_damage') return 'WARN';
  return 'OK';
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  console.log('## A. レベル帯別MP表\n');
  console.log('| 職業 | Lv | skill_id | スキル名 | power | MP | target | 効果分類 | 判定 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const mpByBand: Record<string, number[]> = {};
  for (const b of bands) mpByBand[b.name] = [];

  const ultimates: Array<{ job: string; id: string; name: string; mp: number }> = [];

  for (const s of ALL_JOB_SKILLS) {
    const row = db.prepare(`
      SELECT target_type, power, mp_cost, skill_type FROM skills WHERE id = ?
    `).get(s.id) as { target_type: string; power: number; mp_cost: number; skill_type: string } | undefined;
    if (!row) {
      console.error(`missing skill ${s.id}`);
      process.exit(1);
    }
    const lv = learnLevelForSkill(s.id, s.job);
    const fx = classifySkillEffect(s);
    const judge = judgeMp(lv, row.mp_cost, fx);
    if (judge === 'WARN') warns.push(`${s.id} L${lv} MP${row.mp_cost} (${fx})`);

    for (const b of bands) {
      if (lv >= b.min && lv <= b.max) mpByBand[b.name]!.push(row.mp_cost);
    }
    if (lv === 70) ultimates.push({ job: s.job, id: s.id, name: s.name, mp: row.mp_cost });

    console.log(`| ${s.job} | ${lv} | ${s.id} | ${s.name} | ${row.power} | ${row.mp_cost} | ${row.target_type} | ${fx} | ${judge} |`);
  }

  console.log('\n## B. レベル帯別 MP 平均/最小/最大\n');
  for (const b of bands) {
    const arr = mpByBand[b.name]!;
    const avg = arr.length ? (arr.reduce((a, c) => a + c, 0) / arr.length).toFixed(1) : '-';
    const min = arr.length ? Math.min(...arr) : '-';
    const max = arr.length ? Math.max(...arr) : '-';
    console.log(`- ${b.name}: 平均${avg} / 最小${min} / 最大${max} (n=${arr.length})`);
  }

  console.log('\n## C. 最大MP成長\n');
  console.log('| Lv | 基礎MP | 魔術師 | 重騎士 | 斥候 |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of referenceMaxMpTable()) {
    console.log(`| ${r.level} | ${baseMaxMpFromLevel(r.level)} | ${r.mage} | ${r.knight} | ${r.scout} |`);
  }

  const lv50Mage = computeExpectedMaxMp(50, 22, 0);
  const sampleMid = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get('bs_deep_thunder') as { mp_cost: number };
  const sampleUlt = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get('bs_star_ultimate') as { mp_cost: number };
  console.log(`\n代表(Lv50魔術師 maxMP≈${lv50Mage}): 深層雷 ${sampleMid?.mp_cost ?? '?'}回 ≈${Math.floor(lv50Mage / (sampleMid?.mp_cost || 1))} / 奥義 ${sampleUlt?.mp_cost ?? '?'}回 ≈${Math.floor(lv50Mage / (sampleUlt?.mp_cost || 1))}`);

  console.log('\n## Lv70奥義 MP\n');
  for (const u of ultimates) console.log(`- ${u.job} ${u.name}: MP${u.mp}`);

  const srcLow = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get('skill_deep_pierce') as { mp_cost: number } | undefined;
  if (srcLow && srcLow.mp_cost < 50) warns.push(`Src skill_deep_pierce MP${srcLow.mp_cost} < 50`);

  if (ultimates.some((u) => u.mp < 45)) warns.push('Lv70奥義 MP45未満あり');
  if (lv50Mage / (sampleUlt?.mp_cost || 1) >= 10) warns.push('Lv50で奥義10回以上可能');

  console.log('\n## WARN\n');
  if (warns.length) {
    for (const w of warns) console.log(`- ${w}`);
  } else {
    console.log('(なし)');
  }

  console.log(`\n✅ mp-balance-check passed (${ALL_JOB_SKILLS.length} skills, ${warns.length} WARN)`);
}

main();
