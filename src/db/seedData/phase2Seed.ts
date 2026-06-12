import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import { computeSrcBaseStats } from '../../systems/enhanceSystem';
import { STORY_BOSS_MONSTERS } from './storyData';
import { ensureExistingPlayerProgressionBackfill } from './existingPlayerProgressionBackfill';
import { MONSTER_SEED_DATA } from './monsters';
import { ensureMonstersIsBossColumn } from '../monsterSchema';

const STORY_BOSS_MONSTER_IDS = new Set(Object.values(STORY_BOSS_MONSTERS));

const EVENT_POOLS = {
  early: [
    { type: 'battle', weight: 55 }, { type: 'material', weight: 20 }, { type: 'treasure', weight: 13 },
    { type: 'npc_event', weight: 7 }, { type: 'nothing', weight: 5 },
  ],
  mid: [
    { type: 'battle', weight: 57 }, { type: 'material', weight: 19 }, { type: 'treasure', weight: 12 },
    { type: 'npc_event', weight: 7 }, { type: 'nothing', weight: 5 },
  ],
  late: [
    { type: 'battle', weight: 60 }, { type: 'material', weight: 17 }, { type: 'treasure', weight: 11 },
    { type: 'npc_event', weight: 7 }, { type: 'nothing', weight: 5 },
  ],
  valhalla: [
    { type: 'battle', weight: 65 }, { type: 'material', weight: 15 }, { type: 'treasure', weight: 12 },
    { type: 'npc_event', weight: 3 }, { type: 'nothing', weight: 5 },
  ],
};

function areaTier(townId: string, maxLv: number): keyof typeof EVENT_POOLS {
  if (townId === 'valhalla_fortress') return 'valhalla';
  if (maxLv >= 50) return 'late';
  if (maxLv >= 25) return 'mid';
  return 'early';
}

const ACCESSORIES: Array<{
  id: string; name: string; slot: string; rarity: string; reqLv: number;
  atk?: number; mag?: number; def?: number; spi?: number; hp?: number; spd?: number; acc?: number; crit?: number;
  tradeable?: number; effect?: string; baseValue: number;
}> = [
  { id: 'acc_traveler_ring', name: '旅人の指輪', slot: 'accessory1', rarity: 'N', reqLv: 1, hp: 15, atk: 2, baseValue: 80 },
  { id: 'acc_traveler_talisman', name: '旅人の護符', slot: 'accessory2', rarity: 'N', reqLv: 1, def: 2, spi: 2, baseValue: 80 },
  { id: 'acc_silver_bracelet', name: '白銀の腕輪', slot: 'accessory1', rarity: 'R', reqLv: 10, atk: 5, acc: 0.03, baseValue: 400 },
  { id: 'acc_mist_talisman', name: '霧守りの護符', slot: 'accessory2', rarity: 'R', reqLv: 14, effect: 'poison_resist:0.08', baseValue: 450 },
  { id: 'acc_moon_pendant', name: '月下のペンダント', slot: 'accessory1', rarity: 'SR', reqLv: 25, mag: 8, crit: 0.03, baseValue: 1800 },
  { id: 'acc_black_lamp_ring', name: '黒灯の指輪', slot: 'accessory2', rarity: 'SR', reqLv: 28, spd: 5, acc: 0.05, baseValue: 2000 },
  { id: 'acc_deep_gear_ring', name: '深層炉の機構環', slot: 'accessory1', rarity: 'SSR', reqLv: 48, atk: 12, def: 8, effect: 'break_bonus:0.1', baseValue: 8000 },
  { id: 'acc_starfall_earring', name: '星落ちの耳飾り', slot: 'accessory2', rarity: 'SSR', reqLv: 52, mag: 12, spi: 8, effect: 'mp_regen:0.05', baseValue: 9000 },
  { id: 'acc_valhalla_necklace', name: 'ヴァルハラの首飾り', slot: 'accessory1', rarity: 'UR', reqLv: 60, atk: 15, mag: 15, def: 10, spi: 10, baseValue: 35000 },
  { id: 'acc_old_king_seal', name: '旧王の印章', slot: 'accessory2', rarity: 'UR', reqLv: 60, atk: 18, def: 12, spi: 12, tradeable: 0, baseValue: 50000 },
  { id: 'acc_raid_random', name: '残響の指輪', slot: 'accessory1', rarity: 'SSR', reqLv: 60, baseValue: 12000 },
];

