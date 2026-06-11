import type Database from 'better-sqlite3';

type Mon = { id: string; name: string; tag: string; lv: number; hp: number; atk: number; mag: number; def: number; spd: number; exp: number; gold: number; drops?: string[]; boss?: boolean };

function mons(list: Mon[]): Mon[] { return list; }

const MONSTERS = mons([
  // 星原
  { id: 'mon_star_slime', name: '星原スライム', tag: 'starfield', lv: 1, hp: 40, atk: 6, mag: 4, def: 3, spd: 5, exp: 8, gold: 5 },
  { id: 'mon_chip_wolf', name: '欠け角ウルフ', tag: 'starfield', lv: 3, hp: 55, atk: 10, mag: 2, def: 5, spd: 8, exp: 12, gold: 8 },
  { id: 'mon_grass_imp', name: '草陰の小鬼', tag: 'starfield', lv: 2, hp: 35, atk: 8, mag: 6, def: 2, spd: 10, exp: 10, gold: 6 },
  { id: 'mon_star_bat', name: '星屑コウモリ', tag: 'starfield', lv: 4, hp: 45, atk: 9, mag: 5, def: 4, spd: 12, exp: 14, gold: 7 },
  { id: 'mon_bandit', name: '野盗見習い', tag: 'starfield', lv: 5, hp: 60, atk: 12, mag: 2, def: 6, spd: 9, exp: 16, gold: 12 },
  { id: 'mon_training_doll', name: '古びた訓練人形', tag: 'starfield', lv: 6, hp: 70, atk: 11, mag: 0, def: 10, spd: 5, exp: 18, gold: 10 },
  { id: 'mon_night_shadow', name: '夜歩きの影', tag: 'starfield', lv: 8, hp: 65, atk: 14, mag: 8, def: 5, spd: 14, exp: 22, gold: 15 },
  // 港町
  { id: 'mon_wet_gull', name: '濡れ羽ガル', tag: 'port', lv: 6, hp: 50, atk: 10, mag: 4, def: 4, spd: 11, exp: 15, gold: 8 },
  { id: 'mon_salt_crab', name: '塩喰い蟹', tag: 'port', lv: 8, hp: 80, atk: 12, mag: 0, def: 12, spd: 4, exp: 18, gold: 10 },
  { id: 'mon_drift_undead', name: '漂流亡者', tag: 'port', lv: 10, hp: 90, atk: 14, mag: 10, def: 6, spd: 6, exp: 22, gold: 14 },
  { id: 'mon_lighthouse_jelly', name: '灯台クラゲ', tag: 'port', lv: 12, hp: 75, atk: 8, mag: 16, def: 5, spd: 8, exp: 24, gold: 12 },
  { id: 'mon_sea_thief', name: '海霧の盗賊', tag: 'port', lv: 14, hp: 95, atk: 18, mag: 4, def: 8, spd: 12, exp: 28, gold: 20 },
  { id: 'mon_ship_soldier', name: '沈没船の甲板兵', tag: 'port', lv: 16, hp: 110, atk: 20, mag: 0, def: 14, spd: 8, exp: 32, gold: 18 },
  { id: 'mon_tide_ghost', name: '潮騒の怨霊', tag: 'port', lv: 18, hp: 100, atk: 12, mag: 22, def: 8, spd: 10, exp: 35, gold: 22 },
  // 鉱山
  { id: 'mon_ore_eater', name: '鉱石喰らい', tag: 'mine', lv: 12, hp: 100, atk: 16, mag: 0, def: 14, spd: 5, exp: 26, gold: 15 },
  { id: 'mon_silver_golem', name: '白銀ゴーレム', tag: 'mine', lv: 16, hp: 140, atk: 18, mag: 8, def: 20, spd: 4, exp: 34, gold: 25 },
  { id: 'mon_mine_bat', name: '坑道コウモリ', tag: 'mine', lv: 14, hp: 80, atk: 14, mag: 6, def: 6, spd: 16, exp: 28, gold: 12 },
  { id: 'mon_rust_miner', name: '錆びた採掘機', tag: 'mine', lv: 18, hp: 130, atk: 20, mag: 4, def: 16, spd: 6, exp: 36, gold: 20 },
  { id: 'mon_cave_in_bug', name: '落盤虫', tag: 'mine', lv: 20, hp: 120, atk: 22, mag: 0, def: 18, spd: 8, exp: 38, gold: 18 },
  { id: 'mon_black_iron_guard', name: '黒鉄の番兵', tag: 'mine', lv: 22, hp: 150, atk: 24, mag: 6, def: 22, spd: 7, exp: 42, gold: 28 },
  { id: 'mon_crystal_spider', name: '結晶蜘蛛', tag: 'mine', lv: 24, hp: 110, atk: 20, mag: 14, def: 12, spd: 14, exp: 44, gold: 24 },
  // 森
  { id: 'mon_mist_deer', name: '霧鹿', tag: 'forest', lv: 16, hp: 100, atk: 14, mag: 8, def: 10, spd: 16, exp: 30, gold: 16 },
  { id: 'mon_poison_vine_slime', name: '毒蔦スライム', tag: 'forest', lv: 18, hp: 120, atk: 12, mag: 16, def: 8, spd: 6, exp: 34, gold: 14 },
  { id: 'mon_lost_mushroom', name: '迷い茸', tag: 'forest', lv: 20, hp: 90, atk: 10, mag: 20, def: 6, spd: 8, exp: 36, gold: 18 },
  { id: 'mon_dead_branch', name: '枯れ枝の従者', tag: 'forest', lv: 22, hp: 130, atk: 18, mag: 12, def: 14, spd: 10, exp: 40, gold: 20 },
  { id: 'mon_forest_wolf', name: '森喰い狼', tag: 'forest', lv: 24, hp: 140, atk: 26, mag: 0, def: 12, spd: 18, exp: 44, gold: 22 },
  { id: 'mon_tree_guardian', name: '古樹の番人', tag: 'forest', lv: 28, hp: 220, atk: 28, mag: 16, def: 24, spd: 8, exp: 80, gold: 50, boss: true },
  { id: 'mon_sleeping_beast', name: '眠れる獣王', tag: 'forest', lv: 32, hp: 350, atk: 32, mag: 20, def: 28, spd: 12, exp: 120, gold: 80, boss: true },
  // 図書館
  { id: 'mon_bookworm_swarm', name: '紙魚の群れ', tag: 'library', lv: 22, hp: 80, atk: 10, mag: 14, def: 4, spd: 14, exp: 38, gold: 18 },
  { id: 'mon_runaway_book', name: '走る禁書', tag: 'library', lv: 24, hp: 100, atk: 12, mag: 22, def: 8, spd: 16, exp: 42, gold: 22 },
  { id: 'mon_ink_beast', name: 'インクの魔物', tag: 'library', lv: 26, hp: 120, atk: 14, mag: 26, def: 10, spd: 10, exp: 46, gold: 24 },
  { id: 'mon_broken_terminal', name: '壊れた記録端末', tag: 'library', lv: 28, hp: 150, atk: 18, mag: 20, def: 16, spd: 8, exp: 50, gold: 26 },
  { id: 'mon_shadow_librarian', name: '影写しの司書', tag: 'library', lv: 30, hp: 130, atk: 16, mag: 28, def: 12, spd: 14, exp: 54, gold: 28 },
  { id: 'mon_moon_observer', name: '月下の観測者', tag: 'library', lv: 32, hp: 160, atk: 20, mag: 30, def: 14, spd: 12, exp: 58, gold: 30 },
  { id: 'mon_silent_guardian', name: '無答の守護者', tag: 'library', lv: 38, hp: 400, atk: 30, mag: 36, def: 26, spd: 10, exp: 150, gold: 100, boss: true },
  // 地下市
  { id: 'mon_black_market_thug', name: '黒市の用心棒', tag: 'undermarket', lv: 28, hp: 160, atk: 28, mag: 4, def: 16, spd: 12, exp: 52, gold: 35 },
  { id: 'mon_cursed_tool', name: '呪具憑き', tag: 'undermarket', lv: 30, hp: 140, atk: 16, mag: 30, def: 12, spd: 10, exp: 56, gold: 32 },
  { id: 'mon_masked_thief', name: '仮面盗賊', tag: 'undermarket', lv: 32, hp: 130, atk: 32, mag: 8, def: 10, spd: 20, exp: 60, gold: 40 },
  { id: 'mon_deserter', name: '逃亡兵', tag: 'undermarket', lv: 34, hp: 170, atk: 30, mag: 6, def: 20, spd: 10, exp: 64, gold: 38 },
  { id: 'mon_black_iron_exec', name: '黒鉄処刑人', tag: 'undermarket', lv: 38, hp: 280, atk: 36, mag: 12, def: 24, spd: 8, exp: 100, gold: 70, boss: true },
  { id: 'mon_failed_contract', name: '契約失敗体', tag: 'undermarket', lv: 36, hp: 200, atk: 24, mag: 28, def: 18, spd: 8, exp: 72, gold: 45 },
  { id: 'mon_market_hound', name: '地下市の番犬', tag: 'undermarket', lv: 34, hp: 180, atk: 34, mag: 0, def: 16, spd: 16, exp: 66, gold: 36 },
  // 王都
  { id: 'mon_old_soldier', name: '古王兵', tag: 'capital', lv: 36, hp: 200, atk: 32, mag: 8, def: 24, spd: 10, exp: 70, gold: 45 },
  { id: 'mon_ash_knight', name: '灰冠騎士', tag: 'capital', lv: 40, hp: 280, atk: 36, mag: 12, def: 30, spd: 8, exp: 110, gold: 75, boss: true },
  { id: 'mon_capital_undead', name: '王都亡者', tag: 'capital', lv: 38, hp: 220, atk: 28, mag: 24, def: 18, spd: 8, exp: 78, gold: 50 },
  { id: 'mon_shield_breaker', name: '破盾兵', tag: 'capital', lv: 40, hp: 240, atk: 38, mag: 0, def: 20, spd: 12, exp: 82, gold: 52 },
  { id: 'mon_armor_spider', name: '鎧蜘蛛', tag: 'capital', lv: 42, hp: 260, atk: 34, mag: 16, def: 28, spd: 14, exp: 86, gold: 55 },
  { id: 'mon_old_mage', name: '旧統治軍魔導士', tag: 'capital', lv: 44, hp: 200, atk: 16, mag: 42, def: 16, spd: 10, exp: 90, gold: 58 },
  { id: 'mon_throne_shadow', name: '玉座の残影', tag: 'capital', lv: 48, hp: 350, atk: 40, mag: 40, def: 26, spd: 12, exp: 130, gold: 90, boss: true },
  // 深層炉
  { id: 'mon_core_drone', name: '炉心ドローン', tag: 'furnace', lv: 48, hp: 200, atk: 30, mag: 20, def: 20, spd: 16, exp: 95, gold: 60 },
  { id: 'mon_mech_type1', name: '機械兵Type-I', tag: 'furnace', lv: 50, hp: 260, atk: 36, mag: 8, def: 32, spd: 8, exp: 100, gold: 65 },
  { id: 'mon_mech_type2', name: '機械兵Type-II', tag: 'furnace', lv: 52, hp: 280, atk: 40, mag: 12, def: 34, spd: 10, exp: 105, gold: 68 },
  { id: 'mon_rampage_mechanic', name: '暴走整備機', tag: 'furnace', lv: 54, hp: 300, atk: 42, mag: 6, def: 30, spd: 12, exp: 110, gold: 70 },
  { id: 'mon_arc_residue', name: 'アーク残滓体', tag: 'furnace', lv: 56, hp: 250, atk: 28, mag: 38, def: 22, spd: 14, exp: 115, gold: 72 },
  { id: 'mon_furnace_keeper', name: '炉熱の番人', tag: 'furnace', lv: 58, hp: 450, atk: 44, mag: 30, def: 36, spd: 8, exp: 160, gold: 110, boss: true },
  { id: 'mon_deep_watcher', name: '深層監視者', tag: 'furnace', lv: 60, hp: 320, atk: 38, mag: 34, def: 28, spd: 12, exp: 120, gold: 78 },
  // ヴァルハラ
  { id: 'mon_old_army', name: '旧統治軍制式兵', tag: 'valhalla', lv: 58, hp: 320, atk: 42, mag: 10, def: 34, spd: 10, exp: 125, gold: 80 },
  { id: 'mon_sky_mech', name: '空塞機兵', tag: 'valhalla', lv: 60, hp: 340, atk: 44, mag: 16, def: 36, spd: 12, exp: 130, gold: 85 },
  { id: 'mon_lab_failure', name: '実験区画の失敗体', tag: 'valhalla', lv: 62, hp: 300, atk: 36, mag: 40, def: 24, spd: 14, exp: 135, gold: 88 },
  { id: 'mon_furnace_defense', name: '炉心防衛ユニット', tag: 'valhalla', lv: 64, hp: 400, atk: 46, mag: 20, def: 40, spd: 8, exp: 140, gold: 92 },
  { id: 'mon_throne_guard', name: '玉座の守護機', tag: 'valhalla', lv: 66, hp: 420, atk: 48, mag: 24, def: 42, spd: 8, exp: 145, gold: 95 },
  { id: 'mon_machina_echo', name: 'マキナの残響', tag: 'valhalla', lv: 68, hp: 500, atk: 50, mag: 44, def: 36, spd: 14, exp: 200, gold: 130, boss: true },
  { id: 'mon_old_king_shadow', name: '旧王の影', tag: 'valhalla', lv: 70, hp: 550, atk: 52, mag: 48, def: 38, spd: 12, exp: 220, gold: 150, boss: true },
  { id: 'mon_deep_core_boss', name: '深層炉心核', tag: 'valhalla', lv: 72, hp: 600, atk: 54, mag: 50, def: 44, spd: 10, exp: 250, gold: 180, boss: true },
]);

export function seedMonsters(db: Database.Database): void {
  const ins = db.prepare(`
    INSERT INTO monsters (id, name, area_tag, level, hp, mp, attack, magic, defense, spirit, speed, break_max, element, drop_pool_json, exp_reward, gold_reward, ai_pattern_json)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of MONSTERS) {
    const drops = m.drops ?? ['mat_iron_scrap', 'mat_cloth_scrap', 'upg_rough_stone'];
    ins.run(
      m.id, m.name, m.tag, m.lv, m.hp, m.atk, m.mag, m.def, Math.floor(m.def * 0.8), m.spd,
      m.boss ? 150 : 100, null,
      JSON.stringify(drops.map((d) => ({ item_id: d, weight: 10 }))),
      m.exp, m.gold,
      JSON.stringify({ pattern: m.boss ? 'boss' : 'normal', poison_chance: m.tag === 'forest' ? 0.15 : 0.05 }),
    );
  }
}
