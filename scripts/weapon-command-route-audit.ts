/** weapon-command-route-audit.ts */
import {
  buildEquipmentRouteLines,
  getWeaponBookCategories,
  getWeaponRouteBook,
  listAllWeaponIds,
  weaponsInCategory,
} from '../src/systems/equipmentRouteBook';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'weapon_id', 'weapon_name', 'rarity', 'job_or_weapon_family', 'listed_in_command',
  'has_route_detail', 'explore_routes', 'enemy_drop_routes', 'boss_rematch_routes',
  'shop_routes', 'special_routes', 'legacy_or_unavailable', 'balance_note',
];

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('weapon-command-route-audit', HEADERS, [], ['DB unavailable']);
    exitCheckResult('weapon-command-route-audit', result);
    return;
  }

  const weapons = getWeaponRouteBook();
  const listed = new Set<string>();
  for (const cat of getWeaponBookCategories()) {
    for (const w of weaponsInCategory(cat.id)) listed.add(w.item_id);
  }

  const rows: string[][] = [];
  for (const w of weapons) {
    const routes = buildEquipmentRouteLines(w.item_id);
    const text = routes.join('\n');
    const explore = text.includes('探索') ? 'YES' : 'NO';
    const enemy = text.includes('敵') || text.includes('魔物') ? 'YES' : 'NO';
    const boss = text.includes('ボス') || text.includes('再戦') ? 'YES' : 'NO';
    const shop = text.includes('ショップ') ? 'YES' : 'NO';
    const special = text.includes('変質') || text.includes('伝承') || text.includes('Src') ? 'YES' : 'NO';
    const legacy = w.legacy || text.includes('通常入手不可') ? 'YES' : 'NO';
    const inCmd = listed.has(w.item_id) ? 'YES' : 'NO';
    const hasDetail = routes.length > 0 ? 'YES' : 'NO';

    if (inCmd === 'NO') result.fails.push(`${w.item_id}: not in command categories`);
    if (hasDetail === 'NO' && !w.legacy) result.warns.push(`${w.item_id}: no route lines`);

    rows.push([
      w.item_id, w.name, w.rarity, w.required_job ?? w.weapon_type ?? '—',
      inCmd, hasDetail, explore, enemy, boss, shop, special, legacy,
      listed.has(w.item_id) ? 'ok' : 'missing',
    ]);
  }

  if (listed.size !== listAllWeaponIds().length) {
    result.fails.push(`listed ${listed.size} vs total ${listAllWeaponIds().length}`);
  }

  writeMdCsvPair('weapon-command-route-audit', HEADERS, rows, [`- weapons: ${weapons.length}`]);
  exitCheckResult('weapon-command-route-audit', result);
}

main();
