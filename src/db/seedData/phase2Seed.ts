import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import { MONSTER_TO_STORY_BOSS } from './storyData';
import { ensureMonstersIsBossColumn } from '../monsterSchema';

const BOSS_IDS = new Set(Object.keys(MONSTER_TO_STORY_BOSS));

const EVENT_POOLS = {
  early: [
    { type: 'battle', weight: 50 }, { type: 'material', weight: 22 }, { type: 'treasure', weight: 14 },
    { type: 'npc_event', weight: 9 }, { type: 'nothing', weight: 5 },
  ],
  mid: [
    { type: 'battle', weight: 55 }, { type: 'material', weight: 20 }, { type: 'treasure', weight: 13 },
    { type: 'npc_event', weight: 7 }, { type: 'nothing', weight: 5 },
  ],
  late: [
    { type: 'battle', weight: 58 }, { type: 'material', weight: 18 }, { type: 'treasure', weight: 12 },
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
  mon_silver_golem: { lv: 16, hp: 180, atk: 18, def: 22 },
  mon_tree_guardian: { lv: 26, hp: 280, atk: 28, def: 24 },
  mon_silent_guardian: { lv: 36, hp: 450, atk: 30, mag: 36, def: 26 },
  mon_black_iron_exec: { lv: 36, hp: 320, atk: 36, def: 20 },
  mon_throne_shadow: { lv: 44, hp: 400, atk: 20, mag: 42, def: 22 },
  mon_furnace_keeper: { lv: 56, hp: 500, atk: 44, mag: 30, def: 36 },
  mon_old_king_shadow: { lv: 68, hp: 600, atk: 52, mag: 48, def: 38 },
  mon_deep_core_boss: { lv: 72, hp: 650, atk: 54, mag: 50, def: 44 },
};

const RARITY_REQ: Record<string, number> = { N: 1, R: 5, SR: 20, SSR: 40, UR: 58, Src: 50 };

export function ensurePhase2Seed(db: Database.Database): void {
  const ts = nowIso();
  ensureMonstersIsBossColumn(db);

  // Mark bosses in monsters table
  const updBoss = db.prepare('UPDATE monsters SET is_boss = 1, break_max = 180 WHERE id = ?');
  for (const id of BOSS_IDS) updBoss.run(id);
  db.prepare('UPDATE monsters SET is_boss = 1 WHERE id IN (SELECT id FROM monsters WHERE ai_pattern_json LIKE ?)').run('%"boss"%');

  for (const [id, stats] of Object.entries(BOSS_STATS)) {
    db.prepare(`
      UPDATE monsters SET level=?, hp=?, attack=?, magic=?, defense=?, is_boss=1, break_max=180
      WHERE id=?
    `).run(stats.lv, stats.hp, stats.atk, stats.mag ?? Math.floor(stats.atk * 0.5), stats.def, id);
  }

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

  // EXP boost on monsters by level bands handled in battleSystem
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
