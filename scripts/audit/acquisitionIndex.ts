/** Shared acquisition index for equipment audit scripts */
import { getDb } from '../../src/db/database';
import { ensurePhase2Seed } from '../../src/db/seedData/phase2Seed';
import { ensurePhase2EquipmentRoutes } from '../../src/db/seedData/ensurePhase2EquipmentRoutes';
import { ensureMaterialsSeed } from '../../src/db/seedData/materials';
import { ensureMasterDataSeed } from '../../src/db/seedData/masterDataSeed';
import { AREAS } from '../../src/db/seedData/areas';
import { getShopCatalog } from '../../src/systems/shopSystem';
import {
  JOB_STARTER_WEAPONS, STARTER_UNIQUE_TARGETS, STARTER_WEAPON_IDS,
} from '../../src/db/seedData/jobStarterWeapons';
import {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID,
  SRC_FORGE_MATERIAL_DROP_RATE, REMATCH_MATERIAL_BOSSES, SRC_FARM_MONSTER_IDS,
} from '../../src/db/seedData/forgeMaster';
import {
  EQUIP_SLOT_WEIGHTS, BATTLE_EQUIP_TABLES,
} from '../../src/systems/equipmentDropSystem';
import { AWAKENING_ELIGIBLE_RARITIES } from '../../src/db/seedData/awakeningMaster';

export type SourceKind =
  | 'starter_job' | 'area_drop' | 'town_pool' | 'shop' | 'boss_first_clear'
  | 'boss_rematch' | 'raid' | 'valhalla' | 'kai_forge' | 'src_manifest'
  | 'admin_only' | 'legacy' | 'unobtainable' | 'unknown';

export type ArmorSourceKind =
  | 'area_drop' | 'town_pool' | 'shop' | 'boss_first_clear' | 'boss_rematch'
  | 'raid' | 'valhalla' | 'admin_only' | 'legacy' | 'unobtainable' | 'unknown';

export interface SourceEntry {
  kind: SourceKind | ArmorSourceKind;
  location: string;
  detail: string;
  dropRate: string;
}

export interface WeaponRow {
  item_id: string;
  name: string;
  rarity: string;
  weapon_type: string;
  jobs: string;
  attack: number;
  magic: number;
  defense: number;
  max_hp: number;
  max_mp: number;
  speed: number;
  max_upgrade: number;
  awakening_ok: string;
  is_uni_base: string;
  is_uni: string;
  is_src: string;
  is_starter: string;
  starter_job: string;
  methods: string;
  locations: string;
  source_kinds: string;
  drop_rates: string;
  shop: string;
  boss: string;
  rematch: string;
  valhalla_raid: string;
  kai: string;
  manifest: string;
  obtainable: string;
  unknown: string;
}

export interface ArmorRow {
  item_id: string;
  name: string;
  rarity: string;
  slot: string;
  series: string;
  jobs: string;
  max_hp: number;
  max_mp: number;
  attack: number;
  magic: number;
  defense: number;
  speed: number;
  max_upgrade: number;
  methods: string;
  locations: string;
  source_kinds: string;
  drop_rates: string;
  shop: string;
  area_pool: string;
  boss: string;
  valhalla_raid: string;
  obtainable: string;
  unknown: string;
}

const TOWN_NAMES: Record<string, string> = {
  start_starfield: 'はじまりの星原', old_road_village: '古道の宿場村', twilight_port: '薄明の港町',
  rain_ruins: '雨音の廃村', silver_mine: '白銀鉱山街', prayer_hill: '祈りの丘',
  mist_forest: '霧深き森の集落', hollow_bell_town: '空鐘の町', moon_library: '月下図書館',
  buried_aqueduct: '埋没水路', forgotten_market: '忘却の地下市', hourglass_city: '砂時計の都',
  ash_capital: '灰冠の王都跡', glass_marsh: '硝子沼の集落', dragonbone_valley: '竜骨の峡谷',
  red_ash_fort: '赤灰の砦', silent_monastery: '沈黙の修道院', iron_snow_post: '鉄雪の関所',
  deep_furnace_outpost: '深層炉前哨基地', black_lantern_lane: '黒灯りの路地',
  starfall_observatory: '星落ちの観測所', valhalla_fortress: '空中要塞ヴァルハラ',
};

