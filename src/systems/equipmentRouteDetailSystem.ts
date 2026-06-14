/**
 * 装備入手経路 — 実データから構築（/weapon /armor 図鑑・監査共通）
 */
import { getDb } from '../db/database';
import { AREAS } from '../db/seedData/areas';
import {
  EXCLUDED_EQUIPMENT,
  KAI_FORGE_WEAPON_IDS,
  RAID_ONLY_ITEMS,
} from '../db/seedData/equipmentClassification';
import { JOB_STARTER_WEAPONS } from '../db/seedData/jobStarterWeapons';
import {
  NORMAL_EXPLORE_POOL_EXCLUDED,
  TOWN_LOOT_NO_DROP_WEIGHT,
} from '../db/seedData/dropBalanceMaster';
import { getUiAvailableExchanges } from '../db/seedData/valhallaExchangeMaster';
import {
  OLD_KING_SERIES_ARMOR_IDS,
  OLD_KING_SERIES_ACCESSORY_IDS,
  VALHALLA_DEEP_AREA_IDS,
  VALHALLA_EXPLORE_SERIES_DROP,
  VALHALLA_SERIES_ARMOR_IDS,
  VALHALLA_SERIES_ACCESSORY_IDS,
  OLD_KING_DEEP_SERIES_DROP,
} from '../db/seedData/valhallaSeriesDropMaster';
import {
  VALHALLA_REPEAT_REWARDS,
} from '../db/seedData/valhallaRewardMaster';
import {
  CHEST_LOOT_TABLES,
  EQUIP_SLOT_WEIGHTS,
  REMATCH_LOOT_TABLE,
  getAreaLootTier,
  type LootTier,
} from './equipmentDropSystem';
import { buildEffectiveRewardPool } from './townLootSystem';
import { getShopCatalog } from './shopSystem';
import { resolveShopBuyPrice, getItemPricing } from './itemValueSystem';

export type EquipmentRouteKind =
  | 'shop'
  | 'explore'
  | 'enemy_drop'
  | 'boss_first_clear'
  | 'boss_rematch'
  | 'valhalla_boss'
  | 'exchange_random'
  | 'exchange_select'
  | 'forge'
  | 'special'
  | 'unavailable';

export type EquipmentRouteDetail = {
  kind: EquipmentRouteKind;
  sourceId?: string;
  sourceName: string;
  areaId?: string;
  areaName?: string;
  townName?: string;
  enemyId?: string;
  enemyName?: string;
  bossId?: string;
  bossName?: string;
  explicitRate?: string;
  weight?: number;
  poolTotalWeight?: number;
  estimatedRateText?: string;
  candidateCount?: number;
  effectiveRateText?: string;
  repeatable?: boolean;
  notes?: string[];
};

const TOWN_NAMES: Record<string, string> = {
  start_starfield: 'はじまりの星原',
  old_road_village: '古道の宿場村',
  twilight_port: '薄明の港町',
  rain_ruins: '雨音の廃村',
  silver_mine: '白銀鉱山街',
  prayer_hill: '祈りの丘',
  mist_forest: '霧深き森の集落',
  hollow_bell_town: '空鐘の町',
  moon_library: '月下図書館',
  buried_aqueduct: '埋没水路',
  forgotten_market: '忘却の地下市',
  hourglass_city: '砂時計の都',
  ash_capital: '灰冠の王都跡',
  glass_marsh: '硝子沼の集落',
  dragonbone_valley: '竜骨の峡谷',
  red_ash_fort: '赤灰の砦',
  silent_monastery: '沈黙の修道院',
  iron_snow_post: '鉄雪の関所',
  deep_furnace_outpost: '深層炉前哨基地',
  black_lantern_lane: '黒灯りの路地',
  starfall_observatory: '星落ちの観測所',
  valhalla_fortress: '空中要塞ヴァルハラ',
};

const EVENT_WEIGHTS = { battle: 40, material: 25, treasure: 15, npc_event: 10, nothing: 10 };

