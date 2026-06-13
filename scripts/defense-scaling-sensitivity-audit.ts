/** defense-scaling-sensitivity-audit — npx tsx scripts/defense-scaling-sensitivity-audit.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { calcEnemyDamageToPlayer, scaleMonsterForBattle } from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';
import { MONSTER_SEED_DATA } from '../src/db/seedData/monsters';

const result = emptyResult();

type Profile = { label: string; level: number; defense: number; max_hp: number };

const PROFILES: Profile[] = [
  { label: 'Lv5低防御', level: 5, defense: 12, max_hp: 145 },
  { label: 'Lv5適正防御', level: 5, defense: 28, max_hp: 165 },
  { label: 'Lv20高防御', level: 20, defense: 58, max_hp: 420 },
  { label: 'Lv80ヴァルハラ防御', level: 80, defense: 285, max_hp: 2680 },
];

const ENEMY_ID = 'mon_bandit';

function avgDamage(fn: () => number, n = 400): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += fn();
  return Math.round(sum / n);
}

function main() {
  const rows: string[][] = [];
  initAuditDb();
  const seed = MONSTER_SEED_DATA.find((m) => m.id === ENEMY_ID);
  if (!seed) {
    result.fails.push(`missing ${ENEMY_ID}`);
  } else {
    const scaled = scaleMonsterForBattle({
      id: seed.id, area_tag: seed.tag, level: seed.lv, hp: seed.hp, attack: seed.atk,
      magic: seed.mag, defense: seed.def, spirit: seed.mag, speed: seed.spd,
      is_boss: seed.boss ? 1 : 0,
    });
    const areaMin = 4;
    const areaMax = 8;

    for (const p of PROFILES) {
      const diff = getDifficultyModifiers(p.level, areaMin, areaMax);
      const dmg = avgDamage(() => calcEnemyDamageToPlayer({
        attack: scaled.attack,
        playerDefense: p.defense,
        playerMaxHp: p.max_hp,
        playerLevel: p.level,
        monsterLevel: seed.lv,
        threatTier: scaled.threatTier,
        takenMult: diff.playerTaken,
        heavy: false,
      }));
      const pct = Math.round((dmg / p.max_hp) * 1000) / 10;
      let note = 'OK';
      let balance = '序盤敵・防御差が反映';
      if (p.label.includes('Lv80') && dmg > 10) {
        note = 'WARN';
        balance = `高Lvタンクでも${dmg}dmg — gapMit適用後もHP%残存`;
        result.warns.push(`Lv80 vs 序盤敵 avg ${dmg} (目安1-5)`);
      } else if (p.label.includes('Lv80') && dmg <= 5) {
        balance = '高防御プレイヤーは序盤敵からほぼ削られない';
      } else if (p.label.includes('Lv20') && dmg >= 8) {
        note = 'WARN';
        result.warns.push(`Lv20高防御 vs 序盤 avg ${dmg} (やや高め)`);
      }
      rows.push([
        ENEMY_ID, 'early_starfield', String(scaled.attack), String(p.level), String(p.defense),
        String(p.max_hp), String(dmg), `${pct}%`, p.label, balance, note,
      ]);
    }

    const low = parseInt(rows[0]![6], 10);
    const high = parseInt(rows[3]![6], 10);
    if (low <= high) {
      result.fails.push('防御を上げても被ダメが下がらない（順序異常）');
    }
  }

  writeMdCsvPair(
    'defense-scaling-sensitivity-audit',
    ['enemy_id', 'enemy_level_band', 'enemy_attack', 'player_level', 'player_defense', 'player_hp', 'expected_damage', 'damage_percent_of_hp', 'defense_effect_note', 'balance_note', 'status'],
    rows,
    ['## 防御スケーリング', '', `${ENEMY_ID} への被ダメ平均（400回）。`],
  );
  exitCheckResult('defense-scaling-sensitivity-audit', result);
}

main();