const STARTER_JOB_BY_ITEM = new Map(Object.entries(JOB_STARTER_WEAPONS).map(([j, id]) => [id, j]));
const UNI_BY_STARTER = new Map(Object.entries(STARTER_UNIQUE_TARGETS));
const SRC_BY_UNI = new Map<string, { srcId: string; manifestGold: number; manifestMats: string }>();

export function initAuditDb() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensurePhase2EquipmentRoutes(db);
  ensureMasterDataSeed(db);
  return db;
}

function loadSrcManifestMap(db: ReturnType<typeof getDb>) {
  SRC_BY_UNI.clear();
  const rows = db.prepare('SELECT id, base_item_id, manifest_requirements_json FROM src_weapons').all() as Array<{
    id: string; base_item_id: string; manifest_requirements_json: string;
  }>;
  for (const r of rows) {
    try {
      const req = JSON.parse(r.manifest_requirements_json) as { gold: number; materials: Array<{ id: string; qty: number }> };
      SRC_BY_UNI.set(r.base_item_id, {
        srcId: r.id,
        manifestGold: req.gold,
        manifestMats: req.materials.map((m) => `${m.id}×${m.qty}`).join(', '),
      });
    } catch { /* ignore */ }
  }
}

function buildAreaIndex(db: ReturnType<typeof getDb>) {
  const byItem = new Map<string, string[]>();
  const areas = db.prepare(`
    SELECT ea.id, ea.name, ea.town_id, ea.reward_pool_json, t.name AS town_name
    FROM exploration_areas ea
    LEFT JOIN towns t ON ea.town_id = t.id
  `).all() as Array<{ id: string; name: string; town_id: string; reward_pool_json: string; town_name: string | null }>;

  for (const a of areas) {
    let pool: Array<{ item_id: string; weight?: number }> = [];
    try { pool = JSON.parse(a.reward_pool_json || '[]'); } catch { /* ignore */ }
    const townLabel = TOWN_NAMES[a.town_id] ?? a.town_name ?? a.town_id;
    for (const p of pool) {
      if (!p.item_id || p.item_id.startsWith('town_pool_')) continue;
      if (!byItem.has(p.item_id)) byItem.set(p.item_id, []);
      const loc = `${a.name}（${townLabel}）`;
      const list = byItem.get(p.item_id)!;
      if (!list.includes(loc)) list.push(loc);
    }
  }
  return byItem;
}

function buildShopIndex(db: ReturnType<typeof getDb>) {
  const byItem = new Map<string, string[]>();
  const towns = db.prepare('SELECT id FROM towns').all() as Array<{ id: string }>;
  for (const t of towns) {
    const townName = TOWN_NAMES[t.id] ?? t.id;
    for (const item of getShopCatalog(t.id)) {
      if (!byItem.has(item.item_id)) byItem.set(item.item_id, []);
      if (!byItem.get(item.item_id)!.includes(townName)) byItem.get(item.item_id)!.push(townName);
    }
  }
  return byItem;
}

function buildMonsterDropIndex(db: ReturnType<typeof getDb>) {
  const byItem = new Map<string, Array<{ monsterId: string; name: string; area: string; weight: number }>>();
  const monsters = db.prepare('SELECT id, name, area_tag, drop_pool_json, is_boss FROM monsters').all() as Array<{
    id: string; name: string; area_tag: string; drop_pool_json: string; is_boss: number;
  }>;
  for (const m of monsters) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string; weight: number }>;
    for (const d of drops) {
      if (!byItem.has(d.item_id)) byItem.set(d.item_id, []);
      byItem.get(d.item_id)!.push({ monsterId: m.id, name: m.name, area: m.area_tag, weight: d.weight });
    }
  }
  return { byItem, monsters };
}