const EXCHANGE_CANDIDATE_POOLS: Record<string, readonly string[]> = {
  box_valhalla_armor_random: VALHALLA_SERIES_ARMOR_IDS,
  box_valhalla_armor_select: VALHALLA_SERIES_ARMOR_IDS,
  box_valhalla_accessory_random: VALHALLA_SERIES_ACCESSORY_IDS,
  box_valhalla_accessory_select: VALHALLA_SERIES_ACCESSORY_IDS,
};

type ItemMeta = {
  name: string;
  rarity: string;
  slot: string | null;
  series_id: string | null;
  is_unique: number;
};

type RouteIndex = Map<string, EquipmentRouteDetail[]>;

let cachedIndex: RouteIndex | null = null;

function pct(min: number, max?: number): string {
  const fmt = (v: number) => (v < 0.01 ? (v * 100).toFixed(2) : (v * 100).toFixed(1));
  if (max === undefined || min === max) return `${fmt(min)}%`;
  return `${fmt(min)}〜${fmt(max)}%`;
}

function formatPer100(rate: number): string {
  if (rate >= 1) return `約${rate.toFixed(1)}/100`;
  if (rate >= 0.01) return `約${rate.toFixed(2)}/100`;
  if (rate > 0) return `約${rate.toFixed(3)}/100`;
  return '0/100';
}

function slotWeight(slot: string | null): number {
  if (slot === 'weapon') return EQUIP_SLOT_WEIGHTS.weapon / 100;
  if (slot && slot in EQUIP_SLOT_WEIGHTS) {
    return (EQUIP_SLOT_WEIGHTS as Record<string, number>)[slot]! / 100;
  }
  return EQUIP_SLOT_WEIGHTS.body / 100;
}

function chestEquipChain(tier: LootTier, rarity: string): number {
  const chest = CHEST_LOOT_TABLES[tier];
  const equipW = chest.filter((c) => c.kind === 'equip').reduce((s, c) => s + c.weight, 0);
  const chestTotal = chest.reduce((s, c) => s + c.weight, 0);
  const rarityW = chest.find((c) => c.rarity === rarity)?.weight ?? 0;
  if (!equipW || !rarityW) return 0;
  return (equipW / chestTotal) * (rarityW / equipW);
}

function estimateExploreRatePer100(
  itemWeight: number,
  poolTotal: number,
  rarity: string,
  slot: string | null,
  tier: LootTier,
): number {
  if (itemWeight <= 0 || poolTotal <= 0) return 0;
  const share = itemWeight / poolTotal;
  const slotW = slotWeight(slot);
  const treasure = (EVENT_WEIGHTS.treasure / 100) * chestEquipChain(tier, rarity) * slotW * share;
  const material = (EVENT_WEIGHTS.material / 100) * share;
  const battle = (EVENT_WEIGHTS.battle / 100) * 0.06 * share * slotW;
  return (treasure + material + battle) * 100;
}

function rematchEquipFrameRate(): number {
  const equipEntry = REMATCH_LOOT_TABLE.find((e) => e.kind === 'equip');
  const total = REMATCH_LOOT_TABLE.reduce((s, e) => s + e.weight, 0);
  return equipEntry ? equipEntry.weight / total : 0;
}

function loadItemMeta(db: ReturnType<typeof getDb>, itemId: string): ItemMeta | undefined {
  const row = db.prepare(`
    SELECT i.name, i.rarity, e.slot, e.series_id, e.is_unique
    FROM items i
    LEFT JOIN equipment e ON i.id = e.item_id
    WHERE i.id = ?
  `).get(itemId) as ItemMeta | undefined;
  return row;
}

function addRoute(index: RouteIndex, itemId: string, route: EquipmentRouteDetail): void {
  const list = index.get(itemId) ?? [];
  const dup = list.some((r) =>
    r.kind === route.kind
    && r.sourceName === route.sourceName
    && r.areaName === route.areaName
    && r.enemyName === route.enemyName
    && r.bossName === route.bossName,
  );
  if (!dup) list.push(route);
  index.set(itemId, list);
}

