import type Database from 'better-sqlite3';

const TOWNS = [
  { id: 'start_starfield', name: 'はじまりの星原', desc: '灰の下に星屑が眠る、旅の始まりの平原。', level: 1, defaultUnlock: 1 },
  { id: 'twilight_port', name: '薄明の港町', desc: '灯台の光が霧を割る、潮騒の港。', level: 5, defaultUnlock: 0 },
  { id: 'silver_mine', name: '白銀鉱山街', desc: '白銀の坑道が街を支える鉱山の集落。', level: 10, defaultUnlock: 0 },
  { id: 'mist_forest', name: '霧深き森の集落', desc: '霧に包まれた古木の森の奥。', level: 15, defaultUnlock: 0 },
  { id: 'moon_library', name: '月下図書館', desc: '記録と禁書が眠る、月の光の図書館。', level: 20, defaultUnlock: 0 },
  { id: 'forgotten_market', name: '忘却の地下市', desc: '忘れられた契約が取引される闇市。', level: 25, defaultUnlock: 0 },
  { id: 'hourglass_city', name: '砂時計の都', desc: '時間の記憶が錯綜する廃都。', level: 30, defaultUnlock: 0 },
  { id: 'ash_capital', name: '灰冠の王都跡', desc: '灰に覆われた旧王都の廃墟。', level: 35, defaultUnlock: 0 },
  { id: 'dragonbone_valley', name: '竜骨の峡谷', desc: '巨大な骨が空を架ける峡谷。', level: 40, defaultUnlock: 0 },
  { id: 'silent_monastery', name: '沈黙の修道院', desc: '言葉を失った祈りの場所。', level: 45, defaultUnlock: 0 },
  { id: 'deep_furnace_outpost', name: '深層炉前哨基地', desc: '深層炉を監視する前線基地。', level: 50, defaultUnlock: 0 },
  { id: 'old_road_village', name: '古道の宿場村', desc: '旅人の休息地、古い街道の宿場。', level: 3, defaultUnlock: 1 },
  { id: 'rain_ruins', name: '雨音の廃村', desc: '雨音だけが残る廃村。', level: 8, defaultUnlock: 0 },
  { id: 'hollow_bell_town', name: '空鐘の町', desc: '鐘の音だけが響く、人のいない町。', level: 18, defaultUnlock: 0 },
  { id: 'glass_marsh', name: '硝子沼の集落', desc: '硝子のように割れた水面の沼地。', level: 38, defaultUnlock: 0 },
  { id: 'red_ash_fort', name: '赤灰の砦', desc: '炎と灰に焼かれた旧砦。', level: 42, defaultUnlock: 0 },
  { id: 'prayer_hill', name: '祈りの丘', desc: '巡礼者の祈りが積もる丘。', level: 12, defaultUnlock: 0 },
  { id: 'iron_snow_post', name: '鉄雪の関所', desc: '鉄と雪に覆われた関所。', level: 48, defaultUnlock: 0 },
  { id: 'black_lantern_lane', name: '黒灯りの路地', desc: '黒い灯りだけが灯る路地。', level: 52, defaultUnlock: 0 },
  { id: 'buried_aqueduct', name: '埋没水路', desc: '地中に沈んだ古い水路。', level: 22, defaultUnlock: 0 },
  { id: 'starfall_observatory', name: '星落ちの観測所', desc: '星の軌跡を記録する観測所。', level: 55, defaultUnlock: 0 },
  { id: 'valhalla_fortress', name: '空中要塞ヴァルハラ', desc: '雲の上に浮かぶ最終要塞。', level: 60, defaultUnlock: 0 },
];