function isInValhallaPool(itemId: string, areaByItem: Map<string, string[]>) {
  const locs = areaByItem.get(itemId) ?? [];
  return locs.some((l) => l.includes('ヴァルハラ') || l.includes('valhalla'));
}

function isRaidItem(itemId: string) {
  return itemId.startsWith('raid_') || itemId.startsWith('src_valhalla') || itemId.startsWith('src_machina')
    || itemId.startsWith('src_old_king') || itemId.startsWith('src_deep');
}

export function buildWeaponAuditRows(): WeaponRow[] {
  const db = initAuditDb();
  loadSrcManifestMap(db);
  const areaByItem = buildAreaIndex(db);
  const shopByItem = buildShopIndex(db);
  const { byItem: monsterByItem, monsters } = buildMonsterDropIndex(db);

  const srcItems = new Set(
    db.prepare(`SELECT item_id FROM equipment e JOIN items i ON e.item_id=i.id WHERE i.rarity='Src'`).all()
      .map((r: { item_id: string }) => r.item_id),
  );
  const uniItems = new Set(
    db.prepare(`SELECT item_id FROM equipment WHERE is_unique=1 OR item_id LIKE 'wpn_unique_%'`).all()
      .map((r: { item_id: string }) => r.item_id),
  );

  const weapons = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.weapon_type, e.attack_bonus, e.magic_bonus, e.defense_bonus,
      e.hp_bonus, e.mp_bonus, e.speed_bonus, e.max_upgrade_level, e.is_unique, e.src_weapon_id,
      e.required_job, i.acquisition_json
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE e.slot = 'weapon' AND i.category = 'equipment'
    ORDER BY i.rarity, i.name
  `).all() as Array<Record<string, unknown>>;

  const srcJobs = new Map<string, string>();
  for (const s of db.prepare('SELECT base_item_id, jobs_json FROM src_weapons').all() as Array<{ base_item_id: string; jobs_json: string }>) {
    try { srcJobs.set(s.base_item_id, JSON.parse(s.jobs_json).join('・')); } catch { srcJobs.set(s.base_item_id, '?'); }
  }

  const rows: WeaponRow[] = [];
  for (const w of weapons) {
    const id = w.id as string;
    const unknown: string[] = [];
    const sources: SourceEntry[] = [];
    const starterJob = STARTER_JOB_BY_ITEM.get(id);
    if (starterJob) {
      sources.push({ kind: 'starter_job', location: 'ジョブ選択', detail: starterJob, dropRate: '—' });
    }
    for (const loc of areaByItem.get(id) ?? []) {
      sources.push({ kind: 'area_drop', location: loc, detail: 'area rewards pool', dropRate: 'weighted pool' });
    }
    for (const town of shopByItem.get(id) ?? []) {
      sources.push({ kind: 'shop', location: town, detail: 'shop catalog', dropRate: '—' });
    }
    for (const d of monsterByItem.get(id) ?? []) {
      sources.push({
        kind: d.monsterId.includes('boss') || monsters.find((m) => m.id === d.monsterId)?.is_boss ? 'boss_first_clear' : 'area_drop',
        location: `${d.name}（${d.area}）`,
        detail: d.monsterId,
        dropRate: `pool weight ${d.weight}`,
      });
    }
    if (UNI_BY_STARTER.has(id)) {
      sources.push({ kind: 'kai_forge', location: '白銀鉱山・カイ', detail: `→ ${UNI_BY_STARTER.get(id)}`, dropRate: '—' });
    }
    if (uniItems.has(id)) {
      const manifest = SRC_BY_UNI.get(id);
      if (manifest) {
        sources.push({ kind: 'src_manifest', location: '/upgrade manifest', detail: `${manifest.manifestGold}G + ${manifest.manifestMats}`, dropRate: '—' });
      }
      sources.push({ kind: 'kai_forge', location: 'カイ Src変質', detail: `${SRC_FORGE_MATERIAL_ID}×1`, dropRate: `${SRC_FORGE_MATERIAL_DROP_RATE * 100}% farm` });
    }
    if (srcItems.has(id)) {
      sources.push({ kind: 'kai_forge', location: 'カイ/Kai or manifest', detail: 'Src weapon', dropRate: '—' });
    }
    if (isInValhallaPool(id, areaByItem) || isRaidItem(id)) {
      sources.push({ kind: 'valhalla', location: 'ヴァルハラ', detail: 'endgame pool', dropRate: '—' });
    }
    if (id.startsWith('wpn_src_')) {
      sources.push({ kind: 'legacy', location: 'manifest or kai_src', detail: 'dual path', dropRate: '—' });
    }

    const obtainable = sources.length > 0 ? 'YES' : 'NO';
    if (obtainable === 'NO') unknown.push('no acquisition path found');
    if (!(w.required_job || srcJobs.get(id))) unknown.push('equip jobs not in DB');

    const isStarter = starterJob ? 'YES' : 'NO';
    const isUni = uniItems.has(id) || w.rarity === 'Uni' ? 'YES' : 'NO';
    const isSrc = srcItems.has(id) || w.rarity === 'Src' ? 'YES' : 'NO';
    const awakeningOk = AWAKENING_ELIGIBLE_RARITIES.has(w.rarity as string) && !w.is_unique ? 'YES' : isUni === 'YES' ? 'NO(Uni)' : isSrc === 'YES' ? 'NO(Src)' : 'NO';

    rows.push({
      item_id: id,
      name: w.name as string,
      rarity: w.rarity as string,
      weapon_type: (w.weapon_type as string) ?? '—',
      jobs: (w.required_job as string) ?? srcJobs.get(id) ?? '全職/UNKNOWN',
      attack: (w.attack_bonus as number) ?? 0,
      magic: (w.magic_bonus as number) ?? 0,
      defense: (w.defense_bonus as number) ?? 0,
      max_hp: (w.hp_bonus as number) ?? 0,
      max_mp: (w.mp_bonus as number) ?? 0,
      speed: (w.speed_bonus as number) ?? 0,
      max_upgrade: (w.max_upgrade_level as number) ?? 0,
      awakening_ok: awakeningOk,
      is_uni_base: UNI_BY_STARTER.has(id) ? 'YES' : 'NO',
      is_uni: isUni,
      is_src: isSrc,
      is_starter: isStarter,
      starter_job: starterJob ?? '—',
      methods: sources.map((s) => s.kind).join(';'),
      locations: sources.map((s) => s.location).join('; '),
      source_kinds: [...new Set(sources.map((s) => s.kind))].join(';'),
      drop_rates: sources.map((s) => s.dropRate).join('; '),
      shop: shopByItem.has(id) ? 'YES' : 'NO',
      boss: sources.some((s) => s.kind === 'boss_first_clear') ? 'YES' : 'NO',
      rematch: '—',
      valhalla_raid: sources.some((s) => s.kind === 'valhalla' || s.kind === 'raid') ? 'YES' : 'NO',
      kai: sources.some((s) => s.kind === 'kai_forge') ? 'YES' : 'NO',
      manifest: sources.some((s) => s.kind === 'src_manifest') ? 'YES' : 'NO',
      obtainable,
      unknown: unknown.join('; ') || '—',
    });
  }
  return rows;
}

export function buildArmorAuditRows(): ArmorRow[] {
  const db = initAuditDb();
  const areaByItem = buildAreaIndex(db);
  const shopByItem = buildShopIndex(db);
  const { byItem: monsterByItem } = buildMonsterDropIndex(db);

  const armor = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.slot, e.series_id, e.attack_bonus, e.magic_bonus, e.defense_bonus,
      e.hp_bonus, e.mp_bonus, e.speed_bonus, e.max_upgrade_level, e.required_job
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE i.category = 'equipment' AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2','shield')
    ORDER BY e.slot, i.rarity, i.name
  `).all() as Array<Record<string, unknown>>;

  const rows: ArmorRow[] = [];
  for (const a of armor) {
    const id = a.id as string;
    const slot = a.slot as string;
    const unknown: string[] = [];
    const sources: SourceEntry[] = [];

    for (const loc of areaByItem.get(id) ?? []) {
      sources.push({ kind: 'area_drop', location: loc, detail: 'area pool', dropRate: 'weighted' });
    }
    for (const town of shopByItem.get(id) ?? []) {
      sources.push({ kind: 'shop', location: town, detail: 'shop', dropRate: '—' });
    }
    for (const d of monsterByItem.get(id) ?? []) {
      sources.push({ kind: 'boss_first_clear', location: `${d.name}`, detail: d.monsterId, dropRate: `w${d.weight}` });
    }
    if (isInValhallaPool(id, areaByItem) || isRaidItem(id)) {
      sources.push({ kind: 'valhalla', location: 'ヴァルハラ', detail: 'pool', dropRate: '—' });
    }

    const inPool = (areaByItem.get(id)?.length ?? 0) > 0;
    const inShop = (shopByItem.get(id)?.length ?? 0) > 0;
    const obtainable = inPool || inShop || sources.length > 0 ? 'YES' : 'NO';
    if (obtainable === 'NO') unknown.push('no pool/shop/drop');

    rows.push({
      item_id: id,
      name: a.name as string,
      rarity: a.rarity as string,
      slot,
      series: (a.series_id as string) ?? '—',
      jobs: (a.required_job as string) ?? '全職',
      max_hp: (a.hp_bonus as number) ?? 0,
      max_mp: (a.mp_bonus as number) ?? 0,
      attack: (a.attack_bonus as number) ?? 0,
      magic: (a.magic_bonus as number) ?? 0,
      defense: (a.defense_bonus as number) ?? 0,
      speed: (a.speed_bonus as number) ?? 0,
      max_upgrade: (a.max_upgrade_level as number) ?? 0,
      methods: sources.map((s) => s.kind).join(';') || 'unobtainable',
      locations: sources.map((s) => s.location).join('; ') || '—',
      source_kinds: [...new Set(sources.map((s) => s.kind))].join(';') || 'unobtainable',
      drop_rates: sources.map((s) => s.dropRate).join('; ') || '—',
      shop: inShop ? 'YES' : 'NO',
      area_pool: inPool ? 'YES' : 'NO',
      boss: sources.some((s) => s.kind === 'boss_first_clear') ? 'YES' : 'NO',
      valhalla_raid: sources.some((s) => s.kind === 'valhalla') ? 'YES' : 'NO',
      obtainable,
      unknown: unknown.join('; ') || '—',
    });
  }
  return rows;
}