function buildRouteIndex(db: ReturnType<typeof getDb>): RouteIndex {
  const index: RouteIndex = new Map();
  const itemCache = new Map<string, ItemMeta>();

  const meta = (id: string) => {
    if (!itemCache.has(id)) {
      const m = loadItemMeta(db, id);
      if (m) itemCache.set(id, m);
    }
    return itemCache.get(id);
  };

  const isEquipId = (id: string) => id.startsWith('wpn_') || id.startsWith('arm_') || id.startsWith('acc_');

  // --- Explore (town loot pool per area) ---
  for (const area of AREAS) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    const poolItemTotal = pool.reduce((s, p) => s + p.weight, 0);
    const poolTotal = poolItemTotal + TOWN_LOOT_NO_DROP_WEIGHT;
    const tier = getAreaLootTier(area.min, area.town);
    const townLabel = TOWN_NAMES[area.town] ?? area.town;

    for (const entry of pool) {
      if (!isEquipId(entry.item_id)) continue;
      if (NORMAL_EXPLORE_POOL_EXCLUDED.has(entry.item_id)) continue;
      const m = meta(entry.item_id);
      if (!m) continue;
      const per100 = estimateExploreRatePer100(entry.weight, poolTotal, m.rarity, m.slot, tier);
      addRoute(index, entry.item_id, {
        kind: 'explore',
        sourceId: area.id,
        sourceName: area.name,
        areaId: area.id,
        areaName: area.name,
        townName: townLabel,
        weight: entry.weight,
        poolTotalWeight: poolTotal,
        estimatedRateText: formatPer100(per100),
        repeatable: true,
      });
    }
  }

  // --- Valhalla explore series bonus ---
  for (const armorId of VALHALLA_SERIES_ARMOR_IDS) {
    const m = meta(armorId);
    if (!m) continue;
    const frameMin = VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMin * 0.62;
    const frameMax = VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMax * 0.62;
    const effMin = frameMin / VALHALLA_SERIES_ARMOR_IDS.length;
    const effMax = frameMax / VALHALLA_SERIES_ARMOR_IDS.length;
    addRoute(index, armorId, {
      kind: 'explore',
      sourceName: 'ヴァルハラ探索（おまけ枠）',
      townName: TOWN_NAMES.valhalla_fortress,
      explicitRate: pct(frameMin, frameMax),
      candidateCount: VALHALLA_SERIES_ARMOR_IDS.length,
      effectiveRateText: pct(effMin, effMax),
      repeatable: true,
      notes: ['防具62% / アクセ38% 後に均等抽選'],
    });
  }
  for (const accId of VALHALLA_SERIES_ACCESSORY_IDS) {
    const frameMin = VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMin * 0.38;
    const frameMax = VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMax * 0.38;
    addRoute(index, accId, {
      kind: 'explore',
      sourceName: 'ヴァルハラ探索（おまけ枠）',
      townName: TOWN_NAMES.valhalla_fortress,
      explicitRate: pct(frameMin, frameMax),
      candidateCount: VALHALLA_SERIES_ACCESSORY_IDS.length,
      effectiveRateText: pct(frameMin / VALHALLA_SERIES_ACCESSORY_IDS.length, frameMax / VALHALLA_SERIES_ACCESSORY_IDS.length),
      repeatable: true,
      notes: ['防具62% / アクセ38% 後に均等抽選'],
    });
  }
  for (const armorId of OLD_KING_SERIES_ARMOR_IDS) {
    const frameMin = OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMin * 0.62;
    const frameMax = OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMax * 0.62;
    addRoute(index, armorId, {
      kind: 'explore',
      sourceName: 'ヴァルハラ深層探索（旧王おまけ）',
      areaName: VALHALLA_DEEP_AREA_IDS.join(' / '),
      explicitRate: pct(frameMin, frameMax),
      candidateCount: OLD_KING_SERIES_ARMOR_IDS.length,
      effectiveRateText: pct(frameMin / OLD_KING_SERIES_ARMOR_IDS.length, frameMax / OLD_KING_SERIES_ARMOR_IDS.length),
      repeatable: true,
    });
  }
  for (const accId of OLD_KING_SERIES_ACCESSORY_IDS) {
    const frameMin = OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMin * 0.38;
    const frameMax = OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMax * 0.38;
    addRoute(index, accId, {
      kind: 'explore',
      sourceName: 'ヴァルハラ深層探索（旧王おまけ）',
      areaName: VALHALLA_DEEP_AREA_IDS.join(' / '),
      explicitRate: pct(frameMin, frameMax),
      candidateCount: OLD_KING_SERIES_ACCESSORY_IDS.length,
      effectiveRateText: pct(frameMin / OLD_KING_SERIES_ACCESSORY_IDS.length, frameMax / OLD_KING_SERIES_ACCESSORY_IDS.length),
      repeatable: true,
    });
  }

  // --- Shop ---
  for (const town of db.prepare('SELECT id FROM towns').all() as Array<{ id: string }>) {
    const townLabel = TOWN_NAMES[town.id] ?? town.id;
    for (const s of getShopCatalog(town.id)) {
      if (!isEquipId(s.item_id)) continue;
      const pricing = getItemPricing(s.item_id);
      addRoute(index, s.item_id, {
        kind: 'shop',
        sourceId: town.id,
        sourceName: townLabel,
        townName: townLabel,
        explicitRate: `${resolveShopBuyPrice(pricing!)}G`,
        repeatable: true,
      });
    }
  }

  // --- Monster direct drops + battle victory in area ---
  const monsters = db.prepare(`
    SELECT id, name, area_tag, drop_pool_json, is_boss FROM monsters
  `).all() as Array<{ id: string; name: string; area_tag: string; drop_pool_json: string; is_boss: number }>;

  for (const m of monsters) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string; weight: number }>;
    const poolTotal = drops.reduce((s, d) => s + d.weight, 0) || 1;
    for (const d of drops) {
      if (!isEquipId(d.item_id)) continue;
      const ratePct = ((d.weight / poolTotal) * 100).toFixed(1);
      addRoute(index, d.item_id, {
        kind: 'enemy_drop',
        sourceId: m.id,
        sourceName: m.name,
        enemyId: m.id,
        enemyName: m.name,
        weight: d.weight,
        poolTotalWeight: poolTotal,
        explicitRate: `${ratePct}%`,
        estimatedRateText: `drop pool weight ${d.weight}`,
        repeatable: true,
        notes: m.is_boss ? ['ボス drop pool'] : undefined,
      });

      if (m.is_boss) {
        const frame = rematchEquipFrameRate();
        addRoute(index, d.item_id, {
          kind: 'boss_rematch',
          sourceId: m.id,
          sourceName: m.name,
          bossId: m.id,
          bossName: m.name,
          explicitRate: pct(frame * (d.weight / poolTotal)),
          weight: d.weight,
          poolTotalWeight: poolTotal,
          estimatedRateText: `再戦装備枠${pct(frame)}×pool`,
          repeatable: true,
          notes: ['再戦時はエリアなし・魔物drop pool使用'],
        });
      }
    }
  }

  // --- Valhalla boss rematch ---
  const rp = VALHALLA_REPEAT_REWARDS;
  for (const armorId of VALHALLA_SERIES_ARMOR_IDS) {
    addRoute(index, armorId, {
      kind: 'valhalla_boss',
      sourceName: 'ヴァルハラ系強敵',
      bossName: 'ヴァルハラ系強敵',
      explicitRate: pct(rp.armorRateMin, rp.armorRateMax),
      candidateCount: VALHALLA_SERIES_ARMOR_IDS.length,
      effectiveRateText: pct(
        rp.armorRateMin / VALHALLA_SERIES_ARMOR_IDS.length,
        rp.armorRateMax / VALHALLA_SERIES_ARMOR_IDS.length,
      ),
      repeatable: true,
      notes: ['ヴァルハラ防具抽選枠 / 候補均等'],
    });
  }
  for (const accId of VALHALLA_SERIES_ACCESSORY_IDS) {
    addRoute(index, accId, {
      kind: 'valhalla_boss',
      sourceName: 'ヴァルハラ系強敵',
      bossName: 'ヴァルハラ系強敵',
      explicitRate: pct(rp.accessoryRateMin, rp.accessoryRateMax),
      candidateCount: VALHALLA_SERIES_ACCESSORY_IDS.length,
      effectiveRateText: pct(
        rp.accessoryRateMin / VALHALLA_SERIES_ACCESSORY_IDS.length,
        rp.accessoryRateMax / VALHALLA_SERIES_ACCESSORY_IDS.length,
      ),
      repeatable: true,
      notes: ['ヴァルハラアクセ抽選枠 / 候補均等'],
    });
  }
  for (const armorId of OLD_KING_SERIES_ARMOR_IDS) {
    addRoute(index, armorId, {
      kind: 'valhalla_boss',
      sourceName: 'ヴァルハラ系強敵',
      bossName: 'ヴァルハラ系強敵',
      explicitRate: pct(rp.oldKingArmorRateMin, rp.oldKingArmorRateMax),
      candidateCount: OLD_KING_SERIES_ARMOR_IDS.length,
      effectiveRateText: pct(
        rp.oldKingArmorRateMin / OLD_KING_SERIES_ARMOR_IDS.length,
        rp.oldKingArmorRateMax / OLD_KING_SERIES_ARMOR_IDS.length,
      ),
      repeatable: true,
      notes: ['旧王防具抽選枠 / 候補均等'],
    });
  }
  for (const accId of OLD_KING_SERIES_ACCESSORY_IDS) {
    addRoute(index, accId, {
      kind: 'valhalla_boss',
      sourceName: 'ヴァルハラ系強敵',
      bossName: 'ヴァルハラ系強敵',
      explicitRate: pct(rp.oldKingAccessoryRateMin, rp.oldKingAccessoryRateMax),
      candidateCount: OLD_KING_SERIES_ACCESSORY_IDS.length,
      effectiveRateText: pct(
        rp.oldKingAccessoryRateMin / OLD_KING_SERIES_ACCESSORY_IDS.length,
        rp.oldKingAccessoryRateMax / OLD_KING_SERIES_ACCESSORY_IDS.length,
      ),
      repeatable: true,
      notes: ['旧王アクセ抽選枠 / 候補均等'],
    });
  }

  // Valhalla first clear — random valhalla gear
  for (const id of [...VALHALLA_SERIES_ARMOR_IDS, ...VALHALLA_SERIES_ACCESSORY_IDS]) {
    addRoute(index, id, {
      kind: 'boss_first_clear',
      sourceName: 'ヴァルハラボス初回撃破',
      bossName: 'ヴァルハラボス',
      explicitRate: '100%',
      candidateCount: VALHALLA_SERIES_ARMOR_IDS.length + VALHALLA_SERIES_ACCESSORY_IDS.length,
      effectiveRateText: pct(0.55 / VALHALLA_SERIES_ARMOR_IDS.length, 0.55 / VALHALLA_SERIES_ARMOR_IDS.length),
      repeatable: false,
      notes: ['初回はヴァルハラ防具/アクセからランダム1件'],
    });
  }

  // --- Exchange ---
  for (const ex of getUiAvailableExchanges()) {
    if (ex.receive_type !== 'equipment_box') continue;
    const pool = EXCHANGE_CANDIDATE_POOLS[ex.receive_item_id];
    if (!pool?.length) continue;
    const kind = ex.exchange_id.includes('select') ? 'exchange_select' : 'exchange_random';
    for (const itemId of pool) {
      addRoute(index, itemId, {
        kind,
        sourceId: ex.exchange_id,
        sourceName: ex.receive_item_name,
        explicitRate: kind === 'exchange_select' ? '選択入手' : undefined,
        candidateCount: pool.length,
        effectiveRateText: kind === 'exchange_random'
          ? pct(1 / pool.length)
          : '選択で確定',
        repeatable: true,
        notes: [
          `必要: ヴァルハラ徽章 ${ex.cost_valhalla_emblem}`,
          ...(ex.cost_silent_page ? [`無答の頁 ${ex.cost_silent_page}`] : []),
        ],
      });
    }
  }

  // --- Forge / special ---
  for (const [job, starterId] of Object.entries(JOB_STARTER_WEAPONS)) {
    addRoute(index, starterId, {
      kind: 'special',
      sourceName: 'ジョブ開始武器',
      explicitRate: '—',
      notes: [`${job} 選択時`],
      repeatable: false,
    });
  }
  addRoute(index, 'wpn_traveler_sword', {
    kind: 'special',
    sourceName: '冒険開始時',
    repeatable: false,
  });

  for (const id of KAI_FORGE_WEAPON_IDS) {
    addRoute(index, id, {
      kind: 'forge',
      sourceName: 'カイ伝承（Uni昇華）',
      repeatable: true,
      notes: ['覚醒IV + 職別素材'],
    });
  }

  const srcRows = db.prepare('SELECT base_item_id, src_item_id, name FROM src_weapons').all() as Array<{
    base_item_id: string; src_item_id: string; name: string;
  }>;
  for (const s of srcRows) {
    addRoute(index, s.src_item_id, {
      kind: 'forge',
      sourceName: 'Src変質',
      explicitRate: '—',
      notes: [`基礎: ${s.name}`],
      repeatable: true,
    });
  }

  for (const id of RAID_ONLY_ITEMS) {
    addRoute(index, id, {
      kind: 'special',
      sourceName: 'レイド報酬',
      repeatable: true,
    });
  }

  // Legacy / excluded
  for (const [id, ex] of Object.entries(EXCLUDED_EQUIPMENT)) {
    index.set(id, [{
      kind: 'unavailable',
      sourceName: '現在通常入手不可',
      notes: [ex.reason],
      repeatable: false,
    }]);
  }

  return index;
}