const NPCS: { id: string; town: string; name: string; role: string; desc: string; services?: string[] }[] = [
  { id: 'npc_aoi', town: 'start_starfield', name: 'アオイ', role: '導き手', desc: '冒険者登録と旅の導きを担う。', services: ['register', 'guide'] },
  { id: 'npc_yui', town: 'twilight_port', name: 'ユイ', role: '支援', desc: '回復、救難、支援を行う。', services: ['heal', 'rescue', 'support'] },
  { id: 'npc_kai', town: 'silver_mine', name: 'カイ', role: '鍛冶', desc: '鍛冶、強化、Src派生を担当。', services: ['forge', 'upgrade', 'src'] },
  { id: 'npc_ren', town: 'mist_forest', name: 'レン', role: '守護', desc: '守護、素材、耐性の指南。', services: ['guard', 'materials'] },
  { id: 'npc_shizuku', town: 'moon_library', name: 'シズク', role: '司書', desc: '図鑑、解析、スキル研究。', services: ['codex', 'analyze', 'skill'] },
  { id: 'npc_jin', town: 'forgotten_market', name: 'ジン', role: '闇商人', desc: '闇市、危険合成、隠しジョブ。', services: ['black_market', 'synthesis'] },
  { id: 'npc_krat', town: 'hourglass_city', name: 'クラト', role: '記録者', desc: '記憶、分岐、特殊条件。', services: ['memory', 'branch'] },
  { id: 'npc_rina', town: 'start_starfield', name: '宿屋の受付リナ', role: '宿屋', desc: '休息と情報を提供。', services: ['rest'] },
  { id: 'npc_toma', town: 'start_starfield', name: '記録係トマ', role: '記録', desc: '冒険記録を保管。', services: ['log'] },
  { id: 'npc_seria', town: 'twilight_port', name: '灯台守セリア', role: '灯台守', desc: '灯台の光を守る。', services: ['light'] },
  { id: 'npc_balt', town: 'twilight_port', name: '船頭バルト', role: '船頭', desc: '港の船を管理。', services: ['ferry'] },
  { id: 'npc_gren', town: 'silver_mine', name: '鍛冶師グレン', role: '鍛冶師', desc: '白銀の鍛冶を担当。', services: ['forge'] },
  { id: 'npc_oruga', town: 'silver_mine', name: '防具職人オルガ', role: '防具職人', desc: '防具の修理と製作。', services: ['armor'] },
  { id: 'npc_noa', town: 'mist_forest', name: '薬師ノア', role: '薬師', desc: '薬草と回復薬。', services: ['potion'] },
  { id: 'npc_tree_witness', town: 'mist_forest', name: '古樹の証人', role: '証人', desc: '古樹の記憶を語る。', services: ['quest'] },
  { id: 'npc_elis', town: 'moon_library', name: '司書エリス', role: '司書', desc: '禁書区画の管理。', services: ['library'] },
  { id: 'npc_doc_witness', town: 'moon_library', name: '古文書の証人', role: '証人', desc: '古文書の解読。', services: ['quest'] },
  { id: 'npc_ver', town: 'forgotten_market', name: '闇商人ヴェル', role: '商人', desc: '禁断の品を扱う。', services: ['shop'] },
  { id: 'npc_nameless', town: 'forgotten_market', name: '証人なき証人', role: '証人', desc: '名を忘れた証人。', services: ['quest'] },
  { id: 'npc_rem', town: 'hourglass_city', name: '時計技師レム', role: '技師', desc: '時計の修理。', services: ['clock'] },
  { id: 'npc_old_witness', town: 'hourglass_city', name: '古い証人', role: '証人', desc: '古い記憶の証人。', services: ['quest'] },
  { id: 'npc_capital_witness', town: 'ash_capital', name: '王都の証人', role: '証人', desc: '王都の歴史を語る。', services: ['quest'] },
  { id: 'npc_furnace_witness', town: 'deep_furnace_outpost', name: '炉の証人', role: '証人', desc: '深層炉の記録。', services: ['quest'] },
  { id: 'npc_rain_elder', town: 'rain_ruins', name: '雨宿りの老人', role: '村人', desc: '雨音の廃村に住む老人。', services: ['rest'] },
  { id: 'npc_bell_keeper', town: 'hollow_bell_town', name: '空鐘の鐘守', role: '鐘守', desc: '空鐘を鳴らす。', services: ['bell'] },
  { id: 'npc_marsh_guide', town: 'glass_marsh', name: '沼地の案内人', role: '案内人', desc: '硝子沼を案内。', services: ['guide'] },
  { id: 'npc_red_gate', town: 'red_ash_fort', name: '赤灰の門番', role: '門番', desc: '砦の門を守る。', services: ['gate'] },
  { id: 'npc_pilgrim', town: 'prayer_hill', name: '祈りの巡礼者', role: '巡礼者', desc: '祈りの丘を巡る。', services: ['prayer'] },
  { id: 'npc_snow_supply', town: 'iron_snow_post', name: '鉄雪の補給係', role: '補給', desc: '関所の補給。', services: ['supply'] },
  { id: 'npc_black_merchant', town: 'black_lantern_lane', name: '黒灯りの商人', role: '商人', desc: '黒灯りの品を扱う。', services: ['shop'] },
  { id: 'npc_aqueduct_worker', town: 'buried_aqueduct', name: '水路の修理工', role: '技師', desc: '水路の修理。', services: ['repair'] },
  { id: 'npc_stargazer', town: 'starfall_observatory', name: '星読みの観測士', role: '観測士', desc: '星の軌跡を読む。', services: ['observe'] },
  { id: 'npc_valhalla_guard', town: 'valhalla_fortress', name: 'ヴァルハラ守衛', role: '守衛', desc: '要塞への入り口を守る。', services: ['raid'] },
];

export function seedTownsAndNpcs(db: Database.Database): void {
  const insTown = db.prepare(`
    INSERT INTO towns (id, name, description, required_level, is_unlocked_default, facilities_json, unlock_condition_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of TOWNS) {
    insTown.run(
      t.id, t.name, t.desc, t.level, t.defaultUnlock,
      JSON.stringify(['inn', 'shop', 'explore']),
      t.defaultUnlock ? '初期解放' : `Lv${t.level}以上で解放`,
    );
  }
  const insNpc = db.prepare(`
    INSERT INTO npcs (id, town_id, name, role, description, services_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const n of NPCS) {
    insNpc.run(n.id, n.town, n.name, n.role, n.desc, JSON.stringify(n.services ?? []));
  }
}
