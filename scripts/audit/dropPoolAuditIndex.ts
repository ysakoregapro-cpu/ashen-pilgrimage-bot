import { getDb } from '../../src/db/database';
import { TOWN_LOOT_POOLS, type TownLootEntry } from '../../src/db/seedData/townLootPools';
import { TOWN_LOOT_NO_DROP_WEIGHT, NORMAL_EXPLORE_POOL_EXCLUDED, BOSS_UNI_SRC_MATERIAL_DROP } from '../../src/db/seedData/dropBalanceMaster';
import { CHEST_LOOT_TABLES, BATTLE_EQUIP_TABLES, REMATCH_LOOT_TABLE } from '../../src/systems/equipmentDropSystem';
import { UNI_SRC_MATERIAL_IDS, UNI_SRC_MATERIAL_JOB_MAP } from '../../src/db/seedData/jobProgressionMaster';
import { buildItemPurposeCatalog } from '../../src/db/seedData/itemPurposeMaster';
import { VALHALLA_EXCHANGE_TABLE } from '../../src/db/seedData/valhallaExchangeMaster';
import { getShopCatalog } from '../../src/systems/shopSystem';
import { AREAS } from '../../src/db/seedData/areas';

const RARITY_RANK: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, Uni: 6, Src: 7 };

export type PoolWeightBreakdown = {
  no_drop_weight: number;
  common_weight: number;
  consumable_weight: number;
  weak_upgrade_weight: number;
  low_gear_weight: number;
  rare_material_weight: number;
  ssr_gear_weight: number;
  ur_material_weight: number;
  ur_gear_weight: number;
  total_weight: number;
};

function itemMeta(itemId: string): { rarity: string; category: string } | undefined {
  return getDb().prepare('SELECT rarity, category FROM items WHERE id = ?').get(itemId) as { rarity: string; category: string } | undefined;
}

function classifyEntry(entry: TownLootEntry, weight: number): Partial<PoolWeightBreakdown> {
  if (entry.category === 'gold') return { common_weight: weight };
  if (entry.category === 'consumable') return { consumable_weight: weight };
  const meta = itemMeta(entry.item_id);
  const rarity = meta?.rarity ?? 'N';
  const rank = RARITY_RANK[rarity] ?? 1;
  if (entry.category === 'equipment') {
    if (rank >= 5) return { ur_gear_weight: weight };
    if (rank >= 4) return { ssr_gear_weight: weight };
    return { low_gear_weight: weight };
  }
  if (entry.item_id.startsWith('upg_rough') || entry.item_id.startsWith('upg_stone')) {
    return { weak_upgrade_weight: weight };
  }
  if (rank >= 5) return { ur_material_weight: weight };
  if (rank >= 4) return { rare_material_weight: weight };
  if (entry.value_tier <= 2) return { common_weight: weight };
  return { rare_material_weight: weight };
}