function getIndex(): RouteIndex {
  if (!cachedIndex) cachedIndex = buildRouteIndex(getDb());
  return cachedIndex;
}

export function clearEquipmentRouteDetailCache(): void {
  cachedIndex = null;
}

export function getEquipmentRouteDetails(equipmentId: string): EquipmentRouteDetail[] {
  const ex = EXCLUDED_EQUIPMENT[equipmentId];
  if (ex?.classification === 'legacy') {
    return [{
      kind: 'unavailable',
      sourceName: '現在通常入手不可',
      notes: [ex.reason],
      repeatable: false,
    }];
  }
  return getIndex().get(equipmentId) ?? [];
}

export function calculateRouteEffectiveRate(route: EquipmentRouteDetail): string | null {
  if (route.effectiveRateText) return route.effectiveRateText;
  if (route.explicitRate && route.candidateCount && route.candidateCount > 1) {
    const m = route.explicitRate.match(/([\d.]+)(?:〜([\d.]+))?%/);
    if (m) {
      const lo = parseFloat(m[1]!) / route.candidateCount;
      const hi = m[2] ? parseFloat(m[2]) / route.candidateCount : lo;
      return pct(lo / 100, hi / 100);
    }
  }
  if (route.estimatedRateText) return route.estimatedRateText;
  if (route.weight && route.poolTotalWeight) {
    return pct(route.weight / route.poolTotalWeight);
  }
  return null;
}

