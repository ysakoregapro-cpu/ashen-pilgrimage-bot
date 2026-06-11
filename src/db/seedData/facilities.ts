import type Database from 'better-sqlite3';

type Fac = {
  id: string;
  town: string;
  name: string;
  type: string;
  npc: string;
  desc: string;
  action: string;
};

type FacTemplate = { name: string; type: string; desc: string; action: string; npcKey?: string };

const FACILITY_TEMPLATES: Record<string, FacTemplate[]> = {
  default: [
    { name: '旅人の宿', type: 'inn', desc: '旅の疲れを癒す宿。', action: 'rest', npcKey: 'inn' },
    { name: '共闘掲示板', type: 'guild_board', desc: '救難や共闘探索の募集が貼られる。', action: 'coop', npcKey: 'board' },
  ],
  start_starfield: [
    { name: '星原の宿', type: 'inn', desc: '星屑の光が差し込む小さな宿。', action: 'rest', npcKey: 'npc_rina' },
    { name: '冒険者受付', type: 'guild_board', desc: '旅の始まりに立つ受付。', action: 'guild', npcKey: 'npc_aoi' },
    { name: '古い訓練場', type: 'training_ground', desc: '剣の音が残る訓練場。', action: 'train', npcKey: 'npc_toma' },
    { name: '街道の旅門', type: 'travel_gate', desc: '次の町へ続く道。', action: 'travel', npcKey: 'npc_aoi' },
  ],
  twilight_port: [
    { name: '海風の宿', type: 'inn', desc: '潮騒と灯台の光を眺める宿。', action: 'rest', npcKey: 'npc_seria' },
    { name: '救護所', type: 'shrine', desc: '傷ついた旅人を休ませる場所。', action: 'heal', npcKey: 'npc_yui' },
    { name: '港の掲示板', type: 'rescue_board', desc: '救難の便りが届く掲示板。', action: 'rescue', npcKey: 'npc_yui' },
    { name: '灯台下の市', type: 'item_shop', desc: '港の商人が集まる市。', action: 'shop', npcKey: 'npc_balt' },
  ],
  silver_mine: [
    { name: '坑道の宿', type: 'inn', desc: '白銀の坑道に近い宿。', action: 'rest', npcKey: 'npc_gren' },
    { name: '白銀鍛冶場', type: 'blacksmith', desc: '白銀を扱う鍛冶場。', action: 'forge', npcKey: 'npc_kai' },
    { name: '防具工房', type: 'repair_shop', desc: '防具の修理と手入れ。', action: 'repair', npcKey: 'npc_oruga' },
    { name: '伝承の炉', type: 'src_forge', desc: '古い武器の名を呼び覚ます炉。', action: 'src', npcKey: 'npc_kai' },
  ],
  mist_forest: [
    { name: '霧の宿', type: 'inn', desc: '霧に包まれた森の宿。', action: 'rest', npcKey: 'npc_noa' },
    { name: '薬師の庵', type: 'item_shop', desc: '薬草と護符を扱う。', action: 'shop', npcKey: 'npc_noa' },
    { name: '古樹の社', type: 'shrine', desc: '古樹の根元に鎮まる社。', action: 'heal', npcKey: 'npc_tree_witness' },
  ],
  moon_library: [
    { name: '禁書の回廊', type: 'library', desc: '記録と古い言葉が眠る。', action: 'library', npcKey: 'npc_shizuku' },
    { name: '司書の控室', type: 'inn', desc: '静寂の中で休める控室。', action: 'rest', npcKey: 'npc_elis' },
  ],
  forgotten_market: [
    { name: '地下の宿', type: 'inn', desc: '灯りの弱い地下の宿。', action: 'rest', npcKey: 'npc_ver' },
    { name: '闇市', type: 'market', desc: '忘れられた品が流れる。', action: 'shop', npcKey: 'npc_jin' },
  ],
  hourglass_city: [
    { name: '時の宿', type: 'inn', desc: '砂時計の音が響く宿。', action: 'rest', npcKey: 'npc_rem' },
    { name: '記憶の保管庫', type: 'library', desc: '失われた記憶の断片。', action: 'library', npcKey: 'npc_krat' },
  ],
  ash_capital: [
    { name: '灰の宿', type: 'inn', desc: '王都跡に残る宿。', action: 'rest', npcKey: 'npc_capital_witness' },
    { name: '王都の掲示板', type: 'guild_board', desc: '旧都の掲示板。', action: 'coop', npcKey: 'npc_capital_witness' },
  ],
  deep_furnace_outpost: [
    { name: '前線宿', type: 'inn', desc: '炉の熱が届く前線宿。', action: 'rest', npcKey: 'npc_furnace_witness' },
    { name: '共闘端末', type: 'raid_terminal', desc: '要塞探索の接続端末。', action: 'raid', npcKey: 'npc_furnace_witness' },
    { name: '深層工房', type: 'blacksmith', desc: '深層装備を扱う工房。', action: 'forge', npcKey: 'npc_kai' },
  ],
  valhalla_fortress: [
    { name: '要塞の休息所', type: 'inn', desc: '雲上の短い休息。', action: 'rest', npcKey: 'npc_valhalla_guard' },
    { name: '要塞探索端末', type: 'raid_terminal', desc: 'ヴァルハラ共闘探索の端末。', action: 'raid', npcKey: 'npc_valhalla_guard' },
    { name: '伝承の炉心', type: 'src_forge', desc: '最後の名を刻む炉。', action: 'src', npcKey: 'npc_valhalla_guard' },
  ],
  old_road_village: [
    { name: '古道の宿', type: 'inn', desc: '旅人の足を止める宿場。', action: 'rest', npcKey: 'npc_rain_elder' },
    { name: '街道掲示板', type: 'guild_board', desc: '旅の便りが貼られる。', action: 'guild', npcKey: 'npc_rina' },
  ],
  starfall_observatory: [
    { name: '観測士の休息室', type: 'inn', desc: '星を見上げる休息室。', action: 'rest', npcKey: 'npc_stargazer' },
    { name: '星読みの書庫', type: 'library', desc: '星の軌跡を記した書庫。', action: 'library', npcKey: 'npc_stargazer' },
  ],
};