const CONSUMABLE_EXTRAS = [
  { id: 'cons_heal_medium', name: '中回復薬', rarity: 'R', desc: 'HPを150回復。', price: 100, buy: 120, effect: { type: 'heal_hp', value: 150 } },
  { id: 'cons_heal_large', name: '大回復薬', rarity: 'SR', desc: 'HPを250回復。', price: 200, buy: 220, effect: { type: 'heal_hp', value: 250 } },
  { id: 'cons_status_cure', name: '万能解毒薬', rarity: 'R', desc: '状態異常を治す。', price: 80, buy: 100, effect: { type: 'cure_poison' } },
];

const BOSS_STATS: Record<string, { hp: number; atk: number; mag?: number; def: number; lv: number }> = {
  mon_night_shadow: { lv: 8, hp: 80, atk: 16, def: 8 },
  mon_lighthouse_jelly: { lv: 12, hp: 100, atk: 10, mag: 20, def: 6 },
  mon_silver_golem: { lv: 16, hp: 300, atk: 17, def: 20 },
  mon_tree_guardian: { lv: 26, hp: 280, atk: 28, def: 24 },
  mon_silent_guardian: { lv: 36, hp: 480, atk: 16, mag: 32, def: 26 },
  mon_black_iron_exec: { lv: 36, hp: 320, atk: 34, def: 20 },
  mon_throne_shadow: { lv: 44, hp: 400, atk: 20, mag: 40, def: 22 },
  mon_furnace_keeper: { lv: 56, hp: 520, atk: 19, mag: 26, def: 34 },
  mon_old_king_shadow: { lv: 68, hp: 600, atk: 22, mag: 42, def: 36 },
  mon_deep_core_boss: { lv: 72, hp: 650, atk: 54, mag: 50, def: 44 },
};

/** Idempotent overrides — absolute DB values (never multiply existing DB columns) */
const MONSTER_BALANCE_OVERRIDES: Record<string, {
  hp?: number; attack?: number; magic?: number; defense?: number; spirit?: number; gold?: number;
}> = {
  mon_bookworm_swarm: { hp: 130, attack: 22, defense: 11 },
  mon_ink_beast: { hp: 166, attack: 27, defense: 18, spirit: 18 },
  mon_mine_bat: { hp: 170, attack: 15 },
  mon_moon_observer: { hp: 240, attack: 22 },
  mon_arc_residue: { hp: 320, attack: 26 },
  mon_rust_miner: { hp: 265, attack: 22, defense: 16 },
  mon_crystal_spider: { hp: 310, attack: 20, defense: 12 },
  mon_furnace_defense: { hp: 450, attack: 24, defense: 38 },
};

const EARLY_AREA_TAGS = new Set(['starfield', 'port']);
const MID_AREA_TAGS = new Set(['mine', 'forest', 'library']);

function applyIdempotentAreaBalance(db: Database.Database): void {
  const upd = db.prepare('UPDATE monsters SET hp = ?, defense = ?, gold_reward = ? WHERE id = ?');
  for (const m of MONSTER_SEED_DATA) {
    if (m.boss || STORY_BOSS_MONSTER_IDS.has(m.id)) continue;
    let hp = m.hp;
    let def = m.def;
    let gold = m.gold;
    if (EARLY_AREA_TAGS.has(m.tag)) {
      hp = Math.floor(hp * 1.18);
      def = Math.floor(def * 1.08);
      gold = Math.floor(gold * 1.2);
    } else if (MID_AREA_TAGS.has(m.tag)) {
      hp = Math.floor(hp * 1.12);
      gold = Math.floor(gold * 1.2);
    }
    upd.run(hp, def, gold, m.id);
  }
}

function applyMonsterBalanceOverrides(db: Database.Database): void {
  const upd = db.prepare(`
    UPDATE monsters SET
      hp = COALESCE(?, hp),
      attack = COALESCE(?, attack),
      magic = COALESCE(?, magic),
      defense = COALESCE(?, defense),
      spirit = COALESCE(?, spirit),
      gold_reward = COALESCE(?, gold_reward)
    WHERE id = ?
  `);
  for (const [id, o] of Object.entries(MONSTER_BALANCE_OVERRIDES)) {
    upd.run(o.hp ?? null, o.attack ?? null, o.magic ?? null, o.defense ?? null, o.spirit ?? null, o.gold ?? null, id);
  }
}

