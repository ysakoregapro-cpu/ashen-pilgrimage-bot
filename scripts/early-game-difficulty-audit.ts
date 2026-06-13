/** early-game-difficulty-audit — npx tsx scripts/early-game-difficulty-audit.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { calcPhysicalDamage, calcEnemyDamageToPlayer, scaleMonsterForBattle } from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';
import { MONSTER_SEED_DATA } from '../src/db/seedData/monsters';

const result = emptyResult();

type Case = { id: string; playerLv: number; atk: number; def: number; hp: number; areaMin: number; areaMax: number; ttkBand: [number, number] };

const CASES: Case[] = [
  { id: 'mon_star_slime', playerLv: 3, atk: 22, def: 18, hp: 130, areaMin: 1, areaMax: 6, ttkBand: [2, 4] },
  { id: 'mon_bandit', playerLv: 6, atk: 32, def: 28, hp: 175, areaMin: 4, areaMax: 8, ttkBand: [2, 4] },
  { id: 'mon_drift_undead', playerLv: 12, atk: 48, def: 38, hp: 260, areaMin: 8, areaMax: 14, ttkBand: [3, 5] },
  { id: 'mon_arc_residue', playerLv: 56, atk: 120, def: 95, hp: 920, areaMin: 52, areaMax: 62, ttkBand: [4, 6] },
  { id: 'mon_old_army', playerLv: 78, atk: 210, def: 280, hp: 2680, areaMin: 58, areaMax: 80, ttkBand: [5, 8] },
];

function avg(fn: () => number, n = 200): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += fn();
  return Math.round(s / n);
}

function main() {
  const rows: string[][] = [];
  initAuditDb();

  for (const c of CASES) {
    const seed = MONSTER_SEED_DATA.find((m) => m.id === c.id);
    if (!seed) {
      rows.push([c.id, '?', '?', '?', 'missing', 'FAIL', '']);
      result.warns.push(`missing ${c.id}`);
      continue;
    }
    const scaled = scaleMonsterForBattle({
      id: seed.id, area_tag: seed.tag, level: seed.lv, hp: seed.hp, attack: seed.atk,
      magic: seed.mag, defense: seed.def, spirit: seed.mag, speed: seed.spd,
      is_boss: seed.boss ? 1 : 0,
    });
    const diff = getDifficultyModifiers(c.playerLv, c.areaMin, c.areaMax, { isValhalla: seed.tag === 'valhalla' });
    const dmgPerTurn = avg(() => calcPhysicalDamage(c.atk, scaled.defense, 1, 0));
    const ttk = Math.ceil(scaled.hp / Math.max(1, dmgPerTurn));
    const taken = avg(() => calcEnemyDamageToPlayer({
      attack: scaled.attack,
      playerDefense: c.def,
      playerMaxHp: c.hp,
      playerLevel: c.playerLv,
      monsterLevel: seed.lv,
      threatTier: scaled.threatTier,
      takenMult: diff.playerTaken,
    }));
    const takenPct = Math.round((taken / c.hp) * 100);
    let status = 'OK';
    if (ttk < c.ttkBand[0] || ttk > c.ttkBand[1] + 1) {
      status = 'WARN';
      result.warns.push(`${c.id} TTK ${ttk} outside ${c.ttkBand.join('-')}`);
    }
    if (c.playerLv <= 10 && takenPct > 35) {
      status = 'WARN';
      result.warns.push(`${c.id} early taken ${takenPct}% HP`);
    }
    rows.push([
      c.id, String(c.playerLv), String(ttk), `${c.ttkBand[0]}-${c.ttkBand[1]}`,
      String(taken), `${takenPct}%`, status, `atk=${c.atk} def=${c.def}`,
    ]);
  }

  writeMdCsvPair(
    'early-game-difficulty-audit',
    ['enemy_id', 'player_level', 'turns_to_kill', 'ttk_band', 'avg_taken', 'taken_hp_pct', 'status', 'notes'],
    rows,
    ['## 難易度（序盤〜ヴァルハラ）', '', 'TTKと1撃被ダメ目安。'],
  );
  exitCheckResult('early-game-difficulty-audit', result);
}

main();
