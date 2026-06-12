import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import type { AcquisitionSource } from './equipmentMaster';

const PHASE2_UNI_MATS: Array<{ id: string; name: string; rarity: string; desc: string; source: string }> = [
  { id: 'mat_twilight_blade_shard', name: '黄昏の剣片', rarity: 'SR', desc: '黄昏の剣が残した欠片。カイ伝承に使う。', source: '灰冠系再戦' },
  { id: 'mat_starfield_old_steel', name: '星原の古鋼', rarity: 'SR', desc: '星原に眠る古鋼。カイ伝承に使う。', source: '星原・古道系再戦' },
  { id: 'mat_silver_castle_core', name: '白銀の城核', rarity: 'SR', desc: '白銀の城塞の核。カイ伝承に使う。', source: '白銀鉱山系再戦' },
  { id: 'mat_old_furnace_hammer_core', name: '古炉の鎚芯', rarity: 'SR', desc: '古炉の鎚の芯。カイ伝承に使う。', source: '深層炉系再戦' },
  { id: 'mat_echo_bowstring', name: '残響の弦糸', rarity: 'SR', desc: '弓の残響。カイ伝承に使う。', source: '霧森系再戦' },
  { id: 'mat_moon_arrowhead', name: '月弓の鏃', rarity: 'SR', desc: '月弓の鏃。カイ伝承に使う。', source: '月下観測者再戦' },
  { id: 'mat_mist_lantern_stardust', name: '霧灯の星砂', rarity: 'SR', desc: '霧灯の星砂。カイ伝承に使う。', source: '霧深き森系再戦' },
  { id: 'mat_ash_star_magic_core', name: '灰星の魔核', rarity: 'SR', desc: '灰星の魔核。カイ伝承に使う。', source: '星落ち観測系再戦' },
  { id: 'mat_lampkeeper_holy_oil', name: '灯守の聖油', rarity: 'SR', desc: '灯守の聖油。カイ伝承に使う。', source: '黒灯系再戦' },
  { id: 'mat_pilgrim_prayer_cloth', name: '巡礼祈祷布', rarity: 'SR', desc: '巡礼の祈祷布。カイ伝承に使う。', source: '沈黙修道院系再戦' },
  { id: 'mat_ash_mirror_fragment', name: '灰鏡の欠片', rarity: 'SR', desc: '灰鏡の欠片。カイ伝承に使う。', source: '忘却地下市系再戦' },
  { id: 'mat_shadowstep_black_thread', name: '影渡りの黒糸', rarity: 'SR', desc: '影渡りの糸。カイ伝承に使う。', source: '黒灯系再戦' },
  { id: 'mat_deep_furnace_gear', name: '深層炉の歯車', rarity: 'SR', desc: '深層炉の歯車。カイ伝承に使う。', source: '深層炉系再戦' },
  { id: 'mat_black_iron_powder_case', name: '黒鉄の火薬筒', rarity: 'SR', desc: '黒鉄の火薬筒。カイ伝承に使う。', source: '赤灰・深層炉系再戦' },
  { id: 'mat_black_fox_clawmark', name: '黒狐の爪痕', rarity: 'SSR', desc: '黒狐の爪痕。カイ伝承に使う。', source: '黒灯系再戦' },
  { id: 'mat_ash_fist_bone', name: '灰拳の骨片', rarity: 'SSR', desc: '灰拳の骨片。カイ伝承に使う。', source: '竜骨・赤灰系再戦' },
];

