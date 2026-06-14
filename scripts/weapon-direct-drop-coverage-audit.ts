/** weapon-direct-drop-coverage-audit.ts */
import {
  formatEquipmentRouteLines,
  getEquipmentRouteDetails,
  getEquipmentRouteSectionFlags,
} from '../src/systems/equipmentRouteDetailSystem';
import {
  countWeaponDirectRoutes,
  getForgeRouteDisplay,
  weaponHasDirectEnemyOrBossDrop,
} from '../src/systems/equipmentForgeRouteSystem';
import {
  formatWeaponFamilyLabel,
  getWeaponRouteBook,
} from '../src/systems/equipmentRouteBook';
import { ensureDropBalanceSeed } from '../src/db/seedData/dropBalanceSeed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'weapon_id', 'weapon_name', 'rarity', 'weapon_family', 'direct_explore_routes',
  'direct_shop_routes', 'direct_enemy_drop_routes', 'direct_boss_first_clear_routes',
  'direct_boss_rematch_routes', 'direct_exchange_routes', 'forge_or_transform_route',
  'material_routes', 'is_direct_enemy_drop_zero', 'is_direct_boss_drop_zero',
  'is_expected_zero', 'needs_route_review', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('weapon-direct-drop-coverage-audit', HEADERS, [], ['## DB unavailable']);
    exitCheckResult('weapon-direct-drop-coverage-audit', result);
    return;
  }
  ensurePhase2EquipmentRoutes(init.db);
  ensureDropBalanceSeed(init.db);
  ensureMasterDataSeed(init.db);

  const weapons = getWeaponRouteBook();
  const rows: string[][] = [];
  let enemyDropWeapons = 0;
  let bossRematchWeapons = 0;
  let exploreWeapons = 0;
  let shopWeapons = 0;
  let forgeWeapons = 0;
  let unavailableWeapons = 0;

  for (const w of weapons) {
    const routes = getEquipmentRouteDetails(w.item_id);
    const counts = countWeaponDirectRoutes(w.item_id, routes);
    const direct = weaponHasDirectEnemyOrBossDrop(routes);
    const flags = getEquipmentRouteSectionFlags(w.item_id);
    const forge = getForgeRouteDisplay(w.item_id);
    const lines = formatEquipmentRouteLines(w.item_id);
    const hasMaterialSection = lines.some((l) => l.includes('【素材入手先】'));

    if (counts.enemyDrop > 0) enemyDropWeapons++;
    if (counts.bossRematch > 0) bossRematchWeapons++;
    if (counts.explore > 0) exploreWeapons++;
    if (counts.shop > 0) shopWeapons++;
    if (forge?.hasForgeRoute || counts.forge > 0) forgeWeapons++;
    if (counts.unavailable > 0 || w.legacy) unavailableWeapons++;

    const isEnemyZero = counts.enemyDrop === 0;
    const isBossZero = counts.bossRematch === 0;
    const needsReview = !w.legacy && !forge?.hasForgeRoute && isEnemyZero && isBossZero && counts.explore === 0 && counts.shop === 0;

    if (needsReview) {
      result.warns.push(`${w.item_id}: 直接入手・forge 以外のルートなし`);
    }
    if ((w.rarity === 'Uni' || w.rarity === 'Src') && !hasMaterialSection && !w.legacy) {
      result.fails.push(`${w.item_id}: Uni/Src なのに素材入手先セクションなし`);
    }

    rows.push([
      w.item_id,
      w.name,
      w.rarity,
      formatWeaponFamilyLabel(w),
      String(counts.explore),
      String(counts.shop),
      String(counts.enemyDrop),
      String(counts.bossFirstClear),
      String(counts.bossRematch),
      String(counts.exchange),
      forge?.hasForgeRoute ? (forge.routeType ?? 'forge') : (counts.forge > 0 ? 'forge' : 'none'),
      hasMaterialSection ? 'YES' : 'NO',
      isEnemyZero ? 'YES' : 'NO',
      isBossZero ? 'YES' : 'NO',
      isEnemyZero && isBossZero ? 'YES' : 'NO',
      needsReview ? 'YES' : 'NO',
      flags.legacyOrUnavailable ? 'legacy' : direct.enemy ? 'enemy_drop' : 'explore_or_forge',
    ]);
  }

  const summary = [
    '## Summary',
    '',
    `- 全武器数: ${weapons.length}`,
    `- 敵討伐で直接落ちる武器数: ${enemyDropWeapons}`,
    `- ボス再戦で直接落ちる武器数: ${bossRematchWeapons}`,
    `- 探索で手に入る武器数: ${exploreWeapons}`,
    `- ショップで手に入る武器数: ${shopWeapons}`,
    `- 強化/変質で手に入る武器数: ${forgeWeapons}`,
    `- 通常入手不可: ${unavailableWeapons}`,
    '',
    enemyDropWeapons === 0 && bossRematchWeapons === 0
      ? '直接ドロップ0件は実データ上の結果（武器本体は探索/ショップ/強化変質が主）'
      : `直接敵/ボスドロップあり: enemy=${enemyDropWeapons} boss=${bossRematchWeapons}`,
    '素材ドロップ経由で入手する武器は素材入手先を表示',
  ];

  writeMdCsvPair('weapon-direct-drop-coverage-audit', HEADERS, rows, summary);
  exitCheckResult('weapon-direct-drop-coverage-audit', result);
}

main();