export const EIGHT_JOB_ROUTES = [
  { job: '剣士', starter: 'wpn_traveler_sword', uni: 'wpn_unique_twilight', src: 'src_twilight' },
  { job: '重騎士', starter: 'wpn_training_hammer', uni: 'wpn_unique_old_hammer', src: 'src_silver' },
  { job: '狩人', starter: 'wpn_old_bow', uni: 'wpn_unique_echo', src: 'src_echo' },
  { job: '魔術師', starter: 'wpn_mist_staff', uni: 'wpn_unique_mist_lantern', src: 'src_mist_lantern' },
  { job: '祈祷師', starter: 'wpn_prayer_rod', uni: 'wpn_unique_lamp', src: 'src_lamp' },
  { job: '斥候', starter: 'wpn_rust_dagger', uni: 'wpn_unique_mirror', src: 'src_mirror' },
  { job: '機工師', starter: 'wpn_mini_cannon', uni: 'wpn_unique_deep', src: 'src_deep' },
  { job: '格闘士', starter: 'wpn_leather_gauntlet', uni: 'wpn_unique_black_fox', src: 'src_black_fox' },
];

export const PHASE2_UNI_MATS = [
  { job: '剣士', mats: [{ id: 'mat_twilight_blade_shard', name: '黄昏の剣片' }, { id: 'mat_starfield_old_steel', name: '星原の古鋼' }] },
  { job: '重騎士', mats: [{ id: 'mat_silver_castle_core', name: '白銀の城核' }, { id: 'mat_old_furnace_hammer_core', name: '古炉の鎚芯' }] },
  { job: '狩人', mats: [{ id: 'mat_echo_bowstring', name: '残響の弦糸' }, { id: 'mat_moon_arrowhead', name: '月弓の鏃' }] },
  { job: '魔術師', mats: [{ id: 'mat_mist_lantern_stardust', name: '霧灯の星砂' }, { id: 'mat_ash_star_magic_core', name: '灰星の魔核' }] },
  { job: '祈祷師', mats: [{ id: 'mat_lampkeeper_holy_oil', name: '灯守の聖油' }, { id: 'mat_pilgrim_prayer_cloth', name: '巡礼祈祷布' }] },
  { job: '斥候', mats: [{ id: 'mat_ash_mirror_fragment', name: '灰鏡の欠片' }, { id: 'mat_shadowstep_black_thread', name: '影渡りの黒糸' }] },
  { job: '機工師', mats: [{ id: 'mat_deep_furnace_gear', name: '深層炉の歯車' }, { id: 'mat_black_iron_powder_case', name: '黒鉄の火薬筒' }] },
  { job: '格闘士', mats: [{ id: 'mat_black_fox_clawmark', name: '黒狐の爪痕' }, { id: 'mat_ash_fist_bone', name: '灰拳の骨片' }] },
];

