/** armor-command-route-audit.ts */
import {
  armorsInCategory,
  buildEquipmentRouteLines,
  getArmorBookCategories,
  getArmorRouteBook,
  listAllArmorIds,
} from '../src/systems/equipmentRouteBook';
import { getEquipmentRouteSectionFlags } from '../src/systems/equipmentRouteDetailSystem';
import { ensureDropBalanceSeed } from '../src/db/seedData/dropBalanceSeed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'armor_id', 'armor_name', 'rarity', 'series', 'slot', 'listed_in_command',
  'has_route_detail', 'explore_routes', 'enemy_drop_routes', 'boss_rematch_routes',
  'exchange_routes', 'shop_routes', 'special_routes', 'has_none_sections',
  'legacy_or_unavailable', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('armor-command-route-audit', HEADERS, [], ['DB unavailable']);
    exitCheckResult('armor-command-route-audit', result);
    return;
  }
  ensurePhase2EquipmentRoutes(init.db);
  ensureDropBalanceSeed(init.db);
  ensureMasterDataSeed(init.db);

  const armors = getArmorRouteBook();
  const listed = new Set<string>();
  for (const cat of getArmorBookCategories()) {
    for (const a of armorsInCategory(cat.id)) listed.add(a.item_id);
  }

  const rows: string[][] = [];
  for (const a of armors) {
    const routes = buildEquipmentRouteLines(a.item_id);
    const text = routes.join('\n');
    const flags = getEquipmentRouteSectionFlags(a.item_id);
    const explore = flags.hasExplore || text.includes('【探索】') ? 'YES' : 'NO';
    const enemy = flags.hasEnemyDrop ? 'YES' : 'NO';
    const boss = flags.hasBossRematch ? 'YES' : 'NO';
    const exchange = flags.hasExchange ? 'YES' : 'NO';
    const shop = flags.hasShop || text.includes('【ショップ】') ? 'YES' : 'NO';
    const special = text.includes('【強化/変質】') || text.includes('【特殊】') || text.includes('【ヴァルハラ再戦報酬】') ? 'YES' : 'NO';
    const legacy = a.legacy || flags.legacyOrUnavailable ? 'YES' : 'NO';
    const inCmd = listed.has(a.item_id) ? 'YES' : 'NO';
    const hasDetail = routes.length > 0 ? 'YES' : 'NO';
    const noneSections = flags.hasNoneSections ? 'YES' : 'NO';

    if (inCmd === 'NO') result.fails.push(`${a.item_id}: not in command categories`);
    if (hasDetail === 'NO' && !a.legacy) result.warns.push(`${a.item_id}: no route lines`);
    if (!a.legacy && !text.includes('【敵討伐】')) {
      result.fails.push(`${a.item_id}: missing enemy drop section`);
    }
    if (!a.legacy && !text.includes('【ボス再戦】')) {
      result.fails.push(`${a.item_id}: missing boss rematch section`);
    }

    rows.push([
      a.item_id, a.name, a.rarity, a.series_id ?? '—', a.slot,
      inCmd, hasDetail, explore, enemy, boss, exchange, shop, special, noneSections, legacy,
      listed.has(a.item_id) ? 'ok' : 'missing',
    ]);
  }

  if (listed.size !== listAllArmorIds().length) {
    result.fails.push(`listed ${listed.size} vs total ${listAllArmorIds().length}`);
  }

  writeMdCsvPair('armor-command-route-audit', HEADERS, rows, [`- armor: ${armors.length}`]);
  exitCheckResult('armor-command-route-audit', result);
}

main();
