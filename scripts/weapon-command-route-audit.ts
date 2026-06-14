/** weapon-command-route-audit.ts */
import {
  buildEquipmentRouteLines,
  getWeaponBookCategories,
  getWeaponRouteBook,
  listAllWeaponIds,
  weaponsInCategory,
} from '../src/systems/equipmentRouteBook';
import { getEquipmentRouteSectionFlags } from '../src/systems/equipmentRouteDetailSystem';
import { ensureDropBalanceSeed } from '../src/db/seedData/dropBalanceSeed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'weapon_id', 'weapon_name', 'rarity', 'job_or_weapon_family', 'listed_in_command',
  'has_route_detail', 'explore_routes', 'enemy_drop_routes', 'boss_rematch_routes',
  'exchange_routes', 'shop_routes', 'special_routes', 'has_none_sections',
  'legacy_or_unavailable', 'balance_note',
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
  ensurePhase2EquipmentRoutes(init.db);
  ensureDropBalanceSeed(init.db);
  ensureMasterDataSeed(init.db);

  const weapons = getWeaponRouteBook();
  const listed = new Set<string>();
  for (const cat of getWeaponBookCategories()) {
    for (const w of weaponsInCategory(cat.id)) listed.add(w.item_id);
  }

  const rows: string[][] = [];
  for (const w of weapons) {
    const routes = buildEquipmentRouteLines(w.item_id);
    const text = routes.join('\n');
    const flags = getEquipmentRouteSectionFlags(w.item_id);
    const explore = flags.hasExplore || text.includes('【探索】') ? 'YES' : 'NO';
    const enemy = flags.hasEnemyDrop ? 'YES' : 'NO';
    const boss = flags.hasBossRematch ? 'YES' : 'NO';
    const exchange = flags.hasExchange ? 'YES' : 'NO';
    const shop = flags.hasShop || text.includes('【ショップ】') ? 'YES' : 'NO';
    const special = text.includes('【強化/変質】') || text.includes('【特殊】') ? 'YES' : 'NO';
    const legacy = w.legacy || flags.legacyOrUnavailable ? 'YES' : 'NO';
    const inCmd = listed.has(w.item_id) ? 'YES' : 'NO';
    const hasDetail = routes.length > 0 ? 'YES' : 'NO';
    const noneSections = flags.hasNoneSections ? 'YES' : 'NO';

    if (inCmd === 'NO') result.fails.push(`${w.item_id}: not in command categories`);
    if (hasDetail === 'NO' && !w.legacy) result.warns.push(`${w.item_id}: no route lines`);
    if (!w.legacy && !text.includes('【敵討伐】')) {
      result.fails.push(`${w.item_id}: missing enemy drop section`);
    }
    if (!w.legacy && !text.includes('【ボス再戦】')) {
      result.fails.push(`${w.item_id}: missing boss rematch section`);
    }
    if ((w.rarity === 'Uni' || w.rarity === 'Src') && !w.legacy) {
      if (!flags.hasForgeDisplay) result.fails.push(`${w.item_id}: missing forge section`);
      if (!flags.hasMaterialSources) result.fails.push(`${w.item_id}: missing material sources`);
      if (flags.selfReferenceBug) result.fails.push(`${w.item_id}: self reference in forge`);
    }

    rows.push([
      w.item_id, w.name, w.rarity, w.required_job ?? w.weapon_type ?? '—',
      inCmd, hasDetail, explore, enemy, boss, exchange, shop, special, noneSections, legacy,
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
