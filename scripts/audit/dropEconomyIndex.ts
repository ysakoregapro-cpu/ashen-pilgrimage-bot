/** Shared drop economy audit index — Phase2.4 */
import { getDb } from '../../src/db/database';
import { initAuditDb } from './acquisitionIndex';
import { AREAS } from '../../src/db/seedData/areas';
import { TOWN_LOOT_POOLS } from '../../src/db/seedData/townLootPools';
import { buildEffectiveRewardPool } from '../../src/systems/townLootSystem';
import {
  CHEST_LOOT_TABLES, BATTLE_EQUIP_TABLES, EQUIP_SLOT_WEIGHTS, getAreaLootTier,
} from '../../src/systems/equipmentDropSystem';
import {
  ITEM_PURPOSE_OVERRIDES, NORMAL_EXPLORE_POOL_EXCLUDED, progressionTierForAreaMin,
} from '../../src/db/seedData/dropBalanceMaster';
import { UNI_JOB_MATERIALS, PHASE2_UNI_MATERIAL_DROPS } from '../../src/db/seedData/jobProgressionMaster';
import { SRC_FORGE_MATERIAL_ID } from '../../src/db/seedData/forgeMaster';
import { getShopCatalog } from '../../src/systems/shopSystem';
import { AWAKENING_DUP_COST_SR, totalDuplicatesForMaxAwakening } from '../../src/db/seedData/awakeningMaster';

export type DropEconomyRow = {
  item_id: string;
  name: string;
  category: string;
  kind: string;
  rarity: string;
  sell_price: string;
  is_equipment: string;
  equipment_slot: string;
  set_id: string;
  area_sources: string;
  monster_sources: string;
  shop_sources: string;
  boss_sources: string;
  rematch_sources: string;
  valhalla_sources: string;
  raid_sources: string;
  estimated_weight: string;
  estimated_rate_band: string;
  progression_tier: string;
  current_purpose: string;
  purpose_count: string;
  expected_consumption: string;
  expected_surplus_risk: string;
  gold_farming_risk: string;
  is_key_material: string;
  is_direct_gear_drop: string;
  risk: string;
  recommendation: string;
};

export type ItemPurposeRow = {
  item_id: string;
  name: string;
  category: string;
  rarity: string;
  sell_price: string;
  current_sources: string;
  used_in_enhance: string;
  used_in_repair: string;
  used_in_awaken: string;
  used_in_kai_unique: string;
  used_in_kai_src: string;
  used_in_src_forge: string;
  used_in_shop: string;
  used_in_consumable: string;
  used_in_quest_or_trial: string;
  sell_or_convert_only: string;
  no_current_use: string;
  expected_consumption: string;
  recommended_purpose: string;
  recommended_action: string;
};

const EVENT_WEIGHTS = { battle: 40, material: 25, treasure: 15, npc_event: 10, nothing: 10 };
const RARITY_SCORE: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, Uni: 6, Src: 7 };

function inferKind(category: string, itemId: string): string {
  if (itemId.startsWith('upg_')) return 'enhance_material';
  if (itemId.startsWith('rep_')) return 'repair_material';
  if (itemId.startsWith('dism_')) return 'set_material';
  if (itemId.startsWith('boss_')) return 'boss_material';
  if (itemId.startsWith('raid_')) return 'raid_material';
  if (itemId.startsWith('src_')) return 'src_material';
  if (itemId.startsWith('mat_')) return 'enhance_material';
  if (itemId.startsWith('cons_')) return 'consumable';
  if (category === 'equipment') return 'playable_gear';
  return category;
}

function buildPurposeMap(db: ReturnType<typeof getDb>) {
  const enhance = new Set<string>();
  const repair = new Set<string>();
  const srcManifest = new Map<string, number>();
  const kaiUni = new Set<string>();
  for (const id of ['upg_rough_stone', 'upg_stone', 'upg_fine_stone', 'upg_rare_stone', 'upg_old_king_stone', 'upg_deep_core_stone']) {
    enhance.add(id);
  }
  for (const id of ['rep_patch', 'rep_polish', 'rep_oil', 'rep_silver_clip', 'rep_deep_repair']) repair.add(id);
  for (const req of Object.values(UNI_JOB_MATERIALS)) {
    kaiUni.add(req.mat1);
    kaiUni.add(req.mat2);
  }
  for (const d of PHASE2_UNI_MATERIAL_DROPS) kaiUni.add(d.matId);
  kaiUni.add(SRC_FORGE_MATERIAL_ID);
  const manifests = db.prepare('SELECT manifest_requirements_json FROM src_weapons').all() as Array<{ manifest_requirements_json: string }>;
  for (const m of manifests) {
    try {
      const req = JSON.parse(m.manifest_requirements_json) as { materials: Array<{ id: string; qty: number }> };
      for (const mat of req.materials) {
        srcManifest.set(mat.id, (srcManifest.get(mat.id) ?? 0) + mat.qty);
      }
    } catch { /* ignore */ }
  }
  return { enhance, repair, srcManifest, kaiUni };
}