const STARTER_ACQUISITION: Record<string, AcquisitionSource[]> = {
  wpn_traveler_sword: [
    { type: 'start', detail: '剣士初期装備' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材 → 黄昏の古剣' },
  ],
  wpn_training_hammer: [
    { type: 'drop_area', detail: '白銀鉱山街 / 古道の宿場村 探索・店' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_old_bow: [
    { type: 'drop_area', detail: '古道の宿場村 / 霧深き森の集落 探索' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_mist_staff: [
    { type: 'drop_area', detail: '霧深き森の集落 探索' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_prayer_rod: [
    { type: 'drop_area', detail: '薄明の港町 / 古道 探索' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_rust_dagger: [
    { type: 'drop_area', detail: '忘却の地下市 探索' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_mini_cannon: [
    { type: 'drop_area', detail: '白銀鉱山街 / 深層炉前哨基地 探索・店' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
  wpn_leather_gauntlet: [
    { type: 'drop_area', detail: 'はじまりの星原 / 古道の宿場村 探索・店' },
    { type: 'craft', detail: 'カイの昇華：覚醒IV + 職別素材' },
  ],
};

/** area_id → items to merge into reward pool */
const AREA_POOL_ADDITIONS: Record<string, Array<{ item_id: string; weight: number }>> = {
  area_rust_inn: [{ item_id: 'wpn_training_hammer', weight: 6 }, { item_id: 'arm_set_old_road_arms', weight: 8 }],
  area_stone_bridge: [{ item_id: 'wpn_old_bow', weight: 6 }, { item_id: 'arm_set_old_road_legs', weight: 8 }],
  area_star_dust_path: [{ item_id: 'wpn_leather_gauntlet', weight: 8 }, { item_id: 'arm_set_starfield_arms', weight: 6 }],
  area_old_cart: [{ item_id: 'wpn_leather_gauntlet', weight: 6 }, { item_id: 'wpn_training_hammer', weight: 5 }],
  area_mist_beast_path: [{ item_id: 'wpn_old_bow', weight: 8 }],
  area_crystal_shaft: [{ item_id: 'wpn_mini_cannon', weight: 5 }, { item_id: 'arm_set_silver_arms', weight: 6 }],
  area_collapsed_site: [{ item_id: 'wpn_training_hammer', weight: 5 }, { item_id: 'arm_set_silver_legs', weight: 6 }],
  area_mechanic_yard: [{ item_id: 'wpn_mini_cannon', weight: 8 }, { item_id: 'arm_set_deep_furnace_arms', weight: 5 }],
  area_cinder_passage: [
    { item_id: 'arm_set_black_lamp_head', weight: 6 },
    { item_id: 'arm_set_black_lamp_body', weight: 5 },
    { item_id: 'arm_set_black_lamp_arms', weight: 5 },
  ],
  area_black_lantern_alley: [
    { item_id: 'arm_set_black_lamp_legs', weight: 5 },
    { item_id: 'arm_set_black_lamp_feet', weight: 5 },
  ],
  area_broken_throne: [
    { item_id: 'arm_set_old_king_head', weight: 5 },
    { item_id: 'arm_set_old_king_body', weight: 5 },
  ],
  area_ash_boulevard: [
    { item_id: 'arm_set_old_king_arms', weight: 5 },
    { item_id: 'arm_set_old_king_legs', weight: 5 },
    { item_id: 'arm_set_old_king_feet', weight: 4 },
  ],
  area_valhalla_outer: [
    { item_id: 'arm_set_valhalla_head', weight: 4 },
    { item_id: 'arm_set_valhalla_body', weight: 4 },
    { item_id: 'arm_set_valhalla_arms', weight: 4 },
    { item_id: 'arm_set_valhalla_legs', weight: 4 },
    { item_id: 'arm_set_valhalla_feet', weight: 4 },
  ],
  area_deep_core: [
    { item_id: 'arm_set_valhalla_head', weight: 5 },
    { item_id: 'arm_set_valhalla_body', weight: 5 },
  ],
  area_red_watchtower: [
    { item_id: 'arm_set_iron_snow_head', weight: 5 },
    { item_id: 'arm_set_iron_snow_body', weight: 5 },
  ],
  area_fire_training: [
    { item_id: 'arm_set_iron_snow_arms', weight: 5 },
    { item_id: 'arm_set_iron_snow_legs', weight: 5 },
    { item_id: 'arm_set_iron_snow_feet', weight: 4 },
  ],
  area_leaky_chapel: [{ item_id: 'arm_set_rain_feet', weight: 6 }],
  area_muddy_field: [{ item_id: 'arm_set_rain_arms', weight: 6 }],
};

function mergePool(existing: Array<{ item_id: string; weight: number }>, additions: Array<{ item_id: string; weight: number }>) {
  const map = new Map(existing.map((p) => [p.item_id, p.weight]));
  for (const a of additions) {
    map.set(a.item_id, Math.max(map.get(a.item_id) ?? 0, a.weight));
  }
  return [...map.entries()].map(([item_id, weight]) => ({ item_id, weight }));
}

export function ensurePhase2EquipmentRoutes(db: Database.Database): void {
  const ts = nowIso();
  const insMat = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, 'material', ?, ?, ?, 'カイ伝承（職別Uni化）', 0, 0, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, rarity=excluded.rarity, description=excluded.description, source_text=excluded.source_text
  `);
  for (const m of PHASE2_UNI_MATS) {
    insMat.run(m.id, m.name, m.rarity, m.desc, m.source, ts);
  }

  db.prepare(`
    UPDATE items SET usage_text = 'レガシー素材（旧伝承）', source_text = COALESCE(source_text, '旧ボス再戦')
    WHERE id IN ('mat_starfall_obsidian', 'mat_black_lantern_cinder')
  `).run();

  db.prepare(`
    UPDATE items SET source_text = 'ヴァルハラ周回（10%）', usage_text = 'カイSrc変質（×3 + 5000G）'
    WHERE id = 'mat_star_pilgrim_echo'
  `).run();

  const updAcq = db.prepare('UPDATE items SET acquisition_json = ? WHERE id = ?');
  for (const [itemId, sources] of Object.entries(STARTER_ACQUISITION)) {
    updAcq.run(JSON.stringify(sources), itemId);
  }

  const updPool = db.prepare('UPDATE exploration_areas SET reward_pool_json = ? WHERE id = ?');
  for (const [areaId, adds] of Object.entries(AREA_POOL_ADDITIONS)) {
    const row = db.prepare('SELECT reward_pool_json FROM exploration_areas WHERE id = ?').get(areaId) as { reward_pool_json: string } | undefined;
    if (!row) continue;
    const pool = JSON.parse(row.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    updPool.run(JSON.stringify(mergePool(pool, adds)), areaId);
  }
}
