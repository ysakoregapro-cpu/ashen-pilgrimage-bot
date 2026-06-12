/** battle-damage-curve-check — npx tsx scripts/battle-damage-curve-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import {
  calcPhysicalDamage, calcEnemyDamageToPlayer, scaleMonsterForBattle,
} from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';
import { MONSTER_SEED_DATA } from '../src/db/seedData/monsters';
import { writeReport, mdTable } from './audit/reportWriter';

const LEVELS = [1, 10, 20, 35, 50, 70, 80, 100];

function playerProfile(lv: number) {
  return {
    lv,
    hp: 100 + (lv - 1) * 15 + 30,
    mp: 30 + (lv - 1) * 5 + 20,
    atk: 10 + (lv - 1) * 2 + 15,
    mag: 10 + (lv - 1) * 2 + 12,
    def: 8 + (lv - 1) + 20,
  };
}

function pickMonsterForLevel(lv: number) {
  const sorted = [...MONSTER_SEED_DATA].sort((a, b) => Math.abs(a.lv - lv) - Math.abs(b.lv - lv));
  return sorted[0]!;
}

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());

  const rows: string[][] = [];
  for (const lv of LEVELS) {
    const p = playerProfile(lv);
    const mon = pickMonsterForLevel(lv);
    const scaled = scaleMonsterForBattle({
      id: mon.id, area_tag: mon.tag, hp: mon.hp, attack: mon.atk, magic: mon.mag,
      defense: mon.def, spirit: mon.def, speed: mon.spd,
    });
    const diff = getDifficultyModifiers(lv, Math.max(1, lv - 3), lv + 5);
    const playerDmg = calcPhysicalDamage(p.atk, scaled.defense, diff.playerDamage, 0);
    const skillDmg = calcPhysicalDamage(p.mag, scaled.spirit, diff.playerDamage * 1.2, 0);
    const taken = calcEnemyDamageToPlayer({
      attack: scaled.attack,
      playerDefense: p.def,
      playerMaxHp: p.hp,
      threatTier: scaled.threatTier,
      takenMult: diff.playerTaken,
    });
    const takenPct = ((taken / p.hp) * 100).toFixed(1);
    rows.push([
      String(lv), String(p.hp), String(p.atk), String(scaled.attack), String(scaled.defense),
      String(playerDmg), String(skillDmg), String(taken), `${takenPct}%`,
    ]);
  }

  const md = [
    '# Battle Damage Curve',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Assumptions: avg gear playerProfile, nearest monster by level, normal threat, mid band difficulty',
    '',
    mdTable(['Lv', 'PlayerHP', 'PlayerATK', 'EnemyATK', 'EnemyDEF', 'PhysDmg', 'SkillDmg(1.2mag)', 'Taken', 'Taken/HP'], rows),
    '',
    '## Observations (Phase2 tuning candidates)',
    '- Player skill damage scales faster than enemy taken % (HP-proportional enemy damage)',
    '- Mid-band enemy ATK may feel low vs player ATK ~160 at Lv25 mage (see combat-balance-check REAL_LOG profile)',
    '- Valhalla/raid: use elite/boss tiers + higher area mult for endgame check',
  ].join('\n');

  writeReport('battle-damage-curve.md', md);
  console.log('✅ battle-damage-curve-check → reports/battle-damage-curve.md');
}

main();
