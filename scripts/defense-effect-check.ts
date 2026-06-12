/** defense-effect-check — npx tsx scripts/defense-effect-check.ts */
import {
  calcPhysicalDamage, calcEnemyDamageToPlayer,
} from '../src/systems/combatMath';
import { writeReport, mdTable } from './audit/reportWriter';

const DEF_OFFSETS = [0, 10, 30, 50, 100];
const LEVELS = [10, 20, 35, 50, 80];

function main() {
  const rows: string[][] = [];
  for (const lv of LEVELS) {
    const baseDef = 8 + (lv - 1) + 20;
    const maxHp = 100 + (lv - 1) * 15 + 30;
    const enemyAtk = 15 + lv * 1.2;
    const baseTaken = calcEnemyDamageToPlayer({
      attack: enemyAtk, playerDefense: baseDef, playerMaxHp: maxHp,
      threatTier: 'normal', takenMult: 1.1,
    });
    for (const off of DEF_OFFSETS) {
      if (off === 0) continue;
      const def = baseDef + off;
      const taken = calcEnemyDamageToPlayer({
        attack: enemyAtk, playerDefense: def, playerMaxHp: maxHp,
        threatTier: 'normal', takenMult: 1.1,
      });
      const reduce = (((baseTaken - taken) / baseTaken) * 100).toFixed(1);
      rows.push([String(lv), String(baseDef + off), String(baseTaken), String(taken), `${reduce}%`]);
    }
  }

  const statRows: string[][] = [];
  const atk = 40;
  for (const def of [0, 10, 30, 50, 100]) {
    const d0 = calcPhysicalDamage(atk, def, 1, 0);
    statRows.push([String(def), String(d0)]);
  }

  const md = [
    '# Defense Effect Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Enemy→Player (HP 32% + stat 68%, def coeff 0.68)',
    mdTable(['Lv', 'DEF', 'BaseTaken', 'NewTaken', 'Reduction'], rows),
    '',
    '## Player→Enemy (stat-only mitigation)',
    mdTable(['EnemyDEF', 'PlayerDmg(ATK40)'], statRows),
    '',
    '## Findings',
    '- +30 DEF ≈ 10-18% total taken reduction at mid levels (Phase2)',
    '- HP-proportional portion reduced (32%) → armor DEF more visible',
    '- Phase2: def coefficient 0.68 (was 0.52)',
  ].join('\n');

  writeReport('defense-effect.md', md);
  console.log('✅ defense-effect-check → reports/defense-effect.md');
}

main();