type SectionKey =
  | 'shop'
  | 'explore'
  | 'enemy_drop'
  | 'boss_first_clear'
  | 'boss_rematch'
  | 'valhalla_boss'
  | 'exchange'
  | 'forge'
  | 'special'
  | 'status';

const SECTION_LABELS: Record<SectionKey, string> = {
  shop: '【ショップ】',
  explore: '【探索】',
  enemy_drop: '【敵討伐】',
  boss_first_clear: '【ボス初回撃破】',
  boss_rematch: '【ボス再戦】',
  valhalla_boss: '【ヴァルハラ再戦報酬】',
  exchange: '【交換】',
  forge: '【強化/変質】',
  special: '【特殊】',
  status: '【入手状況】',
};

function routeSection(kind: EquipmentRouteKind): SectionKey {
  if (kind === 'shop') return 'shop';
  if (kind === 'explore') return 'explore';
  if (kind === 'enemy_drop') return 'enemy_drop';
  if (kind === 'boss_first_clear') return 'boss_first_clear';
  if (kind === 'boss_rematch') return 'boss_rematch';
  if (kind === 'valhalla_boss') return 'valhalla_boss';
  if (kind === 'exchange_random' || kind === 'exchange_select') return 'exchange';
  if (kind === 'forge') return 'forge';
  if (kind === 'special') return 'special';
  return 'status';
}