function buildSourceIndex(db: ReturnType<typeof getDb>) {
  const areaByItem = new Map<string, string[]>();
  const weightByItem = new Map<string, number>();
  for (const area of AREAS) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    const townLabel = area.town;
    for (const p of pool) {
      if (!areaByItem.has(p.item_id)) areaByItem.set(p.item_id, []);
      const loc = `${area.name}(${townLabel})`;
      if (!areaByItem.get(p.item_id)!.includes(loc)) areaByItem.get(p.item_id)!.push(loc);
      weightByItem.set(p.item_id, (weightByItem.get(p.item_id) ?? 0) + p.weight);
    }
  }
  const shopByItem = new Map<string, string[]>();
  for (const t of db.prepare('SELECT id FROM towns').all() as Array<{ id: string }>) {
    for (const s of getShopCatalog(t.id)) {
      if (!shopByItem.has(s.item_id)) shopByItem.set(s.item_id, []);
      shopByItem.get(s.item_id)!.push(t.id);
    }
  }
  const monsterByItem = new Map<string, string[]>();
  for (const m of db.prepare('SELECT id, name, drop_pool_json FROM monsters').all() as Array<{ id: string; name: string; drop_pool_json: string }>) {
    try {
      const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string }>;
      for (const d of drops) {
        if (!monsterByItem.has(d.item_id)) monsterByItem.set(d.item_id, []);
        monsterByItem.get(d.item_id)!.push(m.name);
      }
    } catch { /* ignore */ }
  }
  return { areaByItem, weightByItem, shopByItem, monsterByItem };
}

function estimateRateBand(
  itemId: string,
  category: string,
  rarity: string,
  totalWeight: number,
  areaCount: number,
): string {
  if (NORMAL_EXPLORE_POOL_EXCLUDED.has(itemId)) return '0/excluded';
  if (!totalWeight) return '0/none';
  const avgPool = 80;
  const share = totalWeight / (avgPool * Math.max(areaCount, 1));
  let per100 = 0;
  if (category === 'equipment') {
    const tier = 'mid';
    const chest = CHEST_LOOT_TABLES[tier];
    const equipW = chest.filter((c) => c.kind === 'equip').reduce((s, c) => s + c.weight, 0);
    const chestTotal = chest.reduce((s, c) => s + c.weight, 0);
    const srShare = chest.find((c) => c.rarity === rarity)?.weight ?? 0;
    const treasureRate = (EVENT_WEIGHTS.treasure / 100) * (equipW / chestTotal) * (srShare / equipW || 0.2);
    const battleRate = (EVENT_WEIGHTS.battle / 100) * 0.08 * share;
    per100 = (treasureRate + battleRate) * 100 * (EQUIP_SLOT_WEIGHTS.body / 100);
  } else {
    per100 = ((EVENT_WEIGHTS.material / 100) + (EVENT_WEIGHTS.treasure / 100) * 0.45 + (EVENT_WEIGHTS.battle / 100) * 0.35) * share * 100;
  }
  if (per100 >= 15) return `${per100.toFixed(1)}/100 HIGH`;
  if (per100 >= 6) return `${per100.toFixed(1)}/100 mid`;
  if (per100 >= 1) return `${per100.toFixed(1)}/100 low`;
  return `${per100.toFixed(2)}/100 trace`;
}

function classifyRisk(
  rarity: string,
  sellPrice: number,
  rateBand: string,
  purposeCount: number,
  isGear: boolean,
): { surplus: string; gold: string; risk: string; recommendation: string } {
  const highRate = rateBand.includes('HIGH') || rateBand.includes('/100 mid');
  let gold = 'low';
  if (['SSR', 'UR'].includes(rarity) && sellPrice >= 100) gold = 'high';
  else if (['SR', 'SSR'].includes(rarity) && sellPrice >= 50) gold = 'medium';
  let surplus = 'low';
  if (highRate && purposeCount <= 1) surplus = 'high';
  else if (highRate && purposeCount <= 2) surplus = 'medium';
  let risk = 'ok';
  let recommendation = 'maintain';
  if (gold === 'high' && highRate) {
    risk = 'balance_risk';
    recommendation = 'lower_supply';
  } else if (surplus === 'high') {
    risk = 'over_supplied';
    recommendation = 'lower_supply';
  } else if (purposeCount === 0 && !rateBand.startsWith('0/')) {
    risk = 'needs_sink';
    recommendation = 'classify_or_remove_from_pool';
  }
  return { surplus, gold, risk, recommendation };
}

