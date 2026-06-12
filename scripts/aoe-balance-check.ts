/** aoe-balance-check — npx tsx scripts/aoe-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ALL_JOB_SKILLS, JOB_SKILL_UNLOCKS } from '../src/db/seedData/jobSkillData';
import { AOE_DAMAGE_MULT } from '../src/systems/skillBattleCore';

const warns: string[] = [];

function learnLevel(job: string, skillId: string): number {
  return JOB_SKILL_UNLOCKS[job]?.find((u) => u.skillId === skillId)?.level ?? 1;
}

function findSingleComparable(job: string, lv: number): { id: string; power: number; mp: number } | null {
  let best: { id: string; power: number; mp: number } | null = null;
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job) continue;
    if (s.target_type === 'all_enemies') continue;
    if (s.power <= 0) continue;
    const slv = learnLevel(job, s.id);
    if (slv > lv) continue;
    if (!best || s.power > best.power) {
      best = { id: s.id, power: s.power, mp: s.mp };
    }
  }
  return best;
}

function addWarn(msg: string): void {
  warns.push(msg);
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);

  console.log('## D. AOE効率チェック\n');
  console.log(`AOE_DAMAGE_MULT = ${AOE_DAMAGE_MULT}\n`);
  console.log('| スキル | Lv | power | hits | MP | 1体% | 2体比 | 3体比 | 判定 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const aoeSkills = ALL_JOB_SKILLS.filter((s) => s.target_type === 'all_enemies');

  for (const s of aoeSkills) {
    const row = db.prepare('SELECT power, mp_cost, hits, target_type FROM skills WHERE id = ?').get(s.id) as {
      power: number; mp_cost: number; hits: number; target_type: string;
    };
    const lv = learnLevel(s.job, s.id);
    const hits = row.hits ?? 1;
    const total1 = row.power * AOE_DAMAGE_MULT * hits;

    const single = findSingleComparable(s.job, lv);
    if (!single) {
      console.error(`比較単体スキルなし: ${s.id}`);
      process.exit(1);
    }
    const singleEff = single.power;
    const pct1 = (total1 / singleEff) * 100;
    const ratio2 = (total1 * 2) / singleEff;
    const ratio3 = (total1 * 3) / singleEff;

    let judge = 'OK';

    if (total1 > singleEff * 1.05) {
      judge = 'WARN';
      addWarn(`${s.id} 単体で単体主力を上回る (${pct1.toFixed(0)}%)`);
    }
    if (pct1 > 80) {
      judge = 'WARN';
      addWarn(`${s.id} 1体効率${pct1.toFixed(0)}% > 80%`);
    }
    if (ratio2 > 1.65) {
      judge = 'WARN';
      addWarn(`${s.id} 2体合計比${ratio2.toFixed(2)} > 1.65`);
    }
    if (lv < 40 && ratio2 > 1.75) {
      judge = 'WARN';
      addWarn(`${s.id} Lv${lv} AOE 2体比${ratio2.toFixed(2)} > 1.75`);
    }
    if (ratio2 < 1.15) {
      judge = 'WARN';
      addWarn(`${s.id} 2体で効率不足 (${ratio2.toFixed(2)})`);
    }
    if (pct1 >= 75 && row.mp_cost < single.mp) {
      judge = 'WARN';
      addWarn(`${s.id} MP軽めなのに単体効率${pct1.toFixed(0)}% — 単体戦最適解化`);
    }
    if (row.mp_cost < single.mp && row.power >= single.power * 0.5) {
      addWarn(`${s.id} MPが同Lv単体より軽い`);
    }

    console.log(`| ${s.name} | ${lv} | ${row.power} | ${hits} | ${row.mp_cost} | ${pct1.toFixed(0)}% | x${ratio2.toFixed(2)} | x${ratio3.toFixed(2)} | ${judge} |`);
  }

  console.log('\n## WARN\n');
  const unique = [...new Set(warns)];
  if (unique.length) {
    for (const w of unique) console.log(`- ${w}`);
  } else {
    console.log('(なし)');
  }

  const hardFail = unique.filter((w) =>
    w.includes('単体で単体主力') || w.includes('1体効率') && w.includes('> 80%')
    || w.includes('2体合計比') && w.includes('> 1.65')
    || w.includes('> 1.75'),
  );
  if (hardFail.length) {
    console.error('\n❌ aoe-balance-check failed');
    process.exit(1);
  }
  console.log('\n✅ aoe-balance-check passed');
}

main();