function formatExploreLine(r: EquipmentRouteDetail): string[] {
  const lines = [`・${r.areaName ?? r.sourceName}`];
  const parts: string[] = [];
  if (r.weight != null) parts.push(`weight ${r.weight}`);
  if (r.estimatedRateText) parts.push(`推定 ${r.estimatedRateText}`);
  else if (r.explicitRate) parts.push(r.explicitRate);
  if (r.effectiveRateText && r.candidateCount) {
    parts.push(`実質目安 ${r.effectiveRateText}`);
  }
  if (parts.length) lines.push(`  ${parts.join(' / ')}`);
  if (r.notes?.length) lines.push(`  ※${r.notes[0]}`);
  return lines;
}

function formatEnemyLine(r: EquipmentRouteDetail): string[] {
  const label = r.enemyName ?? r.sourceName;
  const rate = r.explicitRate ?? r.estimatedRateText ?? '';
  const lines = [`・${label}${rate ? `: ${rate}` : ''}`];
  if (r.notes?.length) lines.push(`  ${r.notes[0]}`);
  else if (r.areaName && r.enemyName) lines.push(`  出現: ${r.areaName}`);
  return lines;
}

function formatBossRematchLine(r: EquipmentRouteDetail): string[] {
  const lines = [`・${r.bossName ?? r.sourceName}`];
  if (r.explicitRate) lines.push(`  装備抽選: ${r.explicitRate}`);
  const eff = calculateRouteEffectiveRate(r);
  if (eff && r.candidateCount) lines.push(`  この装備の実質目安: ${eff}`);
  else if (r.estimatedRateText) lines.push(`  ${r.estimatedRateText}`);
  if (r.notes?.length) lines.push(`  ※${r.notes[0]}`);
  return lines;
}

