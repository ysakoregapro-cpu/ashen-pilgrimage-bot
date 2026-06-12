/** enemy-balance-phase2-check — npx tsx scripts/enemy-balance-phase2-check.ts */
import {
  calcPhysicalDamage, calcEnemyDamageToPlayer, scaleMonsterForBattle,
  getMonsterThreatTier, type ThreatTier,
} from '../src/systems/combatMath';
import { initAuditDb } from './audit/acquisitionIndex';
import {
  computeBaseStatsFromLevel, applyJobStatMultipliers,
} from '../src/db/seedData/jobMultiplierMaster';
import { getSubForBaseJob } from '../src/db/seedData/jobProgressionMaster';

const warns: string[] = [];
const fails: string[] = [];

function buildPlayer(level: number, job: string, equipBonus: { atk: number; def: number; hp: number }) {
  const sub = getSubForBaseJob(job) ?? '繋ぎ手';
  const base = computeBaseStatsFromLevel(level);
  applyJobStatMultipliers(base, job, sub);
  base.attack += equipBonus.atk;
  base.defense += equipBonus.def;
  base.max_hp += equipBonus.hp;
  return base;
}

function killTurns(atk: number, hp: number, def: number, mult = 1.3): number {
  const dmg = calcPhysicalDamage(atk, def, mult, 0);
  return Math.max(1, Math.ceil(hp / Math.max(1, dmg)));
}

function avgHitPct(enemyAtk: number, playerDef: number, playerMaxHp: number, tier: ThreatTier): number {
  let sum = 0;
  for (let i = 0; i < 20; i++) {
    sum += calcEnemyDamageToPlayer({
      attack: enemyAtk, playerDefense: playerDef, playerMaxHp,
      threatTier: tier, takenMult: 1, multiplier: 1,
    }) / playerMaxHp;
  }
  return sum / 20;
}