const RARITY_REQ: Record<string, number> = { N: 1, R: 5, SR: 20, SSR: 40, UR: 58, Uni: 40, Src: 50 };

function applyBossStats(db: Database.Database): void {
  const updBoss = db.prepare('UPDATE monsters SET is_boss = 1, break_max = 180 WHERE id = ?');
  for (const id of STORY_BOSS_MONSTER_IDS) updBoss.run(id);
  db.prepare('UPDATE monsters SET is_boss = 1 WHERE id IN (SELECT id FROM monsters WHERE ai_pattern_json LIKE ?)').run('%"boss"%');

  for (const [id, stats] of Object.entries(BOSS_STATS)) {
    db.prepare(`
      UPDATE monsters SET level=?, hp=?, attack=?, magic=?, defense=?, is_boss=1, break_max=180
      WHERE id=?
    `).run(stats.lv, stats.hp, stats.atk, stats.mag ?? Math.floor(stats.atk * 0.5), stats.def, id);
  }
}

export function ensurePhase2Seed(db: Database.Database): void {
  const ts = nowIso();
  ensureMonstersIsBossColumn(db);

  const AI_OVERRIDES: Record<string, Record<string, unknown>> = {
    mon_silver_golem: { pattern: 'normal', heavy_chance: 0.35, poison_chance: 0 },
    mon_crystal_spider: { pattern: 'normal', poison_chance: 0.28, heavy_chance: 0.15 },
    mon_rust_miner: { pattern: 'normal', heavy_chance: 0.22 },
    mon_mine_bat: { pattern: 'normal', poison_chance: 0.08 },
    mon_drift_undead: { pattern: 'normal', poison_chance: 0.12 },
  };
  const updAi = db.prepare('UPDATE monsters SET ai_pattern_json = ? WHERE id = ?');
  for (const [id, ai] of Object.entries(AI_OVERRIDES)) updAi.run(JSON.stringify(ai), id);

  // Event pools per area tier
  const areas = db.prepare('SELECT id, town_id, recommended_max_level FROM exploration_areas').all() as Array<{
    id: string; town_id: string; recommended_max_level: number;
  }>;
  const updPool = db.prepare('UPDATE exploration_areas SET event_pool_json = ? WHERE id = ?');
  for (const a of areas) {
    const tier = areaTier(a.town_id, a.recommended_max_level);
    updPool.run(JSON.stringify(EVENT_POOLS[tier]), a.id);
  }

  // Item values from sell_price
  db.prepare(`
    UPDATE items SET base_value = COALESCE(base_value, sell_price * 3),
      shop_sell_price = COALESCE(shop_sell_price, MAX(1, CAST(sell_price AS INTEGER))),
      shop_buy_price = COALESCE(shop_buy_price, MAX(1, CAST(sell_price * 1.3 AS INTEGER)))
    WHERE base_value IS NULL OR base_value = 0
  `).run();

  // Consumables
  const insItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, battle_usable, battle_effect_json, base_value, shop_buy_price, shop_sell_price, created_at)
    VALUES (?, ?, 'consumable', ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      battle_usable=1, battle_effect_json=excluded.battle_effect_json,
      base_value=excluded.base_value, shop_buy_price=excluded.shop_buy_price, shop_sell_price=excluded.shop_sell_price
  `);
  for (const c of CONSUMABLE_EXTRAS) {
    insItem.run(c.id, c.name, c.rarity, c.desc, '各町の店', '戦闘回復', c.price, JSON.stringify(c.effect),
      c.price * 3, c.buy, Math.floor(c.price * 0.3), ts);
  }
  db.prepare(`UPDATE items SET base_value=150, shop_buy_price=55, shop_sell_price=15 WHERE id='cons_heal_potion'`).run();
  db.prepare(`UPDATE items SET base_value=75, shop_buy_price=45, shop_sell_price=12 WHERE id='cons_antidote'`).run();
  db.prepare(`UPDATE items SET base_value=100, shop_buy_price=80, shop_sell_price=25 WHERE id='cons_smoke_bomb'`).run();
  db.prepare(`UPDATE items SET base_value=35, shop_buy_price=35, shop_sell_price=10 WHERE id='upg_rough_stone'`).run();
  db.prepare(`UPDATE items SET base_value=90, shop_buy_price=80, shop_sell_price=25 WHERE id='upg_stone'`).run();

  // Accessories
  const insEqItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, base_value, shop_buy_price, shop_sell_price, created_at)
    VALUES (?, ?, 'equipment', ?, ?, '店・探索', '装備', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET base_value=excluded.base_value, shop_buy_price=excluded.shop_buy_price
  `);
  const insEq = db.prepare(`
    INSERT INTO equipment (item_id, slot, attack_bonus, magic_bonus, defense_bonus, spirit_bonus, speed_bonus, hp_bonus, accuracy_bonus, crit_rate_bonus, special_effect_json, max_upgrade_level, is_unique, required_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      attack_bonus=excluded.attack_bonus, magic_bonus=excluded.magic_bonus,
      defense_bonus=excluded.defense_bonus, spirit_bonus=excluded.spirit_bonus,
      required_level=excluded.required_level
  `);
  for (const a of ACCESSORIES) {
    const sell = Math.floor(a.baseValue * 0.3);
    insEqItem.run(a.id, a.name, a.rarity, `${a.name}。`, sell, a.tradeable ?? 1, a.baseValue, Math.floor(a.baseValue * 1.3), sell, ts);
    insEq.run(
      a.id, a.slot, a.atk ?? 0, a.mag ?? 0, a.def ?? 0, a.spi ?? 0, a.spd ?? 0, a.hp ?? 0,
      a.acc ?? 0, a.crit ?? 0, a.effect ? JSON.stringify(parseEffect(a.effect)) : null,
      a.rarity === 'UR' ? 10 : 7, a.tradeable === 0 ? 1 : 0, a.reqLv,
    );
  }

  // Required levels on equipment by rarity
  for (const [rarity, lv] of Object.entries(RARITY_REQ)) {
    db.prepare(`
      UPDATE equipment SET required_level = ? WHERE item_id IN (
        SELECT i.id FROM items i JOIN equipment e ON i.id = e.item_id WHERE i.rarity = ? AND (e.required_level IS NULL OR e.required_level <= 1)
      )
    `).run(lv, rarity);
  }

  // Facilities: prep + exchange
  const insFac = db.prepare(`
    INSERT INTO facilities (id, town_id, name, type, npc_id, description, action_type, unlock_condition_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, '初期から利用可')
    ON CONFLICT(id) DO NOTHING
  `);
  const prepTowns = ['start_starfield', 'twilight_port', 'silver_mine', 'mist_forest', 'forgotten_market', 'valhalla_fortress'];
  for (const town of prepTowns) {
    insFac.run(`f_${town.slice(0, 8)}_prep`, town, '身支度所', 'prep_room', 'npc_aoi', '装備と所持品を整える場所。', 'prep');
  }
  const exchangeTowns: Array<[string, string, string]> = [
    ['start_starfield', '巡礼者商会', 'exchange'],
    ['old_road_village', '巡礼者商会', 'exchange'],
    ['forgotten_market', '地下取引所', 'exchange_under'],
    ['valhalla_fortress', '要塞商会', 'exchange_fort'],
  ];
  for (const [town, name, type] of exchangeTowns) {
    insFac.run(`f_${town.slice(0, 8)}_exch`, town, name, type, 'npc_jin', '巡礼者同士の品物売買。', 'exchange');
  }

  // Combat balance — idempotent absolute values from seed data (never hp * mult on DB)
  applyIdempotentAreaBalance(db);
  applyMonsterBalanceOverrides(db);
  applyBossStats(db);

  // Remove mid-game Src upgrade mats from exploration rewards
  const SRC_MIDS = ['src_echo_core', 'src_primordial', 'src_primordial_full', 'src_upg_shard'];
  const areaRows = db.prepare('SELECT id, reward_pool_json FROM exploration_areas').all() as Array<{ id: string; reward_pool_json: string }>;
  const updReward = db.prepare('UPDATE exploration_areas SET reward_pool_json = ? WHERE id = ?');
  for (const a of areaRows) {
    const pool = JSON.parse(a.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    const filtered = pool.filter((p) => !SRC_MIDS.includes(p.item_id));
    if (filtered.length !== pool.length) updReward.run(JSON.stringify(filtered), a.id);
  }

  // Job starter weapons — low-rate early area/treasure drops
  const STARTER_AREA_BOOST: Record<string, Array<{ item_id: string; weight: number }>> = {
    area_old_training: [
      { item_id: 'wpn_traveler_sword', weight: 3 },
      { item_id: 'wpn_leather_gauntlet', weight: 2 },
      { item_id: 'wpn_training_hammer', weight: 2 },
    ],
    area_night_hill: [{ item_id: 'wpn_rust_dagger', weight: 3 }],
    area_broken_shrine: [{ item_id: 'wpn_prayer_rod', weight: 3 }],
    area_lighthouse_rocks: [{ item_id: 'wpn_old_bow', weight: 3 }],
    area_old_mine: [{ item_id: 'wpn_mini_cannon', weight: 2 }],
    area_mist_beast_path: [{ item_id: 'wpn_mist_staff', weight: 2 }],
  };
  for (const [areaId, extras] of Object.entries(STARTER_AREA_BOOST)) {
    const row = db.prepare('SELECT reward_pool_json FROM exploration_areas WHERE id = ?').get(areaId) as { reward_pool_json: string } | undefined;
    if (!row) continue;
    const pool = JSON.parse(row.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    for (const ex of extras) {
      if (!pool.some((p) => p.item_id === ex.item_id)) pool.push(ex);
    }
    updReward.run(JSON.stringify(pool), areaId);
  }

  db.prepare(`UPDATE items SET usage_text = '高級装備・特殊強化' WHERE id = 'mat_moon_ink'`).run();
  db.prepare(`UPDATE items SET usage_text = 'Src武器強化（ヴァルハラ産）', source_text = 'ヴァルハラ探索' WHERE category = 'src_upgrade_material'`).run();

  // 重騎士初期武器 — 訓練用槌（既存DB向け idempotent）
  const insWpnItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, 'equipment', ?, ?, ?, '装備', ?, 1, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const insWpnEq = db.prepare(`
    INSERT INTO equipment (item_id, slot, weapon_type, attack_bonus, magic_bonus, defense_bonus, max_upgrade_level, is_unique, src_weapon_id)
    VALUES (?, 'weapon', ?, ?, 0, ?, 5, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET weapon_type=excluded.weapon_type, attack_bonus=excluded.attack_bonus, is_unique=excluded.is_unique, src_weapon_id=excluded.src_weapon_id
  `);
  insWpnItem.run('wpn_training_hammer', '訓練用槌', 'N', '重騎士の訓練用槌。', '古い訓練場・低確率', 50, ts);
  insWpnEq.run('wpn_training_hammer', 'hammer', 9, 0, 0, null);
  insWpnItem.run('wpn_unique_old_hammer', '古炉の訓練槌', 'Uni', 'カイ伝承の槌。', 'カイ伝承', 0, ts);
  insWpnEq.run('wpn_unique_old_hammer', 'hammer', 20, 0, 1, 'src_silver');

  ensureForgeProgressionSeed(db, ts);
  ensureExistingPlayerProgressionBackfill(db);
}

function ensureForgeProgressionSeed(db: Database.Database, ts: string): void {
  const uniIds = [
    'wpn_unique_twilight', 'wpn_unique_lamp', 'wpn_unique_deep', 'wpn_unique_echo',
    'wpn_unique_mirror', 'wpn_unique_silver', 'wpn_unique_old_hammer', 'wpn_unique_mist_lantern',
    'wpn_unique_old_shield', 'wpn_unique_star_scar', 'wpn_unique_tuner', 'wpn_unique_black_fox', 'wpn_unique_bind',
  ];
  for (const id of uniIds) {
    db.prepare(`UPDATE items SET rarity = 'Uni' WHERE id = ?`).run(id);
  }

  db.prepare(`
    UPDATE items SET rarity = 'SR', source_text = '探索・沈黙修道院', description = '静寂の聖印の武器'
    WHERE id = 'wpn_unique_silence'
  `).run();
  db.prepare(`
    UPDATE equipment SET is_unique = 0, src_weapon_id = NULL, max_upgrade_level = 7, magic_bonus = 20
    WHERE item_id = 'wpn_unique_silence'
  `).run();

  const insItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, 'equipment', ?, ?, ?, '装備', ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET rarity=excluded.rarity, name=excluded.name, source_text=excluded.source_text, tradeable=0
  `);
  const insEq = db.prepare(`
    INSERT INTO equipment (item_id, slot, weapon_type, attack_bonus, magic_bonus, defense_bonus, max_upgrade_level, is_unique, src_weapon_id)
    VALUES (?, 'weapon', ?, ?, ?, 0, 7, 1, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      weapon_type=excluded.weapon_type, magic_bonus=excluded.magic_bonus, attack_bonus=excluded.attack_bonus,
      is_unique=1, src_weapon_id=excluded.src_weapon_id, max_upgrade_level=7
  `);
  insItem.run('wpn_unique_mist_lantern', '霧灯の星杖', 'Uni', '霧払いの杖が伝承で得るUni杖。', 'カイ伝承', 0, ts);
  insEq.run('wpn_unique_mist_lantern', 'staff', 0, 29, 'src_mist_lantern');

  const insMon = db.prepare(`
    INSERT INTO monsters (id, name, area_tag, level, hp, mp, attack, magic, defense, spirit, speed, break_max, drop_pool_json, exp_reward, gold_reward, ai_pattern_json, is_boss)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 180, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_boss=1, break_max=180
  `);
  insMon.run(
    'mon_black_lantern_wraith', '黒灯の残影', 'undermarket', 54, 380, 34, 36, 22,
    18, 16, JSON.stringify([{ item_id: 'mat_forgotten_sand', weight: 10 }]), 130, 75,
    JSON.stringify({ pattern: 'boss' }),
  );
  db.prepare(`UPDATE monsters SET is_boss = 1, break_max = 180 WHERE id = 'mon_moon_observer'`).run();

  const insArea = db.prepare(`
    INSERT INTO exploration_areas (id, town_id, name, description, recommended_min_level, recommended_max_level, monster_pool_json, reward_pool_json, event_pool_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  insArea.run(
    'area_black_lantern_alley', 'black_lantern_lane', '黒灯りの路地', '黒い灯りだけが灯る路地。',
    50, 58,
    JSON.stringify([{ monster_id: 'mon_black_lantern_wraith', weight: 12 }, { monster_id: 'mon_masked_thief', weight: 10 }]),
    JSON.stringify([{ item_id: 'mat_forgotten_sand', weight: 10 }, { item_id: 'wpn_black_lamp_twin', weight: 5 }]),
    JSON.stringify(EVENT_POOLS.late),
  );
  insArea.run(
    'area_cinder_passage', 'black_lantern_lane', '煤煙の抜け道', '煤煙に覆われた抜け道。',
    52, 60,
    JSON.stringify([{ monster_id: 'mon_black_lantern_wraith', weight: 14 }, { monster_id: 'mon_cursed_tool', weight: 10 }]),
    JSON.stringify([{ item_id: 'mat_forgotten_sand', weight: 8 }, { item_id: 'acc_black_lamp_ring', weight: 5 }]),
    JSON.stringify(EVENT_POOLS.late),
  );

  const updReward = db.prepare('UPDATE exploration_areas SET reward_pool_json = ? WHERE id = ?');
  const silent = db.prepare('SELECT reward_pool_json FROM exploration_areas WHERE id = ?').get('area_silent_pilgrim') as { reward_pool_json: string } | undefined;
  if (silent) {
    const pool = JSON.parse(silent.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    const next = pool.map((p) => (p.item_id === 'wpn_unique_silence' ? { ...p, item_id: 'wpn_silence_seal_sr' } : p));
    updReward.run(JSON.stringify(next), 'area_silent_pilgrim');
  }

  const srcExists = db.prepare('SELECT 1 FROM src_weapons WHERE id = ?').get('src_mist_lantern');
  if (!srcExists) {
    db.prepare(`
      INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
      VALUES ('wpn_src_mist_lantern', 'Src: 霧灯星杖', 'equipment', 'Src', 'Src: 霧灯星杖 — 伝承武器', 'Src化', '装備', 0, 0, ?)
    `).run(ts);
    db.prepare(`
      INSERT INTO equipment (item_id, slot, weapon_type, attack_bonus, magic_bonus, max_upgrade_level, is_unique, src_weapon_id, skill_id)
      VALUES ('wpn_src_mist_lantern', 'weapon', 'staff', 0, 42, 10, 0, 'src_mist_lantern', 'skill_lamp_prayer')
    `).run();
    db.prepare(`
      INSERT INTO src_weapons (id, base_item_id, src_item_id, name, jobs_json, innate_skill_id, plus10_effect, manifest_requirements_json)
      VALUES ('src_mist_lantern', 'wpn_unique_mist_lantern', 'wpn_src_mist_lantern', 'Src: 霧灯星杖', ?, 'skill_lamp_prayer', '星属性魔法の与ダメージ上昇', ?)
    `).run(JSON.stringify(['魔術師', '星読み', '黒魔導士', '調律師']), JSON.stringify({ gold: 5000, materials: [{ id: 'src_echo_core', qty: 3 }, { id: 'mat_starfall_shard', qty: 5 }] }));
  }

  applyUniWeaponBalance(db);
  applySrcWeaponBalance(db);

  const areasWithCinder = db.prepare(`
    SELECT id, reward_pool_json FROM exploration_areas WHERE reward_pool_json LIKE ?
  `).all('%mat_black_lantern_cinder%') as Array<{ id: string; reward_pool_json: string }>;
  const updArea = db.prepare('UPDATE exploration_areas SET reward_pool_json = ? WHERE id = ?');
  for (const a of areasWithCinder) {
    const pool = JSON.parse(a.reward_pool_json) as Array<{ item_id: string; weight: number }>;
    updArea.run(JSON.stringify(pool.map((p) => (
      p.item_id === 'mat_black_lantern_cinder' ? { ...p, item_id: 'mat_forgotten_sand' } : p
    ))), a.id);
  }
}

const UNI_WEAPON_STATS: Record<string, { atk?: number; mag?: number }> = {
  wpn_unique_twilight: { atk: 28 },
  wpn_unique_lamp: { mag: 29 },
  wpn_unique_deep: { atk: 28, mag: 14 },
  wpn_unique_echo: { atk: 28 },
  wpn_unique_mirror: { atk: 28 },
  wpn_unique_silver: { atk: 28 },
  wpn_unique_old_hammer: { atk: 28 },
  wpn_unique_mist_lantern: { mag: 29 },
  wpn_unique_old_shield: { atk: 13 },
  wpn_unique_star_scar: { atk: 28 },
  wpn_unique_tuner: { mag: 27 },
  wpn_unique_black_fox: { atk: 28 },
  wpn_unique_bind: { mag: 27 },
};

function applyUniWeaponBalance(db: Database.Database): void {
  const upd = db.prepare(`
    UPDATE equipment SET attack_bonus = ?, magic_bonus = ?
    WHERE item_id = ?
  `);
  for (const [id, s] of Object.entries(UNI_WEAPON_STATS)) {
    upd.run(s.atk ?? 0, s.mag ?? 0, id);
  }
}

function applySrcWeaponBalance(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT sw.src_item_id, ue.attack_bonus AS uni_atk, ue.magic_bonus AS uni_mag
    FROM src_weapons sw
    JOIN equipment ue ON sw.base_item_id = ue.item_id
  `).all() as Array<{ src_item_id: string; uni_atk: number; uni_mag: number }>;
  const upd = db.prepare('UPDATE equipment SET attack_bonus = ?, magic_bonus = ? WHERE item_id = ?');
  for (const r of rows) {
    const base = computeSrcBaseStats(r.uni_atk, r.uni_mag);
    upd.run(base.atk, base.mag, r.src_item_id);
  }
}

function parseEffect(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of s.split(',')) {
    const [k, v] = part.split(':');
    if (k && v) out[k.trim()] = parseFloat(v);
  }
  return out;
}

export function generateRaidAccessoryMetadata(): string {
  const bonuses: Record<string, number> = {};
  const rolls: Array<[string, number, number]> = [
    ['attack', 3, 15], ['magic', 3, 15], ['defense', 3, 15], ['spirit', 3, 15],
    ['speed', 1, 8], ['accuracy', 0.01, 0.08], ['crit_rate', 0.01, 0.05],
  ];
  const pick = rolls[Math.floor(Math.random() * rolls.length)]!;
  const val = pick[1] + Math.random() * (pick[2] - pick[1]);
  bonuses[pick[0]] = pick[0].includes('rate') || pick[0] === 'accuracy' ? Math.round(val * 100) / 100 : Math.round(val);
  return JSON.stringify({ random_bonuses: bonuses, raid_roll: true });
}