function formatValhallaBossLine(r: EquipmentRouteDetail): string[] {
  const lines = [`・${r.bossName ?? r.sourceName}`];
  if (r.explicitRate) {
    const isArmorFrame = r.notes?.some((n) => n.includes('防具')) ?? false;
    const isAccFrame = r.notes?.some((n) => n.includes('アクセ')) ?? false;
    const label = isArmorFrame ? 'ヴァルハラ防具抽選' : isAccFrame ? 'アクセ抽選' : '抽選枠';
    lines.push(`  ${label}: ${r.explicitRate}`);
  }
  const eff = calculateRouteEffectiveRate(r);
  if (eff) lines.push(`  この装備の実質目安: ${eff}`);
  if (r.notes?.length) lines.push(`  ※${r.notes[0]}`);
  return lines;
}

function formatExchangeLine(r: EquipmentRouteDetail): string[] {
  const lines = [`・${r.sourceName}`];
  if (r.notes?.length) lines.push(`  ${r.notes.join(' / ')}`);
  if (r.kind === 'exchange_select') {
    lines.push('  対象部位を選択して入手可能');
  } else if (r.candidateCount) {
    lines.push(`  ランダム候補から抽選（候補${r.candidateCount}種）`);
    const eff = calculateRouteEffectiveRate(r);
    if (eff) lines.push(`  この装備の実質目安: ${eff}`);
  }
  return lines;
}

function formatRouteDetail(r: EquipmentRouteDetail): string[] {
  switch (r.kind) {
    case 'shop':
      return [`・${r.sourceName}: ${r.explicitRate ?? '—'}`];
    case 'explore':
      return formatExploreLine(r);
    case 'enemy_drop':
      return formatEnemyLine(r);
    case 'boss_rematch':
      return formatBossRematchLine(r);
    case 'valhalla_boss':
      return formatValhallaBossLine(r);
    case 'boss_first_clear':
      return [`・${r.sourceName}${r.explicitRate ? `: ${r.explicitRate}` : ''}`];
    case 'exchange_random':
    case 'exchange_select':
      return formatExchangeLine(r);
    case 'forge':
    case 'special':
      return [`・${r.sourceName}${r.notes?.length ? ` — ${r.notes.join(' / ')}` : ''}`];
    case 'unavailable':
      return ['現在通常入手不可', ...(r.notes ?? []).map((n) => `※ ${n}`)];
    default:
      return [`・${r.sourceName}`];
  }
}

