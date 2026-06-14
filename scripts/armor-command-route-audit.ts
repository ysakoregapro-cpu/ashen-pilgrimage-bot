/** armor-command-route-audit.ts */
import {
  armorsInCategory,
  buildEquipmentRouteLines,
  getArmorBookCategories,
  getArmorRouteBook,
  listAllArmorIds,
} from '../src/systems/equipmentRouteBook';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'armor_id', 'armor_name', 'rarity', 'series', 'slot', 'listed_in_command',
  'has_route_detail', 'explore_routes', 'enemy_drop_routes', 'boss_rematch_routes',
  'shop_routes', 'special_routes', 'legacy_or_unavailable', 'balance_note',
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

  const armors = getArmorRouteBook();
  const listed = new Set<string>();
  for (const cat of getArmorBookCategories()) {
    for (const a of armorsInCategory(cat.id)) listed.add(a.item_id);
  }

  const rows: string[][] = [];
  for (const a of armors) {
    const routes = buildEquipmentRouteLines(a.item_id);
    const text = routes.join('\n');
    const explore = text.includes('探索') ? 'YES' : 'NO';
    const enemy = text.includes('敵') || text.includes('魔物') ? 'YES' : 'NO';
    const boss = text.includes('ボス') || text.includes('再戦') ? 'YES' : 'NO';
    const shop = text.includes('ショップ') ? 'YES' : 'NO';
    const special = text.includes('交換') || text.includes('ヴァルハラ') ? 'YES' : 'NO';
    const legacy = a.legacy || text.includes('通常入手不可') ? 'YES' : 'NO';
    const inCmd = listed.has(a.item_id) ? 'YES' : 'NO';
    const hasDetail = routes.length > 0 ? 'YES' : 'NO';

    if (inCmd === 'NO') result.fails.push(`${a.item_id}: not in command categories`);
    if (hasDetail === 'NO' && !a.legacy) result.warns.push(`${a.item_id}: no route lines`);

    rows.push([
      a.item_id, a.name, a.rarity, a.series_id ?? '—', a.slot,
      inCmd, hasDetail, explore, enemy, boss, shop, special, legacy,
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
