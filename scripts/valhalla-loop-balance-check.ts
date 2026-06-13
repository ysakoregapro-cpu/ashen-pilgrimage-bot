/** valhalla-loop-balance-check — npx tsx scripts/valhalla-loop-balance-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import {
  VALHALLA_REPEAT_REWARDS, VALHALLA_FIRST_CLEAR_REWARDS, VALHALLA_REPEAT_MATERIAL_POOL,
} from '../src/db/seedData/valhallaRewardMaster';
import { VALHALLA_EXCHANGE_TABLE, getUiAvailableExchanges } from '../src/db/seedData/valhallaExchangeMaster';

const result = emptyResult();

function main() {
  const rows: string[][] = [];
  const rp = VALHALLA_REPEAT_REWARDS;
  const fc = VALHALLA_FIRST_CLEAR_REWARDS;

  rows.push(['first_emblem', String(fc.emblem), 'OK', '初回確定']);
  rows.push(['repeat_emblem', `${rp.emblemMin}-${rp.emblemMax}`, rp.emblemMin >= 4 && rp.emblemMax <= 8 ? 'OK' : 'WARN', '再戦']);
  rows.push(['repeat_exp', `${rp.expMin}-${rp.expMax}`, 'OK', '']);
  rows.push(['repeat_job_exp', `${rp.jobExpMin}-${rp.jobExpMax}`, 'OK', '']);
  rows.push(['repeat_gold', `${rp.goldMin}-${rp.goldMax}`, 'OK', '']);
  rows.push(['silent_page_repeat', `${rp.silentPageRate * 100}%`, rp.silentPageRate === 0.04 ? 'OK' : 'WARN', '再戦4%']);
  rows.push(['material_pool_size', String(VALHALLA_REPEAT_MATERIAL_POOL.length), 'OK', '高級素材']);

  if (rp.emblemMin < 4 || rp.emblemMax > 8) result.warns.push('徽章再戦レンジが設計外');
  if (rp.silentPageRate !== 0.04) result.warns.push(`無答の頁再戦率 ${rp.silentPageRate}`);

  for (const tier of getUiAvailableExchanges()) {
    rows.push([`exchange_${tier.cost_valhalla_emblem}`, tier.receive_item_name, 'OK', tier.notes.slice(0, 60)]);
    if (tier.cost_valhalla_emblem === 10 && tier.receive_item_id !== 'rep_deep_repair') {
      result.warns.push('10徽章交換が深層修復材でない可能性');
    }
  }

  const futureHidden = VALHALLA_EXCHANGE_TABLE.filter((t) => !t.ui_implemented || !t.currently_available);
  rows.push(['future_exchange_tiers_hidden', String(futureHidden.length), 'OK', 'UI非表示']);

  writeMdCsvPair(
    'valhalla-loop-balance-summary',
    ['metric', 'value', 'status', 'notes'],
    rows,
    ['## ヴァルハラ周回ループ', '', 'ボス再戦報酬・徽章交換価値。'],
  );
  exitCheckResult('valhalla-loop-balance-check', result);
}

main();