const ALWAYS_SHOW_NONE: SectionKey[] = ['enemy_drop', 'boss_rematch', 'exchange'];

export function formatEquipmentRouteLines(equipmentId: string): string[] {
  const routes = getEquipmentRouteDetails(equipmentId);
  if (!routes.length) {
    return [
      SECTION_LABELS.status,
      '・入手経路データなし',
      SECTION_LABELS.enemy_drop,
      '・なし',
      SECTION_LABELS.boss_rematch,
      '・なし',
      SECTION_LABELS.exchange,
      '・なし',
    ];
  }

  if (routes.length === 1 && routes[0]!.kind === 'unavailable') {
    return formatRouteDetail(routes[0]!);
  }

  const grouped = new Map<SectionKey, EquipmentRouteDetail[]>();
  for (const r of routes) {
    const sec = routeSection(r.kind);
    const list = grouped.get(sec) ?? [];
    list.push(r);
    grouped.set(sec, list);
  }

  const order: SectionKey[] = [
    'shop', 'explore', 'enemy_drop', 'boss_first_clear', 'boss_rematch',
    'exchange', 'forge', 'special',
  ];

  const out: string[] = [];
  for (const sec of order) {
    let list = grouped.get(sec);
    if (sec === 'boss_rematch') {
      const merged = [
        ...(grouped.get('boss_rematch') ?? []),
        ...(grouped.get('valhalla_boss') ?? []),
      ];
      list = merged.length ? merged : undefined;
    }

    if (!list?.length) {
      if (ALWAYS_SHOW_NONE.includes(sec)) {
        out.push(SECTION_LABELS[sec], '・なし', '');
      }
      continue;
    }

    out.push(SECTION_LABELS[sec]);

    if (sec === 'explore') {
      const sorted = [...list].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
      const detailed = sorted.filter((r) => r.areaName);
      const bonus = sorted.filter((r) => !r.areaName);
      const show = detailed.slice(0, 5);
      for (const r of show) out.push(...formatRouteDetail(r));
      if (detailed.length > 5) out.push(`  ほか ${detailed.length - 5}エリア`);
      for (const r of bonus) out.push(...formatRouteDetail(r));
    } else if (sec === 'boss_rematch') {
      for (const r of list.slice(0, 8)) {
        out.push(...(r.kind === 'valhalla_boss' ? formatValhallaBossLine(r) : formatRouteDetail(r)));
      }
    } else {
      for (const r of list.slice(0, 10)) out.push(...formatRouteDetail(r));
      if (list.length > 10) out.push(`  ほか ${list.length - 10}件`);
    }
    out.push('');
  }

  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/** 監査用 — セクション有無フラグ */
export function getEquipmentRouteSectionFlags(equipmentId: string): {
  hasShop: boolean;
  hasExplore: boolean;
  hasEnemyDrop: boolean;
  hasBossRematch: boolean;
  hasValhallaBoss: boolean;
  hasExchange: boolean;
  hasNoneSections: boolean;
  legacyOrUnavailable: boolean;
} {
  const routes = getEquipmentRouteDetails(equipmentId);
  const lines = formatEquipmentRouteLines(equipmentId);
  const kinds = new Set(routes.map((r) => r.kind));
  return {
    hasShop: kinds.has('shop'),
    hasExplore: kinds.has('explore'),
    hasEnemyDrop: kinds.has('enemy_drop'),
    hasBossRematch: kinds.has('boss_rematch') || kinds.has('valhalla_boss'),
    hasValhallaBoss: kinds.has('valhalla_boss'),
    hasExchange: kinds.has('exchange_random') || kinds.has('exchange_select'),
    hasNoneSections: lines.some((l) => l === '・なし'),
    legacyOrUnavailable: kinds.has('unavailable'),
  };
}