const TOWN_IDS = [
  'start_starfield', 'twilight_port', 'silver_mine', 'mist_forest', 'moon_library',
  'forgotten_market', 'hourglass_city', 'ash_capital', 'dragonbone_valley', 'silent_monastery',
  'deep_furnace_outpost', 'old_road_village', 'rain_ruins', 'hollow_bell_town', 'glass_marsh',
  'red_ash_fort', 'prayer_hill', 'iron_snow_post', 'black_lantern_lane', 'buried_aqueduct',
  'starfall_observatory', 'valhalla_fortress',
];

export function seedFacilities(db: Database.Database): void {
  const ins = db.prepare(`
    INSERT INTO facilities (id, town_id, name, type, npc_id, description, action_type, unlock_condition_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const townId of TOWN_IDS) {
    const templates = FACILITY_TEMPLATES[townId] ?? FACILITY_TEMPLATES.default!;
    for (const t of templates) {
      const npcId = t.npcKey?.startsWith('npc_') ? t.npcKey : resolveNpc(townId, t.npcKey ?? 'inn');
      const facId = `f_${townId.slice(0, 8)}_${t.type}`.replace(/[^a-z0-9_]/gi, '_');
      ins.run(facId, townId, t.name, t.type, npcId, t.desc, t.action, '初期から利用可');
    }
  }
}

function resolveNpc(townId: string, key: string): string {
  const map: Record<string, Record<string, string>> = {
    start_starfield: { inn: 'npc_rina', board: 'npc_aoi' },
    twilight_port: { inn: 'npc_seria', board: 'npc_yui' },
  };
  return map[townId]?.[key] ?? 'npc_aoi';
}

export function ensureFacilitiesSeed(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) as c FROM facilities').get() as { c: number };
  if (row.c === 0) seedFacilities(db);
}
