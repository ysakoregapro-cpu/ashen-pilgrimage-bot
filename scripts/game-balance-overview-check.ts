/** game-balance-overview-check — npx tsx scripts/game-balance-overview-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { buildWeaponPowerComparison, judgeSrcVsUrDiff } from '../src/systems/weaponPowerComparison';
import { calcUpgradeStatBonuses } from '../src/systems/enhanceSystem';
import { UR_MAX_AWAKENING_PRIMARY_BONUS } from '../src/db/seedData/weaponTierBalanceMaster';
import { WEAPON_ROLE_STAT_MAP } from '../src/db/seedData/weaponRoleStatMap';
import { VALHALLA_REPEAT_REWARDS } from '../src/db/seedData/valhallaRewardMaster';

const result = emptyResult();

function main() {
  const rows: string[][] = [];
  const init = initAuditDb();

  rows.push(['weapon_role_map_entries', String(WEAPON_ROLE_STAT_MAP.length), 'OK', '静的マスタ']);

  if (init.ok) {
    const weapons = buildWeaponPowerComparison(init.db, calcUpgradeStatBonuses);
    let weaponOk = 0;
    for (const w of weapons) {
      const urAw = w.urMax + UR_MAX_AWAKENING_PRIMARY_BONUS;
      const j = judgeSrcVsUrDiff(w.srcMax, w.urMax);
      if (w.srcMax > urAw && j.ok) weaponOk++;
    }
    rows.push(['weapon_tier_ok', `${weaponOk}/${weapons.length}`, weaponOk === weapons.length ? 'OK' : 'WARN', 'Src>UR+aw']);
    if (weaponOk < weapons.length) result.warns.push(`武器序列: ${weaponOk}/${weapons.length} OK`);

    rows.push(['valhalla_emblem_repeat', `${VALHALLA_REPEAT_REWARDS.emblemMin}-${VALHALLA_REPEAT_REWARDS.emblemMax}`, 'OK', '再戦徽章']);
    rows.push(['valhalla_gold_repeat', `${VALHALLA_REPEAT_REWARDS.goldMin}-${VALHALLA_REPEAT_REWARDS.goldMax}`, 'OK', '再戦Gold']);
  } else {
    result.warns.push(`DB監査スキップ: ${init.error}`);
    rows.push(['db_weapon_audit', 'SKIP', 'WARN', 'VPS側で要実行']);
  }

  rows.push(['effective_stat_fn', 'getEquipmentEffectiveStats', 'OK', 'itemDetail/compare共用']);

  writeMdCsvPair(
    'game-balance-overview',
    ['area', 'value', 'status', 'notes'],
    rows,
    ['## ゲームバランス概要', '', '主要監査項目のサマリー。'],
  );
  exitCheckResult('game-balance-overview-check', result);
}

main();
