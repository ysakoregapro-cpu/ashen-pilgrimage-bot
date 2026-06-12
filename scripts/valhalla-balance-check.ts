/** valhalla-balance-check — npx tsx scripts/valhalla-balance-check.ts */
import {
  calcPhysicalDamage, scaleMonsterForBattle, getMonsterThreatTier,
} from '../src/systems/combatMath';
import { initAuditDb } from './audit/acquisitionIndex';
import {
  computeBaseStatsFromLevel, applyJobStatMultipliers, ADVANCED_MAIN_JOB_MULTS,
} from '../src/db/seedData/jobMultiplierMaster';
import { getSubForBaseJob } from '../src/db/seedData/jobProgressionMaster';

const warns: string[] = [];
const fails: string[] = [];

function buildLoadout(level: number, job: string, tier: 'basic80' | 'adv90') {
  const sub = tier === 'adv90' && job === '黄昏剣聖' ? '刃走り' : (getSubForBaseJob(job) ?? '繋ぎ手');
  const base = computeBaseStatsFromLevel(level);
  applyJobStatMultipliers(base, job, sub);
  if (tier === 'adv90') {
    const adv = ADVANCED_MAIN_JOB_MULTS[job];
    if (adv) {
      base.attack = Math.floor(base.attack * adv.attack);
      base.magic = Math.floor(base.magic * adv.magic);
      base.defense = Math.floor(base.defense * adv.defense);
      base.max_hp = Math.floor(base.max_hp * adv.max_hp);
    }
    base.attack += Math.floor(level * 1.2);
    base.defense += Math.floor(level * 0.8);
    base.max_hp += Math.floor(level * 6);
  } else {
    base.attack += Math.floor(level * 0.5);
    base.defense += Math.floor(level * 0.4);
    base.max_hp += Math.floor(level * 3);
  }
  return base;
}

function killTurns(atk: number, hp: number, def: number, mult = 1.3): number {
  const dmg = calcPhysicalDamage(atk, def, mult, 0);
  return Math.max(1, Math.ceil(hp / Math.max(1, dmg)));
}

function main() {
  const db = initAuditDb();
  const valhallaAreas = db.prepare(`
    SELECT id, name, recommended_min_level, recommended_max_level, monster_pool_json
    FROM exploration_areas WHERE town_id = 'valhalla_fortress'
  `).all() as Array<{ id: string; name: string; recommended_min_level: number; recommended_max_level: number; monster_pool_json: string }>;

  const monsters = db.prepare(`
    SELECT id, name, area_tag, level, hp, attack, magic, defense, spirit, speed, is_boss
    FROM monsters WHERE area_tag = 'valhalla'
  `).all() as Array<Record<string, unknown>>;

  const p80 = buildLoadout(80, '剣士', 'basic80');
  const p90 = buildLoadout(90, '黄昏剣聖', 'adv90');

  console.log(`## Valhalla balance (Lv80 basic HP${p80.max_hp} ATK${p80.attack} / Lv90 adv HP${p90.max_hp} ATK${p90.attack})\n`);

  let normalTwoTurn = 0;
  let advOneTurn = 0;
  let normalCount = 0;
  let eliteBossCount = 0;

  for (const mon of monsters) {
    const tier = getMonsterThreatTier(String(mon.id), { forceBoss: mon.is_boss === 1 });
    const scaled = scaleMonsterForBattle(mon as Parameters<typeof scaleMonsterForBattle>[0]);
    const kt80 = killTurns(p80.attack, scaled.hp, scaled.defense);
    const kt90 = killTurns(p90.attack, scaled.hp, scaled.defense);

    if (tier === 'normal' || tier === 'tough') {
      normalCount++;
      if (kt80 <= 2) normalTwoTurn++;
      if (kt90 <= 1) advOneTurn++;
      console.log(`- ${mon.name} (${tier}): Lv80=${kt80}T Lv90adv=${kt90}T HP${scaled.hp} ATK${scaled.attack}`);
    } else {
      eliteBossCount++;
      console.log(`- ${mon.name} (${tier}): Lv80=${kt80}T Lv90adv=${kt90}T [elite/boss]`);
    }
  }

  const twoTurnPct = normalTwoTurn / Math.max(1, normalCount);
  if (twoTurnPct > 0.5) {
    fails.push(`ヴァルハラ通常 Lv80基本職 2T以下 ${normalTwoTurn}/${normalCount} (${(twoTurnPct * 100).toFixed(0)}%)`);
  } else if (twoTurnPct > 0.3) {
    warns.push(`ヴァルハラ通常 Lv80 2T以下 ${normalTwoTurn}/${normalCount}`);
  }

  const oneTurnPct = advOneTurn / Math.max(1, normalCount);
  if (oneTurnPct > 0.4) {
    fails.push(`ヴァルハラ Lv90上級 1T周回 ${advOneTurn}/${normalCount} (${(oneTurnPct * 100).toFixed(0)}%)`);
  } else if (oneTurnPct > 0.2) {
    warns.push(`ヴァルハラ Lv90上級 1T ${advOneTurn}/${normalCount}`);
  }

  for (const area of valhallaAreas) {
    const rec = Math.floor((area.recommended_min_level + area.recommended_max_level) / 2);
    console.log(`\nエリア ${area.name} (推奨${rec})`);
  }

  console.log(`\n通常敵 ${normalCount} / elite+boss ${eliteBossCount}`);
  console.log('\n## WARN');
  for (const w of warns) console.log(`- ${w}`);
  if (!warns.length) console.log('(なし)');

  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ valhalla-balance-check passed');
}

main();