export function getSlotDropAnalysis() {
  const db = initAuditDb();
  const areaByItem = buildAreaIndex(db);
  const armor = db.prepare(`
    SELECT i.id, e.slot FROM items i JOIN equipment e ON i.id=e.item_id
    WHERE i.category='equipment' AND e.slot IN ('head','body','arms','legs','feet')
  `).all() as Array<{ id: string; slot: string }>;

  const slots = ['head', 'body', 'arms', 'legs', 'feet'] as const;
  const summary: Record<string, { total: number; pool: number; shop: number; unobtainable: number }> = {};
  const shopByItem = buildShopIndex(db);
  for (const s of slots) summary[s] = { total: 0, pool: 0, shop: 0, unobtainable: 0 };
  for (const a of armor) {
    const s = a.slot as typeof slots[number];
    if (!summary[s]) continue;
    summary[s].total++;
    if (areaByItem.has(a.id)) summary[s].pool++;
    if (shopByItem.has(a.id)) summary[s].shop++;
    if (!areaByItem.has(a.id) && !shopByItem.has(a.id)) summary[s].unobtainable++;
  }
  return { summary, weights: EQUIP_SLOT_WEIGHTS, battleTables: BATTLE_EQUIP_TABLES, normalizeNote: 'arms not in EQUIP_SLOT_WEIGHTS; normalizeSlot maps unknown→weapon' };
}

export function getUnplacedSets() {
  const db = initAuditDb();
  const areaByItem = buildAreaIndex(db);
  const sets = ['set_iron_snow', 'set_valhalla', 'set_black_lamp', 'set_old_king'];
  return sets.map((setId) => {
    const pieces = db.prepare(`
      SELECT i.id, i.name, e.slot, e.defense_bonus, e.hp_bonus FROM items i
      JOIN equipment e ON i.id=e.item_id WHERE e.series_id=?
    `).all(setId) as Array<{ id: string; name: string; slot: string; defense_bonus: number; hp_bonus: number }>;
    const inPool = pieces.filter((p) => areaByItem.has(p.id)).length;
    return { setId, pieces, inPool, total: pieces.length };
  });
}

export {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID, SRC_FORGE_MATERIAL_DROP_RATE,
  REMATCH_MATERIAL_BOSSES, SRC_FARM_MONSTER_IDS, STARTER_WEAPON_IDS, TOWN_NAMES,
};
