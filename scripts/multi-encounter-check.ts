/** multi-encounter-check — npx tsx scripts/multi-encounter-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  pickEncounterMonsters,
  getEncounterSizeRates,
  perEnemyAttackMult,
  perEnemyHpMult,
  encounterRewardMult,
  totalAttackPowerMult,
  validateEncounterPack,
} from '../src/systems/multiEncounter';
import { getAreaRank } from '../src/systems/townLootSystem';
import {
  ELITE_MONSTER_IDS,
  RARE_MONSTER_IDS,
  getMonsterThreatTier,
} from '../src/systems/combatMath';

const warns: string[] = [];

function simulatePacks(pool: Array<{ monster_id: string; weight: number }>, areaId: string, n = 500) {
  const counts = { one: 0, two: 0, three: 0 };
  const packs: string[][] = [];
  for (let i = 0; i < n; i++) {
    const ids = pickEncounterMonsters(pool, areaId);
    packs.push(ids);
    if (ids.length === 1) counts.one++;
    else if (ids.length === 2) counts.two++;
    else counts.three++;
  }
  return { counts, packs, n };
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);

  console.log('## E. 複数エンカウントチェック\n');

  const areas = db.prepare(`
    SELECT id, monster_pool_json FROM exploration_areas ORDER BY recommended_min_level LIMIT 12
  `).all() as Array<{ id: string; monster_pool_json: string }>;

  console.log('### area rank別出現率（理論値）\n');
  for (let rank = 1; rank <= 7; rank++) {
    const r = getEncounterSizeRates(rank);
    console.log(`- rank${rank}: 1体 ${(r.one * 100).toFixed(0)}% / 2体 ${(r.two * 100).toFixed(0)}% / 3体 ${(r.three * 100).toFixed(0)}%`);
  }

  console.log('\n### シミュレーション（各エリア500回）\n');
  for (const area of areas.slice(0, 6)) {
    const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
    const rank = getAreaRank(area.id);
    const sim = simulatePacks(pool, area.id);
    console.log(`- ${area.id} (rank${rank}): 1=${(sim.counts.one / sim.n * 100).toFixed(0)}% 2=${(sim.counts.two / sim.n * 100).toFixed(0)}% 3=${(sim.counts.three / sim.n * 100).toFixed(0)}%`);
  }

  console.log('\n### 禁止編成チェック\n');
  const forbidden = [
    ['mon_lighthouse_jelly', 'mon_lighthouse_jelly'],
    ['mon_silver_golem', 'mon_silver_golem'],
    ['mon_lighthouse_jelly', 'mon_silver_golem'],
    ['mon_lighthouse_jelly', 'mon_sea_thief'],
    ['mon_silver_golem', 'mon_sea_thief'],
  ];
  for (const pack of forbidden) {
    const v = validateEncounterPack(pack);
    if (v.ok) warns.push(`禁止編成が通過: ${pack.join('+')}`);
    else console.log(`- OK 禁止: ${pack.join('+')} (${v.reason})`);
  }

  console.log('\n### 火力・HP・報酬倍率\n');
  for (const size of [1, 2, 3] as const) {
    const atk = totalAttackPowerMult(size, 5);
    const hp = size * perEnemyHpMult(size);
    const reward = encounterRewardMult(size, false);
    console.log(`- ${size}体: 合計火力×${atk.toFixed(2)} / 合計HP×${hp.toFixed(2)} / 報酬×${reward.toFixed(2)}`);
    if (size === 2 && atk > 1.7) warns.push(`2体火力 ${atk.toFixed(2)} > 1.7`);
    if (size === 3 && atk > 2.0) warns.push(`3体火力 ${atk.toFixed(2)} > 2.0`);
    if (size === 2 && reward > 2.2) warns.push(`2体報酬 ${reward.toFixed(2)} > 2.2`);
    if (size === 3 && reward > 2.2) warns.push(`3体報酬 ${reward.toFixed(2)} > 2.2`);
  }

  console.log('\n### rare/elite/boss 複数湧き\n');
  let badBoss = 0;
  for (const area of areas) {
    const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
    for (let i = 0; i < 200; i++) {
      const ids = pickEncounterMonsters(pool, area.id);
      const tiers = ids.map((id) => getMonsterThreatTier(id));
      if (tiers.includes('boss') && ids.length > 1) badBoss++;
      if (tiers.filter((t) => t === 'rare').length >= 2) warns.push('rare+rare 発生');
      if (tiers.filter((t) => t === 'elite').length >= 2) warns.push('elite+elite 発生');
      if (tiers.includes('rare') && tiers.includes('elite')) warns.push('rare+elite 発生');
    }
  }
  if (badBoss) warns.push(`boss複数湧き ${badBoss}件`);

  console.log(`- rare IDs: ${RARE_MONSTER_IDS.size}, elite IDs: ${ELITE_MONSTER_IDS.size}`);
  console.log(`- perEnemyAtkMult(2,rank5)=${perEnemyAttackMult(2, 5)}, (3,rank7)=${perEnemyAttackMult(3, 7)}`);

  console.log('\n## WARN\n');
  const uniqueWarns = [...new Set(warns)];
  if (uniqueWarns.length) {
    for (const w of uniqueWarns.slice(0, 15)) console.log(`- ${w}`);
    if (uniqueWarns.length > 15) console.log(`- ...他${uniqueWarns.length - 15}件`);
  } else console.log('(なし)');

  if (uniqueWarns.some((w) => w.includes('禁止編成') || w.includes('boss複数'))) {
    console.error('\n❌ multi-encounter-check failed');
    process.exit(1);
  }
  console.log('\n✅ multi-encounter-check passed');
}

main();
