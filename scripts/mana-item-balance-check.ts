/** mana-item-balance-check — npx tsx scripts/mana-item-balance-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { MANA_CONSUMABLES, MANA_ITEM_IDS, MANA_MAGIC_ENEMY_DROPS, MANA_TOWN_LOOT_OVERRIDES } from '../src/db/seedData/manaConsumables';
import { getShopCatalogItemIds } from '../src/systems/shopSystem';

const result = emptyResult();

const EARLY_TOWNS = ['start_starfield', 'old_road_village', 'rain_ruins'];
const MID_TOWNS = ['twilight_port', 'silver_mine', 'mist_forest', 'moon_library'];
const LATE_TOWNS = ['forgotten_market', 'hourglass_city', 'ash_capital', 'deep_furnace_outpost'];

function main() {
  const rows: string[][] = [];
  const init = initAuditDb();

  if (init.ok) {
    const { db } = init;
    for (const m of MANA_CONSUMABLES) {
      const row = db.prepare(`
        SELECT id, name, shop_buy_price, battle_usable, battle_effect_json FROM items WHERE id = ?
      `).get(m.id) as {
        id: string; name: string; shop_buy_price: number; battle_usable: number; battle_effect_json: string;
      } | undefined;
      const ok = !!row && row.battle_usable === 1;
      const fx = row?.battle_effect_json ? JSON.parse(row.battle_effect_json) as { type: string; value: number } : null;
      const mpOk = fx?.type === 'heal_mp' && fx.value === m.mpHeal;
      rows.push([m.id, m.name, String(m.mpHeal), String(m.buyPrice), ok && mpOk ? 'OK' : 'FAIL', 'seed']);
      if (!ok || !mpOk) result.fails.push(`${m.id} seed/effect mismatch`);
      if (m.mpHeal >= 170 && m.mpHeal > 350 * 0.55) result.warns.push(`${m.id} may exceed ~55% max MP at Lv80`);
    }

    const catalog = getShopCatalogItemIds();
    for (const town of EARLY_TOWNS) {
      const ids = catalog[town] ?? [];
      const hasDrop = ids.includes('cons_mana_drop');
      rows.push([town, 'cons_mana_drop', hasDrop ? 'yes' : 'no', hasDrop ? 'OK' : 'FAIL', '序盤']);
      if (!hasDrop) result.fails.push(`${town} missing cons_mana_drop`);
    }
    for (const town of MID_TOWNS) {
      const ids = catalog[town] ?? [];
      const ok = ids.includes('cons_mana_drop') && ids.includes('cons_mana_vial');
      rows.push([town, 'drop+vial', ok ? 'yes' : 'no', ok ? 'OK' : 'FAIL', '中盤']);
      if (!ok) result.fails.push(`${town} missing mana shop tier`);
    }
    for (const town of LATE_TOWNS) {
      const ids = catalog[town] ?? [];
      const ok = ids.includes('cons_mana_vial') && ids.includes('cons_mana_flask');
      rows.push([town, 'vial+flask', ok ? 'yes' : 'no', ok ? 'OK' : 'FAIL', '終盤']);
      if (!ok) result.fails.push(`${town} missing late mana shop tier`);
    }
    const valIds = catalog.valhalla_fortress ?? [];
    const valOk = valIds.includes('cons_mana_flask') && valIds.includes('cons_mana_valhalla');
    rows.push(['valhalla_fortress', 'flask+valhalla', valOk ? 'yes' : 'no', valOk ? 'OK' : 'FAIL', 'ヴァルハラ']);
    if (!valOk) result.fails.push('valhalla_fortress missing mana items');

    for (const id of MANA_ITEM_IDS) {
      const loot = MANA_TOWN_LOOT_OVERRIDES[id];
      rows.push([id, 'town_loot', loot ? String(loot.base_weight) : 'missing', loot ? 'OK' : 'WARN', '探索']);
      if (!loot) result.warns.push(`${id} no town loot override`);
    }

    for (const drop of MANA_MAGIC_ENEMY_DROPS) {
      rows.push([drop.itemId, 'magic_enemy', `${(drop.rate * 100).toFixed(2)}%`, drop.rate <= 0.04 ? 'OK' : 'WARN', `Lv${drop.minMonsterLevel}-${drop.maxMonsterLevel}`]);
    }
  } else {
    result.warns.push(`DB不可: ${init.error}`);
    rows.push(['db', 'SKIP', 'WARN', init.error]);
  }

  writeMdCsvPair(
    'mana-item-balance-summary',
    ['item_or_town', 'name_or_slot', 'value', 'status', 'notes'],
    rows,
    ['## MP回復アイテム', '', 'シード・店舗・探索・魔法系敵ドロップ。'],
  );
  exitCheckResult('mana-item-balance-check', result);
}

main();