export function summarizeTownPool(townId: string, areaRank: number): PoolWeightBreakdown {
  const pool = TOWN_LOOT_POOLS[townId] ?? [];
  const out: PoolWeightBreakdown = {
    no_drop_weight: TOWN_LOOT_NO_DROP_WEIGHT,
    common_weight: 0,
    consumable_weight: 0,
    weak_upgrade_weight: 0,
    low_gear_weight: 0,
    rare_material_weight: 0,
    ssr_gear_weight: 0,
    ur_material_weight: 0,
    ur_gear_weight: 0,
    total_weight: TOWN_LOOT_NO_DROP_WEIGHT,
  };
  for (const entry of pool) {
    if (areaRank < entry.min_area_rank || areaRank > entry.max_area_rank) continue;
    const w = entry.base_weight;
    out.total_weight += w;
    const part = classifyEntry(entry, w);
    for (const [k, v] of Object.entries(part)) {
      (out as Record<string, number>)[k] = ((out as Record<string, number>)[k] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

export function effectiveRate(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((part / total) * 100).toFixed(2)}%`;
}

export function buildDropPoolAuditRows(): string[][] {
  const rows: string[][] = [];
  const contexts = [
    { pool_id: 'town_loot_pick', context: 'explore_material_event', fn: () => summarizeTownPool('start_starfield', 1) },
    { pool_id: 'chest_early', context: 'explore_treasure', fn: () => chestBreakdown('early') },
    { pool_id: 'chest_valhalla', context: 'explore_treasure', fn: () => chestBreakdown('valhalla') },
    { pool_id: 'battle_boss_equip', context: 'battle_victory', fn: () => battleEquipBreakdown('boss') },
    { pool_id: 'rematch_generic', context: 'boss_rematch', fn: () => rematchBreakdown() },
    { pool_id: 'uni_src_furnace', context: 'boss_furnace_keeper', fn: () => uniSrcBreakdown() },
  ];
  for (const c of contexts) {
    const b = c.fn();
    const rareW = b.rare_material_weight + b.ssr_gear_weight;
    const urW = b.ur_material_weight + b.ur_gear_weight;
    rows.push([
      c.pool_id,
      c.context,
      String(b.no_drop_weight),
      String(b.common_weight),
      String(b.consumable_weight),
      String(b.weak_upgrade_weight),
      String(b.low_gear_weight),
      String(b.rare_material_weight),
      String(b.ssr_gear_weight),
      String(b.ur_material_weight),
      String(b.ur_gear_weight),
      String(b.total_weight),
      effectiveRate(rareW, b.total_weight),
      effectiveRate(urW, b.total_weight),
      b.no_drop_weight > 0 ? 'OK — no_drop/filler present' : 'WARN — no explicit no_drop',
    ]);
  }
  return rows;
}

function chestBreakdown(tier: keyof typeof CHEST_LOOT_TABLES): PoolWeightBreakdown {
  const table = CHEST_LOOT_TABLES[tier];
  const total = table.reduce((s, r) => s + r.weight, 0);
  const out = emptyBreakdown(total);
  for (const row of table) {
    if (row.kind === 'material') out.common_weight += row.weight;
    else if (row.rarity === 'SSR') out.ssr_gear_weight += row.weight;
    else if (row.rarity === 'UR') out.ur_gear_weight += row.weight;
    else out.low_gear_weight += row.weight;
  }
  return out;
}

function battleEquipBreakdown(tier: keyof typeof BATTLE_EQUIP_TABLES): PoolWeightBreakdown {
  const table = BATTLE_EQUIP_TABLES[tier];
  const total = table.reduce((s, r) => s + r.weight, 0);
  const out = emptyBreakdown(total);
  for (const row of table) {
    if (row.kind === 'none') out.no_drop_weight += row.weight;
    else if (row.rarity === 'SSR') out.ssr_gear_weight += row.weight;
    else if (row.rarity === 'UR') out.ur_gear_weight += row.weight;
    else out.low_gear_weight += row.weight;
  }
  return out;
}

function rematchBreakdown(): PoolWeightBreakdown {
  const total = REMATCH_LOOT_TABLE.reduce((s, r) => s + r.weight, 0);
  const out = emptyBreakdown(total);
  for (const row of REMATCH_LOOT_TABLE) {
    if (row.kind === 'nothing') out.no_drop_weight += row.weight;
    else if (row.kind === 'normal_mat') out.common_weight += row.weight;
    else if (row.kind === 'high_mat') out.weak_upgrade_weight += row.weight;
    else out.low_gear_weight += row.weight;
  }
  return out;
}

function uniSrcBreakdown(): PoolWeightBreakdown {
  const trigger = BOSS_UNI_SRC_MATERIAL_DROP.rematchTriggerRate;
  const perMat = trigger / BOSS_UNI_SRC_MATERIAL_DROP.materialIds.length;
  const total = 1;
  return {
    no_drop_weight: 1 - trigger,
    common_weight: 0,
    consumable_weight: 0,
    weak_upgrade_weight: 0,
    low_gear_weight: 0,
    rare_material_weight: perMat * BOSS_UNI_SRC_MATERIAL_DROP.materialIds.length,
    ssr_gear_weight: 0,
    ur_material_weight: 0,
    ur_gear_weight: 0,
    total_weight: total,
  };
}

function emptyBreakdown(total: number): PoolWeightBreakdown {
  return {
    no_drop_weight: 0,
    common_weight: 0,
    consumable_weight: 0,
    weak_upgrade_weight: 0,
    low_gear_weight: 0,
    rare_material_weight: 0,
    ssr_gear_weight: 0,
    ur_material_weight: 0,
    ur_gear_weight: 0,
    total_weight: total,
  };
}

export function buildExplorationRewardRows(): string[][] {
  const db = getDb();
  const areas = db.prepare('SELECT id, name, town_id, recommended_min_level, recommended_max_level FROM exploration_areas ORDER BY recommended_min_level').all() as Array<{
    id: string; name: string; town_id: string; recommended_min_level: number; recommended_max_level: number;
  }>;
  const rows: string[][] = [];
  for (const area of areas) {
    const townAreas = areas.filter((a) => a.town_id === area.town_id).sort((a, b) => a.recommended_min_level - b.recommended_min_level);
    const rank = townAreas.findIndex((a) => a.id === area.id) + 1;
    const b = summarizeTownPool(area.town_id, rank);
    const band = area.recommended_min_level <= 15 ? 'early' : area.recommended_min_level <= 40 ? 'mid' : 'late';
    rows.push([
      area.id,
      area.name,
      band,
      b.no_drop_weight > 0 ? 'yes' : 'no',
      b.common_weight > 0 ? 'yes' : 'no',
      b.weak_upgrade_weight > 0 ? 'yes' : 'no',
      b.consumable_weight > 0 ? 'yes' : 'no',
      b.rare_material_weight > 0 ? 'yes' : 'no',
      b.ssr_gear_weight + b.ur_gear_weight + b.ur_material_weight > 0 ? 'yes' : 'no',
      effectiveRate(b.common_weight + b.consumable_weight + b.weak_upgrade_weight, b.total_weight),
      effectiveRate(b.rare_material_weight + b.ssr_gear_weight, b.total_weight),
      effectiveRate(b.ur_material_weight + b.ur_gear_weight, b.total_weight),
      b.no_drop_weight >= 15 ? 'OK' : 'WARN — low no_drop',
    ]);
  }
  return rows;
}

export function buildRareRouteRows(): string[][] {
  const catalog = buildItemPurposeCatalog(getDb());
  const targets = catalog.filter((c) =>
    c.risk === 'high'
    || c.purpose === 'src_material'
    || UNI_SRC_MATERIAL_IDS.includes(c.id)
    || c.id === 'boss_silent_page'
    || (['SSR', 'UR'].includes(c.rarity) && c.id.startsWith('wpn_')),
  );
  const rows: string[][] = [];
  for (const item of targets.slice(0, 80)) {
    const routes = findRoutesForItem(item.id);
    const shouldExclusive = UNI_SRC_MATERIAL_IDS.includes(item.id)
      || item.id === 'boss_silent_page'
      || item.purpose === 'src_material';
    const isExclusive = shouldExclusive
      ? routes.every((r) => r.includes('furnace') || r.includes('silent') || r.includes('valhalla') || r.includes('boss') || r.includes('raid'))
      : routes.length >= 1;
    rows.push([
      item.id,
      item.name,
      item.rarity,
      item.notes || item.sinkDescription,
      routes.join('; ') || 'none',
      isExclusive ? 'yes' : 'no',
      shouldExclusive ? 'yes' : 'no',
      routes.length ? 'OK' : 'WARN — no route',
    ]);
  }
  return rows;
}

function findRoutesForItem(itemId: string): string[] {
  const routes = new Set<string>();
  for (const [townId, pool] of Object.entries(TOWN_LOOT_POOLS)) {
    if (pool.some((e) => e.item_id === itemId)) routes.add(`explore:${townId}`);
  }
  for (const area of AREAS) {
    if (area.rewards.includes(itemId)) routes.add(`area:${area.id}`);
  }
  if (UNI_SRC_MATERIAL_IDS.includes(itemId)) {
    routes.add(`boss_rematch:${BOSS_UNI_SRC_MATERIAL_DROP.monsterId}`);
  }
  if (itemId === 'boss_silent_page') routes.add('boss:mon_silent_guardian');
  for (const ex of VALHALLA_EXCHANGE_TABLE) {
    if (ex.reward_item_id === itemId) routes.add(`exchange:${ex.exchange_id}`);
  }
  for (const town of ['start_starfield', 'twilight_port', 'valhalla_fortress', 'deep_furnace_outpost']) {
    if (getShopCatalog(town).some((c) => c.item_id === itemId)) routes.add(`shop:${town}`);
  }
  return [...routes];
}

export function buildSrcMaterialRouteRows(): string[][] {
  const db = getDb();
  const trigger = BOSS_UNI_SRC_MATERIAL_DROP.rematchTriggerRate;
  const poolSize = BOSS_UNI_SRC_MATERIAL_DROP.materialIds.length;
  const perMat = trigger / poolSize;
  return UNI_SRC_MATERIAL_IDS.map((id) => {
    const item = db.prepare('SELECT name FROM items WHERE id = ?').get(id) as { name: string } | undefined;
    const routes = findRoutesForItem(id);
    const shop = routes.some((r) => r.startsWith('shop:'));
    const explore = routes.some((r) => r.startsWith('explore:') || r.startsWith('area:'));
    const exchange = routes.some((r) => r.startsWith('exchange:'));
    return [
      id,
      item?.name ?? id,
      UNI_SRC_MATERIAL_JOB_MAP[id] ?? '?',
      BOSS_UNI_SRC_MATERIAL_DROP.monsterId,
      String(trigger),
      String(poolSize),
      `${(perMat * 100).toFixed(2)}%`,
      shop ? 'yes' : 'no',
      explore ? 'yes' : 'no',
      'no',
      exchange ? 'yes' : 'no',
      explore || shop || exchange ? 'NG — leaked route' : 'OK — furnace keeper only',
    ];
  });
}
