/** enemy-tier-balance-check — npx tsx scripts/enemy-tier-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { getMonsterThreatTier } from '../src/systems/combatMath';

const TARGET = { normal: 70, tough: 20, rare: 8, elite: 2 };
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const areas = db.prepare('SELECT id, name, monster_pool_json, recommended_min_level FROM exploration_areas').all() as Array<{
    id: string; name: string; monster_pool_json: string; recommended_min_level: number;
  }>;

  for (const a of areas) {
    const pool = JSON.parse(a.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
    if (!pool.length) continue;

    const tierWeights: Record<string, number> = { normal: 0, tough: 0, rare: 0, elite: 0, boss: 0 };
    let total = 0;
    for (const p of pool) {
      const tier = getMonsterThreatTier(p.monster_id);
      tierWeights[tier] = (tierWeights[tier] ?? 0) + p.weight;
      total += p.weight;
    }
    if (total <= 0) continue;

    const rarePct = (tierWeights.rare ?? 0) / total * 100;
    const elitePct = (tierWeights.elite ?? 0) / total * 100;
    const maxRarePct = Math.max(
      0,
      ...pool
        .filter((p) => getMonsterThreatTier(p.monster_id) === 'rare')
        .map((p) => (p.weight / total) * 100),
    );
    const allRarePlus = pool.every((p) => ['rare', 'elite', 'boss'].includes(getMonsterThreatTier(p.monster_id)));

    if (pool.length === 2 && maxRarePct >= 40 && a.recommended_min_level < 55 && !allRarePlus) {
      issues.push(`${a.name}: rare出現 ${maxRarePct.toFixed(0)}% (2体poolで偏り)`);
    }
    if (maxRarePct > 12 && a.recommended_min_level < 20 && pool.length === 2) {
      issues.push(`${a.name}: 序盤2体pool rare ${maxRarePct.toFixed(0)}% (expected ≤12%)`);
    }
    const mixedRareElite = pool.some((p) => getMonsterThreatTier(p.monster_id) === 'rare')
      && pool.some((p) => getMonsterThreatTier(p.monster_id) === 'elite')
      && !pool.some((p) => getMonsterThreatTier(p.monster_id) === 'normal')
      && !pool.some((p) => getMonsterThreatTier(p.monster_id) === 'tough');
    const allElite = pool.every((p) => ['elite', 'boss'].includes(getMonsterThreatTier(p.monster_id)));
    if (elitePct > 8 && !allElite && !mixedRareElite) {
      issues.push(`${a.name}: elite ${elitePct.toFixed(0)}% (expected ≤8%)`);
    }

    // mon_tide_ghost balance
    if (pool.some((p) => p.monster_id === 'mon_tide_ghost')) {
      const mon = db.prepare('SELECT hp, attack, level FROM monsters WHERE id = ?').get('mon_tide_ghost') as {
        hp: number; attack: number; level: number;
      };
      if (mon && mon.hp < 100) issues.push('mon_tide_ghost HP低すぎ');
      if (mon && mon.attack < 18 && a.recommended_min_level >= 14) issues.push('mon_tide_ghost 攻撃低すぎ');
    }
  }

  if (issues.length) {
    console.error('❌ enemy-tier-balance-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ enemy-tier-balance-check passed');
  console.log(`   目安 weight: normal ${TARGET.normal}% / tough ${TARGET.tough}% / rare ${TARGET.rare}% / elite ${TARGET.elite}%`);
}

main();