export function initDropEconomyAuditDb() {
  return initAuditDb();
}

export function buildDropEconomyRows(): DropEconomyRow[] {
  const db = initDropEconomyAuditDb();
  const { areaByItem, weightByItem, shopByItem, monsterByItem } = buildSourceIndex(db);
  const purposeMap = buildPurposeMap(db);
  const items = db.prepare(`
    SELECT i.id, i.name, i.category, i.rarity, i.sell_price, i.shop_sell_price, i.usage_text,
      e.slot, e.series_id
    FROM items i
    LEFT JOIN equipment e ON i.id = e.item_id
    WHERE i.category NOT IN ('skill', 'quest')
    ORDER BY i.rarity DESC, i.name
  `).all() as Array<{
    id: string; name: string; category: string; rarity: string; sell_price: number;
    shop_sell_price: number | null; usage_text: string | null; slot: string | null; series_id: string | null;
  }>;

  const rows: DropEconomyRow[] = [];
  for (const item of items) {
    const areas = areaByItem.get(item.id) ?? [];
    const sell = item.shop_sell_price ?? item.sell_price ?? 0;
    const purposes: string[] = [];
    const kind = inferKind(item.category, item.id);
    if (ITEM_PURPOSE_OVERRIDES[item.id]) purposes.push(ITEM_PURPOSE_OVERRIDES[item.id]!);
    else if (kind !== item.category && kind !== 'playable_gear') purposes.push(kind);
    if (purposeMap.enhance.has(item.id)) purposes.push('enhance_material');
    if (purposeMap.repair.has(item.id)) purposes.push('repair_material');
    if (purposeMap.kaiUni.has(item.id)) purposes.push('kai_material');
    if (purposeMap.srcManifest.has(item.id)) purposes.push('src_material');
    if (item.id.startsWith('mat_') && !purposes.length) purposes.push('enhance_material');
    if (item.id.startsWith('dism_')) purposes.push('set_material');
    if (item.id.startsWith('raid_')) purposes.push('raid_material');
    if (item.id.startsWith('boss_')) purposes.push('src_material');
    if (item.id.startsWith('src_')) purposes.push('src_material');
    if (item.category === 'equipment') purposes.push('playable_gear');
    if (item.category === 'consumable') purposes.push('consumable');
    const purposeCount = new Set(purposes).size;
    const minArea = AREAS.filter((a) => a.rewards.includes(item.id)).map((a) => a.min)[0] ?? 99;
    const rateBand = estimateRateBand(item.id, item.category, item.rarity, weightByItem.get(item.id) ?? 0, areas.length);
    const { surplus, gold, risk, recommendation } = classifyRisk(item.rarity, sell, rateBand, purposeCount, item.category === 'equipment');
    const expectedConsumption = purposeMap.srcManifest.get(item.id)?.toString()
      ?? (item.category === 'equipment' && ['SR', 'SSR', 'UR'].includes(item.rarity)
        ? String(totalDuplicatesForMaxAwakening(item.rarity === 'UR' ? 'UR' : 'SR'))
        : '—');

    rows.push({
      item_id: item.id,
      name: item.name,
      category: item.category,
      kind: inferKind(item.category, item.id),
      rarity: item.rarity,
      sell_price: String(sell),
      is_equipment: item.category === 'equipment' ? 'YES' : 'NO',
      equipment_slot: item.slot ?? '—',
      set_id: item.series_id ?? '—',
      area_sources: areas.join('; ') || '—',
      monster_sources: (monsterByItem.get(item.id) ?? []).join('; ') || '—',
      shop_sources: (shopByItem.get(item.id) ?? []).join('; ') || '—',
      boss_sources: item.id.startsWith('boss_') ? 'boss_pool' : '—',
      rematch_sources: purposeMap.kaiUni.has(item.id) ? 'rematch' : '—',
      valhalla_sources: areas.some((a) => a.includes('valhalla')) ? 'YES' : '—',
      raid_sources: item.id.startsWith('raid_') ? 'YES' : '—',
      estimated_weight: String(weightByItem.get(item.id) ?? 0),
      estimated_rate_band: rateBand,
      progression_tier: progressionTierForAreaMin(minArea === 99 ? 1 : minArea),
      current_purpose: [...new Set(purposes)].join('; ') || 'unknown',
      purpose_count: String(purposeCount),
      expected_consumption: expectedConsumption,
      expected_surplus_risk: surplus,
      gold_farming_risk: gold,
      is_key_material: purposeMap.kaiUni.has(item.id) || purposeMap.srcManifest.has(item.id) ? 'YES' : 'NO',
      is_direct_gear_drop: item.category === 'equipment' && areas.length ? 'YES' : 'NO',
      risk,
      recommendation,
    });
  }
  return rows;
}

