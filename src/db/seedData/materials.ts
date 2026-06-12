import type Database from 'better-sqlite3';
import { nowIso } from '../../types';

type Mat = { id: string; name: string; cat: string; rarity: string; desc: string; source: string; usage: string; price: number; trade?: number };

const MATERIALS: Mat[] = [
  { id: 'mat_iron_scrap', name: '鉄片', cat: 'common_material', rarity: 'N', desc: '錆びた鉄片。', source: '探索・分解', usage: '強化・修理', price: 5 },
  { id: 'mat_old_wood', name: '古材', cat: 'common_material', rarity: 'N', desc: '古い木材。', source: '探索', usage: '強化', price: 5 },
  { id: 'mat_cloth_scrap', name: '布切れ', cat: 'common_material', rarity: 'N', desc: '古い布切れ。', source: '探索・分解', usage: '強化・修理', price: 3 },
  { id: 'mat_beast_fang', name: '獣の牙', cat: 'common_material', rarity: 'N', desc: '獣の牙。', source: '探索', usage: '強化', price: 8 },
  { id: 'mat_beast_hide', name: '獣皮', cat: 'common_material', rarity: 'N', desc: '獣の皮。', source: '探索', usage: '強化', price: 8 },
  { id: 'mat_small_mana', name: '小さな魔石', cat: 'common_material', rarity: 'N', desc: '小さな魔石。', source: '探索', usage: '強化', price: 10 },
  { id: 'mat_dry_herb', name: '乾いた薬草', cat: 'common_material', rarity: 'N', desc: '乾燥した薬草。', source: '探索', usage: '消耗品', price: 5 },
  { id: 'mat_cracked_bone', name: 'ひび割れた骨', cat: 'common_material', rarity: 'N', desc: '古い骨。', source: '探索', usage: '強化', price: 6 },
  { id: 'mat_starfield_grass', name: '星原草', cat: 'area_material', rarity: 'N', desc: '星原の草。', source: 'はじまりの星原', usage: '強化・Src', price: 15 },
  { id: 'mat_twilight_shell', name: '薄明の貝殻', cat: 'area_material', rarity: 'R', desc: '薄明の貝殻。', source: '薄明の港町', usage: '強化', price: 25 },
  { id: 'mat_silver_ore', name: '白銀鉱石', cat: 'area_material', rarity: 'R', desc: '白銀鉱石。', source: '白銀鉱山街', usage: '強化', price: 30 },
  { id: 'mat_mist_leaf', name: '霧守りの葉', cat: 'area_material', rarity: 'R', desc: '霧守りの葉。', source: '霧深き森', usage: '強化', price: 30 },
  { id: 'mat_moon_ink', name: '月下インク', cat: 'area_material', rarity: 'SR', desc: '月下のインク。', source: '月下図書館', usage: '高級装備素材・特殊強化', price: 50 },
  { id: 'mat_forgotten_sand', name: '忘却の黒砂', cat: 'area_material', rarity: 'SR', desc: '忘却の砂。', source: '忘却の地下市', usage: '強化', price: 55 },
  { id: 'mat_hourglass_shard', name: '砂時計の欠片', cat: 'area_material', rarity: 'SR', desc: '時計の欠片。', source: '砂時計の都', usage: 'Src', price: 60 },
  { id: 'mat_ash_crest', name: '灰冠の紋章片', cat: 'area_material', rarity: 'SSR', desc: '灰冠の紋章。', source: '灰冠の王都跡', usage: 'Src強化', price: 100 },
  { id: 'mat_dragonbone', name: '竜骨片', cat: 'area_material', rarity: 'SSR', desc: '竜骨の破片。', source: '竜骨の峡谷', usage: '強化', price: 100 },
  { id: 'mat_silent_holy', name: '沈黙の聖水', cat: 'area_material', rarity: 'SSR', desc: '沈黙の聖水。', source: '沈黙の修道院', usage: 'Src', price: 90 },
  { id: 'mat_deep_soot', name: '深層炉の煤', cat: 'area_material', rarity: 'UR', desc: '深層炉の煤。', source: '深層炉前哨', usage: 'Src強化', price: 150 },
  { id: 'mat_starfall_shard', name: '星落ちの破片', cat: 'area_material', rarity: 'UR', desc: '星の破片。', source: '星落ちの観測所', usage: 'Src強化', price: 160 },
  { id: 'mat_valhalla_plate', name: 'ヴァルハラ装甲片', cat: 'area_material', rarity: 'UR', desc: 'ヴァルハラの装甲片。', source: 'ヴァルハラ', usage: 'Src+10', price: 200 },
  { id: 'dism_rust_iron', name: '錆びた鉄片', cat: 'dismantle_material', rarity: 'N', desc: '分解で得る鉄片。', source: 'N装備分解', usage: '強化', price: 4 },
  { id: 'dism_old_leather', name: '古びた革紐', cat: 'dismantle_material', rarity: 'N', desc: '分解で得る革。', source: 'N装備分解', usage: '強化', price: 4 },
  { id: 'dism_torn_cloth', name: '破れた布片', cat: 'dismantle_material', rarity: 'N', desc: '分解で得る布。', source: 'N装備分解', usage: '強化', price: 3 },
  { id: 'dism_starfield_cloth', name: '星原布片', cat: 'dismantle_material', rarity: 'R', desc: '星原シリーズの布片。', source: '星原装備分解', usage: 'シリーズ継承', price: 20 },
  { id: 'dism_silver_plate', name: '白銀装甲片', cat: 'dismantle_material', rarity: 'R', desc: '白銀シリーズの装甲片。', source: '白銀装備分解', usage: 'シリーズ継承', price: 25 },
  { id: 'dism_mist_thread', name: '霧守りの縫糸', cat: 'dismantle_material', rarity: 'R', desc: '霧守りの糸。', source: '霧守り装備分解', usage: 'シリーズ継承', price: 25 },
  { id: 'dism_moon_fiber', name: '月下繊維', cat: 'dismantle_material', rarity: 'SR', desc: '月下の繊維。', source: '月下装備分解', usage: '強化', price: 40 },
  { id: 'dism_ash_steel', name: '灰冠鋼片', cat: 'dismantle_material', rarity: 'SR', desc: '灰冠の鋼片。', source: '灰冠装備分解', usage: '強化', price: 45 },
  { id: 'dism_deep_core', name: '深層炉心片', cat: 'dismantle_material', rarity: 'SSR', desc: '深層炉心片。', source: '深層炉装備分解', usage: 'Src強化', price: 80 },
  { id: 'dism_old_king', name: '旧王の装甲片', cat: 'dismantle_material', rarity: 'UR', desc: '旧王の装甲片。', source: '旧王装備分解', usage: 'Src+10', price: 120 },
  { id: 'upg_rough_stone', name: '粗い強化石', cat: 'upgrade_stone', rarity: 'N', desc: '粗い強化石。', source: '探索・ショップ', usage: '装備強化', price: 20 },
  { id: 'upg_stone', name: '強化石', cat: 'upgrade_stone', rarity: 'R', desc: '強化石。', source: '探索・ボス', usage: '装備強化', price: 50 },
  { id: 'upg_fine_stone', name: '上質な強化石', cat: 'upgrade_stone', rarity: 'SR', desc: '上質な強化石。', source: 'ボス・レイド', usage: '装備強化', price: 100 },
  { id: 'upg_rare_stone', name: '希少強化石', cat: 'upgrade_stone', rarity: 'SSR', desc: '希少強化石。', source: 'レイド', usage: '装備強化', price: 200 },
  { id: 'upg_old_king_stone', name: '古王の強化石', cat: 'upgrade_stone', rarity: 'UR', desc: '古王の強化石。', source: '高難度ボス', usage: 'UR強化', price: 400 },
  { id: 'upg_deep_core_stone', name: '深層強化核', cat: 'upgrade_stone', rarity: 'UR', desc: '深層強化核。', source: 'ヴァルハラ', usage: 'UR/Src強化', price: 500 },
  { id: 'rep_patch', name: '補修布', cat: 'repair_material', rarity: 'N', desc: '装備補修用。', source: 'ショップ', usage: '修理', price: 15 },
  { id: 'rep_polish', name: '研磨剤', cat: 'repair_material', rarity: 'R', desc: '装備研磨用。', source: '探索', usage: '修理', price: 30 },
  { id: 'rep_oil', name: '鍛冶油', cat: 'repair_material', rarity: 'R', desc: '武器修理用。', source: '鍛冶屋', usage: '修理', price: 35 },
  { id: 'rep_silver_clip', name: '白銀の留め具', cat: 'repair_material', rarity: 'SR', desc: '防具修理用。', source: '白銀鉱山', usage: '修理', price: 60 },
  { id: 'rep_deep_repair', name: '深層修復材', cat: 'repair_material', rarity: 'UR', desc: '深層装備修復。', source: '深層炉', usage: '修理', price: 150 },
  { id: 'boss_tree_heart', name: '古樹の心材', cat: 'boss_material', rarity: 'SR', desc: '古樹の心材。', source: '古樹の番人', usage: 'Src発現', price: 200 },
  { id: 'boss_dragon_fang', name: '竜鳴きの牙', cat: 'boss_material', rarity: 'SSR', desc: '竜の牙。', source: '眠れる獣王', usage: 'Src強化', price: 300 },
  { id: 'boss_ash_knight', name: '灰冠騎士の紋章', cat: 'boss_material', rarity: 'SSR', desc: '灰冠騎士の紋章。', source: '灰冠騎士', usage: 'Src', price: 350 },
  { id: 'boss_black_iron', name: '黒鉄処刑人の鎖', cat: 'boss_material', rarity: 'SSR', desc: '黒鉄の鎖。', source: '黒鉄処刑人', usage: 'Src', price: 350 },
  { id: 'boss_furnace_core', name: '炉熱の番人核', cat: 'boss_material', rarity: 'UR', desc: '炉熱の核。', source: '炉熱の番人', usage: 'Src+7', price: 500 },
  { id: 'mat_star_pilgrim_echo', name: '星巡の残響', cat: 'boss_material', rarity: 'UR', desc: 'ヴァルハラ周回が残す、巡礼の残響。カイのSrc変質に使う。', source: 'ヴァルハラ周回（低確率）', usage: 'カイSrc変質', price: 0, trade: 0 },
  { id: 'mat_starfall_obsidian', name: '星見の残光', cat: 'boss_material', rarity: 'SSR', desc: '星落ちの観測者が残す核片。カイの伝承に使う。', source: '月下の観測者（再戦・低確率）', usage: 'カイ伝承', price: 0, trade: 0 },
  { id: 'mat_black_lantern_cinder', name: '黒灯の残滓', cat: 'boss_material', rarity: 'SSR', desc: '黒灯の残影が残す煤核。カイの伝承に使う。', source: '黒灯の残影（再戦・低確率）', usage: 'カイ伝承', price: 0, trade: 0 },
  { id: 'boss_silent_page', name: '無答の守護者の頁', cat: 'boss_material', rarity: 'UR', desc: '禁書の頁。', source: '無答の守護者', usage: 'Src', price: 500 },
  { id: 'raid_valhalla_plate', name: 'ヴァルハラ装甲片', cat: 'raid_material', rarity: 'UR', desc: 'レイド報酬。', source: 'ヴァルハラレイド', usage: 'Src+10', price: 400, trade: 1 },
  { id: 'raid_sky_core', name: '空塞機兵の中枢', cat: 'raid_material', rarity: 'UR', desc: '空塞機兵の中枢。', source: 'ヴァルハラレイド', usage: 'Src強化', price: 450, trade: 1 },
  { id: 'raid_furnace_unit', name: '炉心防衛ユニット核', cat: 'raid_material', rarity: 'UR', desc: '炉心防衛核。', source: '深層炉心', usage: 'Src+10', price: 500, trade: 1 },
  { id: 'raid_control_chip', name: '旧統治軍制御片', cat: 'raid_material', rarity: 'UR', desc: '制御片。', source: 'ヴァルハラ', usage: 'Src', price: 400, trade: 1 },
  { id: 'raid_deep_core', name: '深層炉心核片', cat: 'raid_material', rarity: 'UR', desc: '炉心核片。', source: '深層炉心', usage: 'Src+10', price: 550, trade: 1 },
  { id: 'raid_machina_echo', name: 'マキナの残響片', cat: 'raid_material', rarity: 'UR', desc: 'マキナ残響。', source: 'マキナ区画', usage: 'Src+10', price: 550, trade: 1 },
  { id: 'raid_old_king_film', name: '旧王の影片', cat: 'raid_material', rarity: 'UR', desc: '旧王の影片。', source: '旧王の玉座', usage: 'Src+10', price: 600, trade: 1 },
  { id: 'src_primordial', name: '原初刻印の欠片', cat: 'src_core', rarity: 'SSR', desc: 'Src発現素材。', source: '高難度クエスト', usage: 'Src発現', price: 800, trade: 1 },
  { id: 'src_star_mark', name: '星印の欠片', cat: 'src_core', rarity: 'SSR', desc: 'Src発現素材。', source: '星落ち観測所', usage: 'Src発現', price: 800, trade: 1 },
  { id: 'src_ash_star', name: '灰星結晶', cat: 'src_core', rarity: 'UR', desc: '灰星結晶。', source: '灰冠・レイド', usage: 'Src発現', price: 1000, trade: 1 },
  { id: 'src_echo_core', name: '残響核', cat: 'src_core', rarity: 'SSR', desc: '残響核。', source: '月下図書館', usage: 'Src発現', price: 750, trade: 1 },
  { id: 'src_lamp_core', name: '灯火核', cat: 'src_core', rarity: 'SSR', desc: '灯火核。', source: '薄明・救難', usage: 'Src発現', price: 750, trade: 1 },
  { id: 'src_deep_furnace', name: '深層炉核', cat: 'src_core', rarity: 'UR', desc: '深層炉核。', source: '深層炉', usage: 'Src発現', price: 1000, trade: 1 },
  { id: 'src_old_king_mark', name: '古王の印', cat: 'src_core', rarity: 'UR', desc: '古王の印。', source: '灰冠王都', usage: 'Src発現', price: 1000, trade: 1 },
  { id: 'src_mirror_shard', name: '灰鏡片', cat: 'src_core', rarity: 'UR', desc: '灰鏡片。', source: '灰鏡の間', usage: 'Src発現', price: 900, trade: 1 },
  { id: 'src_bind_thread', name: '繋ぎ糸の断片', cat: 'src_core', rarity: 'SR', desc: '繋ぎ糸断片。', source: '救難・ユイ', usage: 'Src発現', price: 600, trade: 1 },
  { id: 'src_silence_tune', name: '静寂の調律片', cat: 'src_core', rarity: 'SSR', desc: '調律片。', source: '沈黙修道院', usage: 'Src発現', price: 800, trade: 1 },
  { id: 'src_upg_shard', name: 'Src強化片', cat: 'src_upgrade_material', rarity: 'SR', desc: 'Src+1〜3用。', source: '探索・分解', usage: 'Src強化', price: 300, trade: 1 },
  { id: 'src_upg_core', name: 'Src強化核', cat: 'src_upgrade_material', rarity: 'SSR', desc: 'Src+4〜6用。', source: 'ボス・レイド', usage: 'Src強化', price: 600, trade: 1 },
  { id: 'src_star_scar_crystal', name: '星痕結晶', cat: 'src_upgrade_material', rarity: 'UR', desc: 'Src+7〜9用。', source: 'レイド', usage: 'Src強化', price: 900, trade: 1 },
  { id: 'src_mirror_crystal', name: '灰鏡結晶', cat: 'src_upgrade_material', rarity: 'UR', desc: 'Src+7〜9用。', source: '灰鏡', usage: 'Src強化', price: 900, trade: 1 },
  { id: 'src_deep_crystal', name: '深層炉心結晶', cat: 'src_upgrade_material', rarity: 'UR', desc: 'Src+7〜9用。', source: '深層炉', usage: 'Src強化', price: 950, trade: 1 },
  { id: 'src_valhalla_core', name: 'ヴァルハラ炉心核', cat: 'src_upgrade_material', rarity: 'Src', desc: 'Src+10用。', source: 'ヴァルハラ深層', usage: 'Src+10', price: 2000, trade: 1 },
  { id: 'src_old_king_echo', name: '旧王の残響核', cat: 'src_upgrade_material', rarity: 'Src', desc: 'Src+10用。', source: '旧王の玉座', usage: 'Src+10', price: 2000, trade: 1 },
  { id: 'src_machina_core', name: 'マキナ残響核', cat: 'src_upgrade_material', rarity: 'Src', desc: 'Src+10用。', source: 'マキナ区画', usage: 'Src+10', price: 2000, trade: 1 },
  { id: 'src_primordial_full', name: '原初刻印', cat: 'src_upgrade_material', rarity: 'Src', desc: 'Src+10用。', source: '砂時計の都', usage: 'Src+10', price: 2500, trade: 1 },
  { id: 'src_star_mark_full', name: '完全な星印', cat: 'src_upgrade_material', rarity: 'Src', desc: 'Src+10用。', source: '星落ち・週次', usage: 'Src+10', price: 2500, trade: 1 },
  { id: 'cons_lamp_bottle', name: '灯火の小瓶', cat: 'consumable', rarity: 'R', desc: '戦闘中HP30%で1回復活。', source: '薄明の港・ショップ', usage: '戦闘復活', price: 200 },
  { id: 'cons_pilgrim_charm', name: '巡礼者の護符', cat: 'consumable', rarity: 'SR', desc: '敗北時の所持金ロスト防止。', source: '祈りの丘', usage: '敗北保護', price: 500 },
  { id: 'cons_rescue_signal', name: '救難信号片', cat: 'consumable', rarity: 'R', desc: '救難要請を即時投稿。', source: '薄明の港', usage: '救難', price: 150 },
];

export function seedMaterials(db: Database.Database, ts: string): void {
  const ins = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of MATERIALS) {
    ins.run(m.id, m.name, m.cat, m.rarity, m.desc, m.source, m.usage, m.price, m.trade ?? 1, ts);
  }
}

/** Idempotent upsert for new/changed materials on existing DBs */
export function ensureMaterialsSeed(db: Database.Database): void {
  const ts = nowIso();
  const upsert = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      rarity = excluded.rarity,
      description = excluded.description,
      source_text = excluded.source_text,
      usage_text = excluded.usage_text,
      sell_price = excluded.sell_price,
      tradeable = excluded.tradeable
  `);
  for (const m of MATERIALS) {
    upsert.run(m.id, m.name, m.cat, m.rarity, m.desc, m.source, m.usage, m.price, m.trade ?? 1, ts);
  }
}
