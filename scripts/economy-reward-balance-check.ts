/** economy-reward-balance-check — npx tsx scripts/economy-reward-balance-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { calcInnCost, calcShrineCost } from '../src/systems/innSystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { VALHALLA_REPEAT_REWARDS } from '../src/db/seedData/valhallaRewardMaster';
import { getEnhanceRequirement } from '../src/systems/enhanceSystem';
import { getBattleRewardMultipliers } from '../src/systems/enemyBalanceV2';

const TEST_USER = 'economy-reward-balance-user';
const result = emptyResult();

function main() {
  const rows: string[][] = [];
  const init = initAuditDb();

  if (init.ok) {
    const { db } = init;
    if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');
    db.prepare('UPDATE players SET level = 80, gold = 50000, current_town_id = ? WHERE user_id = ?').run('valhalla_fortress', TEST_USER);

    const inn = calcInnCost(TEST_USER, 'valhalla_fortress');
    const shrine = calcShrineCost(TEST_USER, 'valhalla_fortress');
    rows.push(['inn_cost_lv80_valhalla', String(inn), 'OK', '宿代']);
    rows.push(['shrine_half', String(shrine), shrine === Math.floor(inn * 0.5) ? 'OK' : 'FAIL', '救護所半額']);
    if (shrine !== Math.floor(inn * 0.5)) result.fails.push('救護所が宿屋半額でない');

    const bandit = db.prepare('SELECT gold_reward, exp_reward FROM monsters WHERE id = ?').get('mon_bandit') as { gold_reward: number; exp_reward: number } | undefined;
    if (bandit) {
      rows.push(['early_gold_bandit', String(bandit.gold_reward), bandit.gold_reward <= 30 ? 'OK' : 'WARN', '序盤1戦']);
      if (bandit.gold_reward > 30) result.warns.push(`序盤 gold ${bandit.gold_reward} > 30`);
    }

    const valhallaGoldMult = getBattleRewardMultipliers({
      threatTier: 'normal',
      areaTag: 'valhalla',
      isBoss: false,
      isRematch: false,
    }).goldMult;

    const valhallaMon = db.prepare(`
      SELECT AVG(gold_reward) AS avgG, AVG(exp_reward) AS avgE FROM monsters
      WHERE area_tag = 'valhalla' AND is_boss = 0
    `).get() as { avgG: number; avgE: number };
    const baseAvgG = Math.round(valhallaMon.avgG);
    const effectiveAvgG = Math.floor(valhallaMon.avgG * valhallaGoldMult);
    rows.push(['valhalla_normal_avg_gold_base', String(baseAvgG), 'OK', 'seed基礎']);
    rows.push(['valhalla_normal_avg_gold_effective', String(effectiveAvgG), 'OK', '180-320目安（戦闘倍率込）']);
    rows.push(['valhalla_normal_avg_exp', String(Math.round(valhallaMon.avgE)), 'OK', '250-450目安']);
    if (effectiveAvgG < 180 || effectiveAvgG > 320) {
      result.warns.push(`ヴァルハラ通常実効G ${effectiveAvgG}（目安180-320）`);
    }

    const urEnh = getEnhanceRequirement(14, 'UR');
    rows.push(['ur_plus15_gold', String(urEnh.goldCost), urEnh.goldCost <= 40000 ? 'OK' : 'WARN', 'UR強化費']);

    rows.push(['valhalla_boss_gold', `${VALHALLA_REPEAT_REWARDS.goldMin}-${VALHALLA_REPEAT_REWARDS.goldMax}`, 'OK', '再戦']);
    rows.push(['valhalla_boss_emblem', `${VALHALLA_REPEAT_REWARDS.emblemMin}-${VALHALLA_REPEAT_REWARDS.emblemMax}`, 'OK', '再戦']);

    const fightsForInn = inn > 0 ? Math.ceil(inn / Math.max(1, effectiveAvgG)) : 0;
    rows.push(['fights_per_inn_valhalla', String(fightsForInn), fightsForInn >= 6 && fightsForInn <= 10 ? 'OK' : 'WARN', '6-10戦目安']);
    if (fightsForInn < 6 || fightsForInn > 10) {
      result.warns.push(`宿泊=${fightsForInn}戦分（ヴァルハラ目安6-10）`);
    }

    const bossGoldMid = Math.floor((VALHALLA_REPEAT_REWARDS.goldMin + VALHALLA_REPEAT_REWARDS.goldMax) / 2);
    const bossFightsForInn = bossGoldMid > 0 ? Math.floor(bossGoldMid / Math.max(1, effectiveAvgG)) : 0;
    rows.push(['inn_per_boss_rematch', String(bossFightsForInn), bossFightsForInn >= 2 ? 'OK' : 'WARN', 'ボス1回で数回宿泊']);
  } else {
    result.warns.push(`DB不可: ${init.error}`);
    rows.push(['db', 'SKIP', 'WARN', init.error]);
  }

  writeMdCsvPair(
    'economy-reward-balance-summary',
    ['metric', 'value', 'status', 'notes'],
    rows,
    ['## 経済・報酬バランス', '', '宿代・探索報酬（実効G）・強化費・ヴァルハラ再戦。'],
  );
  exitCheckResult('economy-reward-balance-check', result);
}

main();