function main() {
  const db = initAuditDb();
  const areas = db.prepare(`
    SELECT id, name, recommended_min_level, recommended_max_level, monster_pool_json, town_id
    FROM exploration_areas ORDER BY recommended_min_level
  `).all() as Array<{
    id: string; name: string; recommended_min_level: number; recommended_max_level: number;
    monster_pool_json: string; town_id: string;
  }>;

  const monsters = db.prepare(`
    SELECT id, area_tag, level, hp, attack, magic, defense, spirit, speed, is_boss
    FROM monsters
  `).all() as Array<Record<string, unknown>>;

  const evalAtDelta: Record<string, { weak: number; ok: number; hard: number; total: number; kills: number[] }> = {
    'rec-5': { weak: 0, ok: 0, hard: 0, total: 0, kills: [] },
    rec: { weak: 0, ok: 0, hard: 0, total: 0, kills: [] },
    'rec+5': { weak: 0, ok: 0, hard: 0, total: 0, kills: [] },
    'rec+10': { weak: 0, ok: 0, hard: 0, total: 0, kills: [] },
  };

  for (const area of areas) {
    if (area.town_id === 'valhalla_fortress') continue;
    const pool = JSON.parse(area.monster_pool_json || '[]') as Array<{ monster_id: string }>;
    const recLv = Math.floor((area.recommended_min_level + area.recommended_max_level) / 2);
    const normals = pool
      .map((p) => monsters.find((m) => m.id === p.monster_id))
      .filter(Boolean)
      .filter((m) => getMonsterThreatTier(String(m!.id)) === 'normal');
    if (!normals.length) continue;
    const refRaw = normals[0]!;
    const ref = scaleMonsterForBattle(refRaw as Parameters<typeof scaleMonsterForBattle>[0]);

    for (const [key, delta] of [['rec-5', -5], ['rec', 0], ['rec+5', 5], ['rec+10', 10]] as const) {
      const pLv = Math.max(1, recLv + delta);
      const bonus = delta >= 5
        ? { atk: Math.floor(pLv * 0.8), def: Math.floor(pLv * 0.5), hp: Math.floor(pLv * 4) }
        : { atk: Math.floor(pLv * 0.4), def: Math.floor(pLv * 0.3), hp: Math.floor(pLv * 2) };
      const player = buildPlayer(pLv, '剣士', bonus);
      const kt = killTurns(player.attack, ref.hp, ref.defense);
      const hit = avgHitPct(ref.attack, player.defense, player.max_hp, ref.threatTier);
      evalAtDelta[key]!.total++;
      evalAtDelta[key]!.kills.push(kt);
      if (kt <= 2 && hit < 0.07) evalAtDelta[key]!.weak++;
      else if (kt >= 10 || hit >= 0.22) evalAtDelta[key]!.hard++;
      else evalAtDelta[key]!.ok++;
    }
  }

  const recWeakPct = evalAtDelta['rec-5']!.weak / Math.max(1, evalAtDelta['rec-5']!.total);
  if (recWeakPct > 0.35) {
    fails.push(`推奨Lv-5: 敵弱い判定 ${(recWeakPct * 100).toFixed(0)}% > 35%`);
  } else if (recWeakPct > 0.2) {
    warns.push(`推奨Lv-5: 敵弱い ${evalAtDelta['rec-5']!.weak}/${evalAtDelta['rec-5']!.total}`);
  }

  const recKills = evalAtDelta.rec!.kills;
  const recMedian = recKills.length ? recKills.sort((a, b) => a - b)[Math.floor(recKills.length / 2)]! : 0;
  const recAvg = recKills.length ? recKills.reduce((a, b) => a + b, 0) / recKills.length : 0;
  if (recMedian < 2 || recMedian > 7) {
    warns.push(`推奨Lv kill中央値 ${recMedian}T (目標3-5T)`);
  }
  console.log(`推奨Lv: median=${recMedian}T avg=${recAvg.toFixed(1)}T weak=${evalAtDelta.rec!.weak}/${evalAtDelta.rec!.total}`);

  const plus5Weak = evalAtDelta['rec+5']!.weak;
  if (plus5Weak > evalAtDelta['rec+5']!.total * 0.15) {
    warns.push(`推奨Lv+5: 敵弱い ${plus5Weak}/${evalAtDelta['rec+5']!.total}`);
  }

  // Job danger checks
  const midLv = 50;
  const midMon = monsters.find((m) => Number(m.level) === 50 && String(m.area_tag) !== 'valhalla')
    ?? monsters.find((m) => Number(m.level) >= 45 && Number(m.level) <= 55);
  if (midMon) {
    const scaled = scaleMonsterForBattle(midMon as Parameters<typeof scaleMonsterForBattle>[0]);
    const mage = buildPlayer(midLv, '魔術師', { atk: 20, def: 10, hp: 30 });
    const priest = buildPlayer(midLv, '祈祷師', { atk: 15, def: 15, hp: 40 });
    const tank = buildPlayer(midLv, '重騎士', { atk: 10, def: 50, hp: 80 });
    const silver = buildPlayer(midLv, '白銀城塞騎士', { atk: 15, def: 45, hp: 70 });

    const mageHit = avgHitPct(scaled.attack, mage.defense, mage.max_hp, scaled.threatTier);
    const priestHit = avgHitPct(scaled.attack, priest.defense, priest.max_hp, scaled.threatTier);
    const tankHit = avgHitPct(scaled.attack, tank.defense, tank.max_hp, scaled.threatTier);
    const silverHit = avgHitPct(scaled.attack, silver.defense, silver.max_hp, scaled.threatTier);

    if (mageHit > 0.28 || priestHit > 0.28) {
      fails.push(`魔術師/祈祷師 Lv50 被ダメ ${(Math.max(mageHit, priestHit) * 100).toFixed(0)}% > 28%`);
    }
    if (tankHit < 0.06 && silverHit < 0.06) {
      warns.push(`重騎士/白銀城塞 被ダメ低すぎ (${(tankHit * 100).toFixed(0)}%/${(silverHit * 100).toFixed(0)}%)`);
    }
    console.log(`職別被ダメ Lv50: 魔${(mageHit * 100).toFixed(0)}% 祈${(priestHit * 100).toFixed(0)}% 重${(tankHit * 100).toFixed(0)}% 白銀${(silverHit * 100).toFixed(0)}%`);
  }

  // Shadow walker speed sanity
  const scout = buildPlayer(70, '斥候', { atk: 30, def: 20, hp: 40 });
  const shadow = buildPlayer(70, '影渡り', { atk: 35, def: 15, hp: 30 });
  const valhallaNorm = monsters.filter((m) => String(m.area_tag) === 'valhalla' && getMonsterThreatTier(String(m.id)) === 'normal');
  if (valhallaNorm.length) {
    const vMon = valhallaNorm[0]!;
    const vScaled = scaleMonsterForBattle(vMon as Parameters<typeof scaleMonsterForBattle>[0]);
    if (shadow.speed <= vScaled.speed && scout.speed <= vScaled.speed) {
      warns.push('影渡り/斥候がヴァルハラ通常敵より遅い');
    }
  }

  console.log('\n## WARN');
  for (const w of warns) console.log(`- ${w}`);
  if (!warns.length) console.log('(なし)');

  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ enemy-balance-phase2-check passed');
}

main();
