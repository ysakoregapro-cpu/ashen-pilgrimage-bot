/**
 * Quick combat balance sanity log — run: npx tsx scripts/combat-balance-check.ts
 */
import { getDb } from '../src/db/database';
import { scaleMonsterForBattle, calcEnemyDamageToPlayer, calcPhysicalDamage } from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';

type Case = { area: string; monsterId: string; areaMin: number; areaMax: number; playerLv: number; playerDef: number; playerHp: number; playerAtk: number };

const CASES: Case[] = [
  { area: '旧採掘路', monsterId: 'mon_rust_miner', areaMin: 12, areaMax: 20, playerLv: 14, playerDef: 45, playerHp: 280, playerAtk: 55 },
  { area: '旧採掘路', monsterId: 'mon_mine_bat', areaMin: 12, areaMax: 20, playerLv: 14, playerDef: 45, playerHp: 280, playerAtk: 55 },
  { area: '結晶の縦穴', monsterId: 'mon_silver_golem', areaMin: 16, areaMax: 24, playerLv: 13, playerDef: 65, playerHp: 335, playerAtk: 60 },
  { area: '結晶の縦穴', monsterId: 'mon_crystal_spider', areaMin: 16, areaMax: 24, playerLv: 13, playerDef: 65, playerHp: 335, playerAtk: 60 },
  { area: '海霧の倉庫街', monsterId: 'mon_drift_undead', areaMin: 16, areaMax: 22, playerLv: 13, playerDef: 60, playerHp: 320, playerAtk: 58 },
];

function simulateEnemyHits(c: Case, scale: ReturnType<typeof scaleMonsterForBattle>, takenMult: number, n = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(calcEnemyDamageToPlayer({
      attack: scale.attack,
      playerDefense: c.playerDef,
      playerMaxHp: c.playerHp,
      threatTier: scale.threatTier,
      takenMult,
    }));
  }
  return out;
}

function main() {
  let db;
  try { db = getDb(); } catch {
    console.log('DB未接続 — seed後に再実行してください');
    process.exit(0);
  }

  console.log('=== 戦闘バランス簡易ログ ===\n');
  for (const c of CASES) {
    const row = db.prepare('SELECT * FROM monsters WHERE id = ?').get(c.monsterId) as {
      id: string; name: string; area_tag: string; hp: number; attack: number; magic: number;
      defense: number; spirit: number; speed: number; is_boss?: number;
    } | undefined;
    if (!row) continue;

    const scale = scaleMonsterForBattle({ ...row, id: row.id });
    const diff = getDifficultyModifiers(c.playerLv, c.areaMin, c.areaMax);
    const enemyHits = simulateEnemyHits(c, scale, diff.playerTaken);
    const playerHit = calcPhysicalDamage(c.playerAtk, scale.defense, diff.playerDamage);
    const turns = Math.ceil(scale.hp / Math.max(1, playerHit));

    const minE = Math.min(...enemyHits);
    const maxE = Math.max(...enemyHits);
    const note = minE <= 5 ? '⚠ 敵火力が低すぎる可能性' : turns <= 2 ? '⚠ 短すぎる討伐' : 'OK';

    console.log([
      `エリア: ${c.area}`,
      `敵: ${row.name} (${scale.threatTier})`,
      `推奨Lv: ${c.areaMin}-${c.areaMax} / プレイヤーLv${c.playerLv}`,
      `敵HP(戦闘): ${scale.hp} / 敵攻(戦闘): ${scale.attack}`,
      `敵→プレイヤー: ${minE}-${maxE} (被ダメ倍率${diff.playerTaken})`,
      `プレイヤー→敵: 約${playerHit}/hit → 討伐${turns}手`,
      `判定: ${note}`,
      '',
    ].join('\n'));
  }
}

main();
