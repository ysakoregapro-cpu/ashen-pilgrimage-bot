/** mp-economy-balance-check — npx tsx scripts/mp-economy-balance-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { MANA_CONSUMABLES } from '../src/db/seedData/manaConsumables';
import { getBattleRewardMultipliers } from '../src/systems/enemyBalanceV2';
import { VALHALLA_EXCHANGE_TABLE } from '../src/db/seedData/valhallaExchangeMaster';
import { VALHALLA_REPEAT_REWARDS } from '../src/db/seedData/valhallaRewardMaster';

const result = emptyResult();

type TierSample = {
  label: string;
  areaTags: string[];
  minLv: number;
  maxLv: number;
  itemId: string;
  fightBand: [number, number];
  idealBand?: [number, number];
};

const TIER_SAMPLES: TierSample[] = [
  { label: 'early', areaTags: ['starfield'], minLv: 5, maxLv: 8, itemId: 'cons_mana_drop', fightBand: [5, 7] },
  { label: 'mid', areaTags: ['port', 'mine'], minLv: 14, maxLv: 22, itemId: 'cons_mana_vial', fightBand: [6, 10], idealBand: [5, 8] },
  { label: 'late', areaTags: ['furnace', 'library'], minLv: 48, maxLv: 58, itemId: 'cons_mana_flask', fightBand: [6, 10] },
  { label: 'valhalla', areaTags: ['valhalla'], minLv: 58, maxLv: 72, itemId: 'cons_mana_valhalla', fightBand: [8, 10] },
];

function avgEffectiveGold(
  db: ReturnType<typeof import('../src/db/database').getDb>,
  areaTags: string[],
  minLv: number,
  maxLv: number,
): number {
  const placeholders = areaTags.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT AVG(gold_reward) AS avgG FROM monsters
    WHERE area_tag IN (${placeholders}) AND level BETWEEN ? AND ? AND is_boss = 0
  `).get(...areaTags, minLv, maxLv) as { avgG: number | null };
  const base = row.avgG ?? 0;
  const mult = getBattleRewardMultipliers({
    threatTier: 'normal',
    areaTag: areaTags.includes('valhalla') ? 'valhalla' : areaTags[0]!,
    isBoss: false,
    isRematch: false,
  }).goldMult;
  return Math.max(1, Math.floor(base * mult));
}

function main() {
  const rows: string[][] = [];
  const init = initAuditDb();

  if (init.ok) {
    const { db } = init;

    for (const tier of TIER_SAMPLES) {
      const effGold = avgEffectiveGold(db, tier.areaTags, tier.minLv, tier.maxLv);
      const item = MANA_CONSUMABLES.find((m) => m.id === tier.itemId)!;
      const fights = Math.ceil(item.buyPrice / effGold);
      const [lo, hi] = tier.fightBand;
      const ok = fights >= lo && fights <= hi;
      rows.push([
        tier.label, tier.areaTags.join('+'), String(effGold), String(item.buyPrice),
        String(fights), ok ? 'OK' : 'WARN', `${lo}-${hi}戦`, item.name,
      ]);
      if (!ok) result.warns.push(`${item.id}@${tier.label}: ${fights}戦 (目安${lo}-${hi}, 実効G${effGold})`);

      if (tier.idealBand) {
        const [iLo, iHi] = tier.idealBand;
        const idealOk = fights >= iLo && fights <= iHi;
        rows.push([
          item.id, 'ideal', String(fights), idealOk ? 'OK' : 'WARN',
          `${iLo}-${iHi}戦`, `実効G${effGold}`, '中盤理想帯',
        ]);
        if (!idealOk) result.warns.push(`${item.id} 理想帯 ${fights}戦 (目安${iLo}-${iHi})`);
      }
    }

    const valhallaItem = MANA_CONSUMABLES.find((m) => m.id === 'cons_mana_valhalla')!;
    const valGold = avgEffectiveGold(db, ['valhalla'], 58, 72);
    const bossGoldMid = Math.floor((VALHALLA_REPEAT_REWARDS.goldMin + VALHALLA_REPEAT_REWARDS.goldMax) / 2);
    const perBoss = Math.floor(bossGoldMid / valhallaItem.buyPrice);
    rows.push([
      'cons_mana_valhalla', 'boss_rematch', String(bossGoldMid), String(perBoss),
      perBoss >= 2 ? 'OK' : 'WARN', '2個前後/再戦', 'ボスG中央値',
    ]);
    if (perBoss < 2) result.warns.push(`ボス再戦で青霊薬 ${perBoss}個分`);

    const exchange = VALHALLA_EXCHANGE_TABLE.find((e) => e.exchange_id === 'vex_mana_valhalla');
    if (exchange) {
      rows.push([
        'vex_mana_valhalla', 'emblem_cost', String(exchange.cost_valhalla_emblem),
        exchange.cost_valhalla_emblem >= 6 && exchange.cost_valhalla_emblem <= 8 ? 'OK' : 'WARN',
        '6-8徽章', '徽章交換',
      ]);
      if (exchange.cost_valhalla_emblem < 6 || exchange.cost_valhalla_emblem > 8) {
        result.warns.push(`徽章交換 ${exchange.cost_valhalla_emblem} (目安6-8)`);
      }
    } else {
      result.fails.push('vex_mana_valhalla exchange missing');
    }

    const maxMpRef = 350;
    for (const item of MANA_CONSUMABLES) {
      const pct = Math.round((item.mpHeal / maxMpRef) * 100);
      rows.push([item.id, 'mp_pct_lv80', `${pct}%`, pct <= 55 ? 'OK' : 'WARN', '最大MP比', `MP+${item.mpHeal}`]);
      if (pct > 55) result.warns.push(`${item.id} heals ${pct}% of ref MP`);
    }
  } else {
    result.warns.push(`DB不可: ${init.error}`);
  }

  writeMdCsvPair(
    'mp-economy-balance-summary',
    ['item_or_metric', 'tier', 'value', 'price_or_count', 'fights_or_status', 'band', 'notes'],
    rows,
    ['## MP経済', '', '各進行帯の平均実効Gで購入戦数を検証。'],
  );
  exitCheckResult('mp-economy-balance-check', result);
}

main();