export function buildItemPurposeRows(): ItemPurposeRow[] {
  const db = initDropEconomyAuditDb();
  const { areaByItem, shopByItem, monsterByItem } = buildSourceIndex(db);
  const purposeMap = buildPurposeMap(db);
  const items = db.prepare(`
    SELECT id, name, category, rarity, sell_price, shop_sell_price, usage_text FROM items
    WHERE category NOT IN ('skill', 'quest')
    ORDER BY rarity DESC, name
  `).all() as Array<{ id: string; name: string; category: string; rarity: string; sell_price: number; shop_sell_price: number | null; usage_text: string | null }>;

  return items.map((item) => {
    const sources = [
      ...(areaByItem.get(item.id) ?? []).map((a) => `area:${a}`),
      ...(shopByItem.get(item.id) ?? []).map((s) => `shop:${s}`),
      ...(monsterByItem.get(item.id) ?? []).map((m) => `monster:${m}`),
    ];
    const sell = item.shop_sell_price ?? item.sell_price ?? 0;
    const usedEnhance = purposeMap.enhance.has(item.id) || item.id.startsWith('mat_') || item.id.startsWith('dism_') ? 'YES' : 'NO';
    const usedRepair = purposeMap.repair.has(item.id) ? 'YES' : 'NO';
    const usedAwaken = item.category === 'equipment' && ['N', 'R', 'SR', 'UR'].includes(item.rarity) ? 'YES(dup)' : 'NO';
    const usedKai = purposeMap.kaiUni.has(item.id) ? 'YES' : 'NO';
    const usedSrc = purposeMap.srcManifest.has(item.id) || item.id.startsWith('boss_') || item.id.startsWith('src_') || item.id.startsWith('raid_') ? 'YES' : 'NO';
    const usedShop = (shopByItem.get(item.id) ?? []).length ? 'YES' : 'NO';
    const usedConsumable = item.category === 'consumable' ? 'YES' : 'NO';
    const noUse = usedEnhance === 'NO' && usedRepair === 'NO' && usedAwaken === 'NO' && usedKai === 'NO' && usedSrc === 'NO' && usedShop === 'NO' && usedConsumable === 'NO';
    const override = ITEM_PURPOSE_OVERRIDES[item.id];
    let action = 'maintain';
    if (override === 'legacy') action = 'exclude_from_normal_drop';
    if (noUse && sources.length) action = 'lower_supply_or_add_sink';
    if (NORMAL_EXPLORE_POOL_EXCLUDED.has(item.id)) action = 'excluded_ok';

    return {
      item_id: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      sell_price: String(sell),
      current_sources: sources.join('; ') || '—',
      used_in_enhance: usedEnhance,
      used_in_repair: usedRepair,
      used_in_awaken: usedAwaken,
      used_in_kai_unique: usedKai,
      used_in_kai_src: item.id === SRC_FORGE_MATERIAL_ID ? 'YES' : 'NO',
      used_in_src_forge: usedSrc,
      used_in_shop: usedShop,
      used_in_consumable: usedConsumable,
      used_in_quest_or_trial: '—',
      sell_or_convert_only: noUse && sell > 0 ? 'YES' : 'NO',
      no_current_use: noUse ? 'YES' : 'NO',
      expected_consumption: purposeMap.srcManifest.get(item.id)?.toString() ?? '—',
      recommended_purpose: override ?? inferKind(item.category, item.id),
      recommended_action: action,
    };
  });
}

export function getMoonBodySupplyCheck(): { itemId: string; name: string; areas: string[]; totalWeight: number; rateBand: string } {
  const db = initDropEconomyAuditDb();
  const itemId = 'arm_set_moon_body';
  const item = db.prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string };
  const areas: string[] = [];
  let totalWeight = 0;
  for (const area of AREAS.filter((a) => a.town === 'moon_library')) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    const entry = pool.find((p) => p.item_id === itemId);
    if (entry) {
      areas.push(area.id);
      totalWeight += entry.weight;
    }
  }
  const rateBand = estimateRateBand(itemId, 'equipment', 'SR', totalWeight, areas.length);
  return { itemId, name: item.name, areas, totalWeight, rateBand };
}

export { EVENT_WEIGHTS, CHEST_LOOT_TABLES, BATTLE_EQUIP_TABLES, RARITY_SCORE, NORMAL_EXPLORE_POOL_EXCLUDED };
