/** gold-income-balance-audit.ts — 通常戦4戦Goldのみで宿代回収可否 */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { calcInnCostForProgressTier } from '../src/systems/innSystem';
import { getBattleRewardMultipliers } from '../src/systems/enemyBalanceV2';
import { getMonsterThreatTier } from '../src/systems/combatMath';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'area_id', 'area_name', 'level_band', 'avg_gold_per_battle', 'avg_gold_per_explore',
  'expected_gold_after_four_battles', 'inn_price_at_progress', 'can_pay_inn_after_four_battles', 'balance_note',
];

function progressTierFromArea(minLv: number): number {
  if (minLv >= 55) return 55;
  if (minLv >= 40) return 40;
  if (minLv >= 28) return 28;
  if (minLv >= 15) return 15;
  return 10;
}

function minFourBattleGoldForTier(tier: number): number {
  if (tier >= 55) return 400;
  if (tier >= 40) return 340;
  if (tier >= 28) return 180;
  return 100;
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('gold-income-balance-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('gold-income-balance-audit', result);
    return;
  }
  ensurePhase2Seed(init.db);
  const db = init.db;
  const areas = db.prepare(`
    SELECT ea.id, ea.name, ea.recommended_min_level, ea.monster_pool_json, ea.town_id
    FROM exploration_areas ea ORDER BY ea.recommended_min_level LIMIT 12
  `).all() as Array<{ id: string; name: string; recommended_min_level: number; monster_pool_json: string; town_id: string }>;

  const rows: string[][] = [];
  for (const area of areas) {
    const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string }>;
    const tier = progressTierFromArea(area.recommended_min_level);
    const inn = calcInnCostForProgressTier(tier);
    const minFour = minFourBattleGoldForTier(tier);

    let battleSum = 0;
    let battleCount = 0;
    for (const p of pool) {
      const mon = db.prepare('SELECT gold_reward, area_tag, level FROM monsters WHERE id = ?').get(p.monster_id) as {
        gold_reward: number; area_tag: string; level: number;
      } | undefined;
      if (!mon) continue;
      const threat = getMonsterThreatTier(p.monster_id);
      const mult = getBattleRewardMultipliers({ threatTier: threat, areaTag: mon.area_tag, isBoss: false, isRematch: false });
      battleSum += Math.floor(mon.gold_reward * mult.goldMult);
      battleCount++;
    }
    const avgBattleGold = battleCount ? Math.round(battleSum / battleCount) : 0;
    const four = avgBattleGold * 4;
    const exploreGold = Math.floor(area.recommended_min_level * 4 + 30);
    const canPay = four >= inn;
    const band = area.recommended_min_level <= 15 ? 'early' : area.recommended_min_level <= 40 ? 'mid' : area.recommended_min_level >= 55 ? 'valhalla' : 'late';

    if (!canPay) {
      result.fails.push(`${area.id}: battle-only 4x ${four}G < inn ${inn}G (need ${minFour}G+)`);
    } else if (four < minFour) {
      result.warns.push(`${area.id}: 4 battle ${four}G meets inn ${inn}G but below band target ${minFour}G`);
    }

    rows.push([
      area.id, area.name, band,
      String(avgBattleGold), String(exploreGold), String(four), String(inn),
      canPay ? 'OK' : 'FAIL', `pool=${battleCount}`,
    ]);
  }

  writeMdCsvPair('gold-income-balance-audit', HEADERS, rows, [
    '## Summary',
    '',
    '- 判定: **通常戦4戦Goldのみ**（探索Goldは参考列）',
    `- fails: ${result.fails.length} | warns: ${result.warns.length}`,
  ]);
  exitCheckResult('gold-income-balance-audit', result);
}

main();
