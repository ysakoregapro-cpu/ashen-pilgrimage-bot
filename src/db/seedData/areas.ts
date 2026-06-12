import type Database from 'better-sqlite3';

export type AreaDef = { id: string; town: string; name: string; desc: string; min: number; max: number; monsters: string[]; rewards: string[] };

export const AREAS: AreaDef[] = [
  // はじまりの星原
  { id: 'area_star_outskirts', town: 'start_starfield', name: '星原の外れ', desc: '星屑が散らばる平原の外れ。', min: 1, max: 5, monsters: ['mon_star_slime', 'mon_grass_imp'], rewards: ['mat_starfield_grass', 'mat_iron_scrap'] },
  { id: 'area_star_dust_path', town: 'start_starfield', name: '星屑の草道', desc: '星屑を踏む細い道。', min: 2, max: 6, monsters: ['mon_star_slime', 'mon_chip_wolf'], rewards: ['mat_starfield_grass', 'mat_cloth_scrap'] },
  { id: 'area_old_training', town: 'start_starfield', name: '古い訓練場', desc: '忘れられた訓練場。', min: 4, max: 8, monsters: ['mon_training_doll', 'mon_bandit'], rewards: ['wpn_traveler_sword', 'upg_rough_stone'] },
  { id: 'area_night_hill', town: 'start_starfield', name: '夜歩きの丘', desc: '夜だけ現れる影の丘。', min: 6, max: 10, monsters: ['mon_night_shadow', 'mon_star_bat'], rewards: ['wpn_rust_dagger', 'mat_small_mana'] },
  { id: 'area_broken_shrine', town: 'start_starfield', name: '壊れた祠', desc: '崩れた小さな祠。', min: 8, max: 12, monsters: ['mon_night_shadow', 'mon_bandit'], rewards: ['wpn_prayer_rod', 'mat_dry_herb'] },
  // 古道
  { id: 'area_old_cart', town: 'old_road_village', name: '古道の荷車跡', desc: '荷車の残骸。', min: 3, max: 8, monsters: ['mon_bandit', 'mon_grass_imp'], rewards: ['wpn_old_road_knife', 'mat_old_wood'] },
  { id: 'area_rust_inn', town: 'old_road_village', name: '朽ちた旅籠', desc: '朽ちた旅籠の跡。', min: 5, max: 10, monsters: ['mon_bandit', 'mon_chip_wolf'], rewards: ['arm_set_old_road_head', 'mat_cloth_scrap'] },
  { id: 'area_thief_path', town: 'old_road_village', name: '盗賊の抜け道', desc: '盗賊の隠し道。', min: 7, max: 12, monsters: ['mon_bandit', 'mon_night_shadow'], rewards: ['wpn_old_road_dagger', 'mat_beast_fang'] },
  { id: 'area_stone_bridge', town: 'old_road_village', name: '石積みの橋', desc: '古い石橋。', min: 8, max: 14, monsters: ['mon_chip_wolf', 'mon_training_doll'], rewards: ['arm_set_old_road_body', 'upg_rough_stone'] },
  { id: 'area_traveler_grave', town: 'old_road_village', name: '旅人の墓標', desc: '旅人の墓が並ぶ。', min: 10, max: 15, monsters: ['mon_night_shadow', 'mon_bandit'], rewards: ['mat_beast_hide', 'mat_cracked_bone'] },
  // 薄明
  { id: 'area_twilight_coast', town: 'twilight_port', name: '薄明の海岸', desc: '薄明の光が差す海岸。', min: 5, max: 12, monsters: ['mon_wet_gull', 'mon_salt_crab'], rewards: ['mat_twilight_shell', 'wpn_twilight_bow'] },
  { id: 'area_lighthouse_rocks', town: 'twilight_port', name: '灯台下の岩場', desc: '灯台の下の岩場。', min: 8, max: 14, monsters: ['mon_lighthouse_jelly', 'mon_salt_crab'], rewards: ['mat_twilight_shell', 'cons_lamp_bottle'] },
  { id: 'area_sunken_deck', town: 'twilight_port', name: '沈没船の甲板', desc: '沈没船の甲板。', min: 12, max: 18, monsters: ['mon_ship_soldier', 'mon_drift_undead'], rewards: ['wpn_rain_bow', 'mat_iron_scrap'] },
  { id: 'area_tide_cave', town: 'twilight_port', name: '潮騒の洞窟', desc: '潮の音が響く洞窟。', min: 14, max: 20, monsters: ['mon_tide_ghost', 'mon_sea_thief'], rewards: ['arm_set_twilight_head', 'mat_twilight_shell'] },
  { id: 'area_fog_warehouse', town: 'twilight_port', name: '海霧の倉庫街', desc: '霧に包まれた倉庫。', min: 16, max: 22, monsters: ['mon_sea_thief', 'mon_drift_undead'], rewards: ['arm_set_twilight_body', 'cons_rescue_signal'] },
  // 白銀鉱山
  { id: 'area_silver_tunnel', town: 'silver_mine', name: '白銀坑道', desc: '白銀の坑道。', min: 10, max: 18, monsters: ['mon_ore_eater', 'mon_mine_bat'], rewards: ['mat_silver_ore', 'wpn_silver_hammer'] },
  { id: 'area_old_mine', town: 'silver_mine', name: '旧採掘路', desc: '使われなくなった採掘路。', min: 12, max: 20, monsters: ['mon_rust_miner', 'mon_mine_bat'], rewards: ['mat_silver_ore', 'upg_stone'] },
  { id: 'area_crystal_shaft', town: 'silver_mine', name: '結晶の縦穴', desc: '結晶が光る縦穴。', min: 16, max: 24, monsters: ['mon_crystal_spider', 'mon_silver_golem'], rewards: ['arm_set_silver_head', 'mat_small_mana'] },
  { id: 'area_collapsed_site', town: 'silver_mine', name: '崩落した作業場', desc: '崩落した作業場。', min: 18, max: 26, monsters: ['mon_cave_in_bug', 'mon_ore_eater'], rewards: ['arm_set_silver_body', 'upg_stone'] },
  { id: 'area_black_iron_vein', town: 'silver_mine', name: '黒鉄鉱脈', desc: '黒鉄の鉱脈。', min: 20, max: 28, monsters: ['mon_black_iron_guard', 'mon_silver_golem'], rewards: ['wpn_iron_scrap_barrel', 'mat_silver_ore'] },
  // 霧深き森
  { id: 'area_mist_beast_path', town: 'mist_forest', name: '霧深き獣道', desc: '霧に覆われた獣道。', min: 14, max: 22, monsters: ['mon_mist_deer', 'mon_forest_wolf'], rewards: ['mat_mist_leaf', 'wpn_mist_staff'] },
  { id: 'area_poison_path', town: 'mist_forest', name: '毒蔦の小径', desc: '毒蔦が這う小径。', min: 16, max: 24, monsters: ['mon_poison_vine_slime', 'mon_lost_mushroom'], rewards: ['mat_mist_leaf', 'mat_dry_herb'] },
  { id: 'area_old_tree_root', town: 'mist_forest', name: '古樹の根元', desc: '古樹の根元。', min: 20, max: 28, monsters: ['mon_dead_branch', 'mon_tree_guardian'], rewards: ['boss_tree_heart', 'arm_set_mist_head'] },
  { id: 'area_lost_mushroom_field', town: 'mist_forest', name: '迷い茸の群生地', desc: '迷い茸が生える場所。', min: 22, max: 30, monsters: ['mon_lost_mushroom', 'mon_poison_vine_slime'], rewards: ['arm_set_mist_body', 'mat_mist_leaf'] },
  { id: 'area_sleeping_nest', town: 'mist_forest', name: '眠れる獣の巣', desc: '獣王が眠る巣。', min: 28, max: 36, monsters: ['mon_sleeping_beast', 'mon_forest_wolf'], rewards: ['boss_dragon_fang', 'wpn_dragon_fist'] },
  // 雨音
  { id: 'area_rain_alley', town: 'rain_ruins', name: '雨音の路地', desc: '雨音が響く路地。', min: 8, max: 14, monsters: ['mon_grass_imp', 'mon_poison_vine_slime'], rewards: ['arm_set_rain_head', 'wpn_rain_bow'] },
  { id: 'area_flooded_house', town: 'rain_ruins', name: '水没した家屋', desc: '水没した廃屋。', min: 10, max: 16, monsters: ['mon_drift_undead', 'mon_poison_vine_slime'], rewards: ['arm_set_rain_body', 'mat_cloth_scrap'] },
  { id: 'area_rust_well', town: 'rain_ruins', name: '朽ちた井戸', desc: '朽ちた井戸。', min: 12, max: 18, monsters: ['mon_lost_mushroom', 'mon_tide_ghost'], rewards: ['mat_dry_herb', 'upg_rough_stone'] },
  { id: 'area_leaky_chapel', town: 'rain_ruins', name: '雨漏りの礼拝堂', desc: '雨漏りの礼拝堂。', min: 14, max: 20, monsters: ['mon_drift_undead', 'mon_night_shadow'], rewards: ['arm_set_rain_arms', 'cons_lamp_bottle'] },
  { id: 'area_muddy_field', town: 'rain_ruins', name: '泥濘の畑', desc: '泥に沈んだ畑。', min: 16, max: 22, monsters: ['mon_poison_vine_slime', 'mon_forest_wolf'], rewards: ['arm_set_rain_legs', 'mat_starfield_grass'] },
  // 月下図書館
  { id: 'area_forbidden_section', town: 'moon_library', name: '月下図書館・禁書区画', desc: '禁書が眠る区画。', min: 20, max: 30, monsters: ['mon_runaway_book', 'mon_bookworm_swarm'], rewards: ['mat_moon_ink', 'wpn_moon_rod'] },
  { id: 'area_bookworm_corridor', town: 'moon_library', name: '紙魚の回廊', desc: '紙魚の回廊。', min: 22, max: 32, monsters: ['mon_bookworm_swarm', 'mon_ink_beast'], rewards: ['mat_moon_ink', 'wpn_moon_rod'] },
  { id: 'area_record_terminal', town: 'moon_library', name: '記録端末室', desc: '記録端末の室。', min: 26, max: 34, monsters: ['mon_broken_terminal', 'mon_shadow_librarian'], rewards: ['wpn_moon_staff_sr', 'arm_set_moon_head'] },
  { id: 'area_shadow_reading', town: 'moon_library', name: '影写しの閲覧室', desc: '影写しの閲覧室。', min: 28, max: 36, monsters: ['mon_shadow_librarian', 'mon_moon_observer'], rewards: ['arm_set_moon_body', 'mat_moon_ink'] },
  { id: 'area_unanswered_archive', town: 'moon_library', name: '無答の書庫', desc: '答えのない書庫。', min: 34, max: 42, monsters: ['mon_silent_guardian', 'mon_moon_observer'], rewards: ['boss_silent_page', 'wpn_moon_spell_staff'] },
  // 忘却地下市
  { id: 'area_under_path', town: 'forgotten_market', name: '忘却の地下路', desc: '忘却の地下路。', min: 24, max: 34, monsters: ['mon_black_market_thug', 'mon_market_hound'], rewards: ['mat_forgotten_sand', 'wpn_black_lamp_twin'] },
  { id: 'area_black_alley', town: 'forgotten_market', name: '黒市の裏通り', desc: '黒市の裏通り。', min: 26, max: 36, monsters: ['mon_masked_thief', 'mon_deserter'], rewards: ['mat_forgotten_sand', 'wpn_glass_blade'] },
  { id: 'area_cursed_storage', town: 'forgotten_market', name: '呪具置き場', desc: '呪具置き場。', min: 28, max: 38, monsters: ['mon_cursed_tool', 'mon_failed_contract'], rewards: ['wpn_red_ash_axe', 'mat_forgotten_sand'] },
  { id: 'area_contract_cage', town: 'forgotten_market', name: '契約失敗体の檻', desc: '契約失敗体の檻。', min: 32, max: 40, monsters: ['mon_failed_contract', 'mon_black_iron_exec'], rewards: ['boss_black_iron', 'wpn_black_exec_blade'] },
  { id: 'area_masked_warehouse', town: 'forgotten_market', name: '仮面商人の隠し倉庫', desc: '仮面商人の倉庫。', min: 34, max: 42, monsters: ['mon_masked_thief', 'mon_black_market_thug'], rewards: ['wpn_black_exec_sword', 'mat_forgotten_sand'] },
  // 砂時計の都
  { id: 'area_hourglass_ruins', town: 'hourglass_city', name: '砂時計の廃路', desc: '砂時計の廃路。', min: 28, max: 38, monsters: ['mon_old_soldier', 'mon_capital_undead'], rewards: ['mat_hourglass_shard', 'mat_moon_ink'] },
  { id: 'area_time_market', town: 'hourglass_city', name: '時紋の市場跡', desc: '時紋の市場。', min: 30, max: 40, monsters: ['mon_shield_breaker', 'mon_old_soldier'], rewards: ['mat_hourglass_shard', 'upg_fine_stone'] },
  { id: 'area_lost_plaza', town: 'hourglass_city', name: '喪失者の広場', desc: '喪失者の広場。', min: 32, max: 42, monsters: ['mon_capital_undead', 'mon_armor_spider'], rewards: ['mat_hourglass_shard', 'wpn_ash_spear'] },
  { id: 'area_inverted_tower', town: 'hourglass_city', name: '逆さ時計塔', desc: '逆さの時計塔。', min: 34, max: 44, monsters: ['mon_old_mage', 'mon_throne_shadow'], rewards: ['src_star_mark', 'wpn_starfall_spear'] },
  { id: 'area_memory_vault', town: 'hourglass_city', name: '記憶の保管庫', desc: '記憶の保管庫。', min: 36, max: 46, monsters: ['mon_throne_shadow', 'mon_old_mage'], rewards: ['mat_hourglass_shard', 'mat_moon_ink'] },
  // 灰冠王都
  { id: 'area_capital_under', town: 'ash_capital', name: '灰冠の王都地下', desc: '王都の地下。', min: 34, max: 44, monsters: ['mon_old_soldier', 'mon_armor_spider'], rewards: ['mat_ash_crest', 'wpn_ash_knight_sword'] },
  { id: 'area_old_army_post', town: 'ash_capital', name: '旧統治軍詰所', desc: '旧軍の詰所。', min: 36, max: 46, monsters: ['mon_shield_breaker', 'mon_old_mage'], rewards: ['mat_ash_crest', 'arm_set_ash_crown_head'] },
  { id: 'area_broken_throne', town: 'ash_capital', name: '破れた玉座前', desc: '破れた玉座。', min: 40, max: 50, monsters: ['mon_ash_knight', 'mon_throne_shadow'], rewards: ['boss_ash_knight', 'src_ash_star'] },
  { id: 'area_capital_dungeon', town: 'ash_capital', name: '王都地下牢', desc: '王都の地下牢。', min: 38, max: 48, monsters: ['mon_capital_undead', 'mon_armor_spider'], rewards: ['arm_set_ash_crown_body', 'src_old_king_mark'] },
  { id: 'area_ash_boulevard', town: 'ash_capital', name: '灰の大通り', desc: '灰の大通り。', min: 42, max: 52, monsters: ['mon_ash_knight', 'mon_old_soldier'], rewards: ['wpn_ash_knight_sword', 'mat_ash_crest'] },
  // 竜骨峡谷
  { id: 'area_dragon_canyon', town: 'dragonbone_valley', name: '竜骨の峡谷', desc: '竜骨の峡谷。', min: 38, max: 48, monsters: ['mon_forest_wolf', 'mon_crystal_spider'], rewards: ['mat_dragonbone', 'wpn_dragon_pierce'] },
  { id: 'area_bone_market', town: 'dragonbone_valley', name: '大骨市場跡', desc: '骨の市場跡。', min: 40, max: 50, monsters: ['mon_armor_spider', 'mon_cave_in_bug'], rewards: ['mat_dragonbone', 'arm_set_dragonbone_head'] },
  { id: 'area_dragon_cliff', town: 'dragonbone_valley', name: '竜鳴きの崖', desc: '竜鳴きの崖。', min: 42, max: 52, monsters: ['mon_sleeping_beast', 'mon_forest_wolf'], rewards: ['boss_dragon_fang', 'wpn_dragon_fist_sr'] },
  { id: 'area_bone_bird_nest', town: 'dragonbone_valley', name: '骨喰い鳥の巣', desc: '骨喰い鳥の巣。', min: 44, max: 54, monsters: ['mon_crystal_spider', 'mon_cave_in_bug'], rewards: ['arm_set_dragonbone_body', 'mat_dragonbone'] },
  { id: 'area_old_dragon_rift', town: 'dragonbone_valley', name: '古竜の裂け目', desc: '古竜の裂け目。', min: 46, max: 56, monsters: ['mon_sleeping_beast', 'mon_tree_guardian'], rewards: ['wpn_dragon_pierce', 'mat_dragonbone'] },
  // 沈黙修道院
  { id: 'area_silent_corridor', town: 'silent_monastery', name: '沈黙の回廊', desc: '沈黙の回廊。', min: 42, max: 52, monsters: ['mon_drift_undead', 'mon_tide_ghost'], rewards: ['mat_silent_holy', 'src_silence_tune'] },
  { id: 'area_confessional', town: 'silent_monastery', name: '懺悔室', desc: '懺悔室。', min: 44, max: 54, monsters: ['mon_cursed_tool', 'mon_capital_undead'], rewards: ['mat_silent_holy', 'wpn_silence_seal_sr'] },
  { id: 'area_prayer_room', town: 'silent_monastery', name: '祈りの間', desc: '祈りの間。', min: 46, max: 56, monsters: ['mon_silent_guardian', 'mon_tide_ghost'], rewards: ['src_lamp_core', 'arm_set_silence_head'] },
  { id: 'area_holy_workshop', town: 'silent_monastery', name: '聖水工房跡', desc: '聖水工房。', min: 48, max: 58, monsters: ['mon_lost_mushroom', 'mon_drift_undead'], rewards: ['mat_silent_holy', 'cons_pilgrim_charm'] },
  { id: 'area_silent_pilgrim', town: 'silent_monastery', name: '無言の巡礼路', desc: '無言の巡礼路。', min: 50, max: 60, monsters: ['mon_silent_guardian', 'mon_throne_shadow'], rewards: ['wpn_silence_seal_sr', 'src_silence_tune'] },
  // 硝子沼
  { id: 'area_glass_marsh_main', town: 'glass_marsh', name: '硝子沼', desc: '硝子のような沼。', min: 36, max: 46, monsters: ['mon_poison_vine_slime', 'mon_lost_mushroom'], rewards: ['arm_set_glass_head', 'wpn_glass_blade'] },
  { id: 'area_cracked_surface', town: 'glass_marsh', name: '割れた水面', desc: '割れた水面。', min: 38, max: 48, monsters: ['mon_crystal_spider', 'mon_ink_beast'], rewards: ['arm_set_glass_body', 'wpn_glass_blade'] },
  { id: 'area_marsh_shrine', town: 'glass_marsh', name: '沼底の参道', desc: '沼底の参道。', min: 40, max: 50, monsters: ['mon_shadow_librarian', 'mon_poison_vine_slime'], rewards: ['arm_set_glass_arms', 'mat_mist_leaf'] },
  { id: 'area_reflecting_forest', town: 'glass_marsh', name: '反射する森', desc: '反射する森。', min: 42, max: 52, monsters: ['mon_mist_deer', 'mon_lost_mushroom'], rewards: ['arm_set_glass_legs', 'wpn_mist_bow_sr'] },
  { id: 'area_glass_flower', town: 'glass_marsh', name: '硝子花の群生地', desc: '硝子花の群生地。', min: 44, max: 54, monsters: ['mon_crystal_spider', 'mon_ink_beast'], rewards: ['arm_set_glass_feet', 'upg_fine_stone'] },
  // 赤灰砦
  { id: 'area_red_wall', town: 'red_ash_fort', name: '赤灰の外壁', desc: '赤灰の外壁。', min: 40, max: 50, monsters: ['mon_old_soldier', 'mon_shield_breaker'], rewards: ['arm_set_red_ash_head', 'wpn_red_ash_axe_sr'] },
  { id: 'area_burned_barracks', town: 'red_ash_fort', name: '焼けた兵舎', desc: '焼けた兵舎。', min: 42, max: 52, monsters: ['mon_ash_knight', 'mon_deserter'], rewards: ['arm_set_red_ash_body', 'wpn_red_ash_axe'] },
  { id: 'area_fort_storage', town: 'red_ash_fort', name: '砦地下倉庫', desc: '砦の地下倉庫。', min: 44, max: 54, monsters: ['mon_black_iron_guard', 'mon_market_hound'], rewards: ['arm_set_red_ash_arms', 'upg_rare_stone'] },
  { id: 'area_fire_training', town: 'red_ash_fort', name: '炎の訓練場', desc: '炎の訓練場。', min: 46, max: 56, monsters: ['mon_ash_knight', 'mon_black_iron_exec'], rewards: ['arm_set_red_ash_legs', 'wpn_red_ash_axe_sr'] },
  { id: 'area_red_watchtower', town: 'red_ash_fort', name: '赤灰の見張り台', desc: '見張り台。', min: 48, max: 58, monsters: ['mon_shield_breaker', 'mon_old_mage'], rewards: ['arm_set_red_ash_feet', 'mat_ash_crest'] },
  // 深層炉
  { id: 'area_furnace_entrance', town: 'deep_furnace_outpost', name: '深層炉入口', desc: '深層炉の入口。', min: 48, max: 58, monsters: ['mon_core_drone', 'mon_mech_type1'], rewards: ['mat_deep_soot', 'wpn_deep_cannon'] },
  { id: 'area_core_tower', town: 'deep_furnace_outpost', name: '炉心監視塔', desc: '炉心監視塔。', min: 50, max: 60, monsters: ['mon_mech_type2', 'mon_deep_watcher'], rewards: ['mat_deep_soot', 'arm_set_deep_furnace_head'] },
  { id: 'area_mechanic_yard', town: 'deep_furnace_outpost', name: '機工整備場', desc: '機工整備場。', min: 52, max: 62, monsters: ['mon_rampage_mechanic', 'mon_mech_type1'], rewards: ['arm_set_deep_furnace_body', 'wpn_unique_deep'] },
  { id: 'area_arc_lab', town: 'deep_furnace_outpost', name: 'アーク残滓研究所', desc: 'アーク研究所。', min: 54, max: 64, monsters: ['mon_arc_residue', 'mon_deep_watcher'], rewards: ['src_deep_furnace', 'wpn_deep_cannon_regin'] },
  { id: 'area_iron_supply', town: 'deep_furnace_outpost', name: '鉄熱の補給路', desc: '鉄熱の補給路。', min: 56, max: 66, monsters: ['mon_furnace_keeper', 'mon_mech_type2'], rewards: ['boss_furnace_core', 'arm_set_deep_furnace_feet'] },
  // 星落ち観測所
  { id: 'area_starfall_platform', town: 'starfall_observatory', name: '星落ちの観測台', desc: '星落ちの観測台。', min: 52, max: 62, monsters: ['mon_moon_observer', 'mon_arc_residue'], rewards: ['mat_starfall_shard', 'src_star_mark'] },
  { id: 'area_broken_telescope', town: 'starfall_observatory', name: '砕けた望遠塔', desc: '砕けた望遠塔。', min: 54, max: 64, monsters: ['mon_broken_terminal', 'mon_deep_watcher'], rewards: ['mat_starfall_shard', 'wpn_starfall_judge'] },
  { id: 'area_star_lab', town: 'starfall_observatory', name: '星屑の実験室', desc: '星屑の実験室。', min: 56, max: 66, monsters: ['mon_arc_residue', 'mon_lab_failure'], rewards: ['wpn_starfall_judge', 'arm_set_starfall_head'] },
  { id: 'area_astronomy_record', town: 'starfall_observatory', name: '天文記録室', desc: '天文記録室。', min: 58, max: 68, monsters: ['mon_moon_observer', 'mon_sky_mech'], rewards: ['arm_set_starfall_body', 'src_star_mark_full'] },
  { id: 'area_meteor_crater', town: 'starfall_observatory', name: '落星孔', desc: '落星の孔。', min: 60, max: 70, monsters: ['mon_machina_echo', 'mon_old_king_shadow'], rewards: ['mat_starfall_shard', 'wpn_hollow_bell_bow'] },
  // ヴァルハラ
  { id: 'area_valhalla_outer', town: 'valhalla_fortress', name: 'ヴァルハラ外郭', desc: '空中要塞の外郭。', min: 58, max: 68, monsters: ['mon_old_army', 'mon_sky_mech'], rewards: ['raid_valhalla_plate', 'wpn_valhalla_blade'] },
  { id: 'area_mech_hangar', town: 'valhalla_fortress', name: '機械兵格納庫', desc: '機械兵の格納庫。', min: 60, max: 70, monsters: ['mon_mech_type2', 'mon_furnace_defense'], rewards: ['raid_sky_core', 'wpn_core_spear_grau'] },
  { id: 'area_experiment_zone', town: 'valhalla_fortress', name: '実験区画', desc: '実験区画。', min: 62, max: 72, monsters: ['mon_lab_failure', 'mon_arc_residue'], rewards: ['raid_control_chip', 'wpn_deep_cannon_regin'] },
  { id: 'area_old_throne', town: 'valhalla_fortress', name: '旧王の玉座', desc: '旧王の玉座。', min: 64, max: 74, monsters: ['mon_old_king_shadow', 'mon_throne_guard'], rewards: ['raid_old_king_film', 'src_old_king_echo'] },
  { id: 'area_deep_core', town: 'valhalla_fortress', name: '深層炉心', desc: '深層炉心。', min: 66, max: 76, monsters: ['mon_deep_core_boss', 'mon_furnace_defense'], rewards: ['raid_deep_core', 'src_valhalla_core'] },
  { id: 'area_sky_lift', town: 'valhalla_fortress', name: '空塞昇降路', desc: '空塞昇降路。', min: 60, max: 70, monsters: ['mon_sky_mech', 'mon_old_army'], rewards: ['wpn_sky_bow_fress', 'raid_sky_core'] },
  { id: 'area_control_room', town: 'valhalla_fortress', name: '統治軍制御室', desc: '統治軍制御室。', min: 62, max: 72, monsters: ['mon_old_army', 'mon_furnace_defense'], rewards: ['raid_control_chip', 'wpn_zero_shield'] },
  { id: 'area_machina_zone', town: 'valhalla_fortress', name: 'マキナの残響区画', desc: 'マキナの残響。', min: 66, max: 76, monsters: ['mon_machina_echo', 'mon_deep_core_boss'], rewards: ['raid_machina_echo', 'src_machina_core'] },
  // 黒灯りの路地
  { id: 'area_black_lantern_alley', town: 'black_lantern_lane', name: '黒灯りの路地', desc: '黒い灯りだけが灯る路地。', min: 50, max: 58, monsters: ['mon_black_lantern_wraith', 'mon_masked_thief'], rewards: ['mat_forgotten_sand', 'wpn_black_lamp_twin'] },
  { id: 'area_cinder_passage', town: 'black_lantern_lane', name: '煤煙の抜け道', desc: '煤煙に覆われた抜け道。', min: 52, max: 60, monsters: ['mon_black_lantern_wraith', 'mon_cursed_tool'], rewards: ['mat_forgotten_sand', 'acc_black_lamp_ring'] },
];

export function seedExplorationAreas(db: Database.Database): void {
  const ins = db.prepare(`
    INSERT INTO exploration_areas (id, town_id, name, description, recommended_min_level, recommended_max_level, monster_pool_json, reward_pool_json, event_pool_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of AREAS) {
    ins.run(
      a.id, a.town, a.name, a.desc, a.min, a.max,
      JSON.stringify(a.monsters.map((m) => ({ monster_id: m, weight: 10 }))),
      JSON.stringify(a.rewards.map((r) => ({ item_id: r, weight: 10 }))),
      JSON.stringify([
        { type: 'battle', weight: 40 },
        { type: 'material', weight: 25 },
        { type: 'treasure', weight: 15 },
        { type: 'npc_event', weight: 10 },
        { type: 'nothing', weight: 10 },
      ]),
    );
  }
}
