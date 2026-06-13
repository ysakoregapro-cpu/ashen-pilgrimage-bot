/** MP回復消耗品 — ショップ/探索/魔法系敵ドロップ */

import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import { roll } from '../../utils/random';

export type ManaConsumableDef = {
  id: string;
  name: string;
  rarity: string;
  desc: string;
  source: string;
  usage: string;
  sellPrice: number;
  buyPrice: number;
  mpHeal: number;
};

export const MANA_CONSUMABLES: ManaConsumableDef[] = [
  {
    id: 'cons_mana_drop',
    name: '小さなマナ雫',
    rarity: 'N',
    desc: 'MPを25回復する小瓶。探索の保険に。',
    source: '序盤町の店・探索',
    usage: 'MP回復',
    sellPrice: 32,
    buyPrice: 100,
    mpHeal: 25,
  },
  {
    id: 'cons_mana_vial',
    name: 'マナ小瓶',
    rarity: 'R',
    desc: 'MPを60回復。中盤以降の継戦用。',
    source: '中盤町の店・探索',
    usage: 'MP回復',
    sellPrice: 77,
    buyPrice: 220,
    mpHeal: 60,
  },
  {
    id: 'cons_mana_flask',
    name: 'マナ霊瓶',
    rarity: 'SR',
    desc: 'MPを110回復。長期探索・ボス前の備え。',
    source: '終盤町の店・探索',
    usage: 'MP回復',
    sellPrice: 225,
    buyPrice: 720,
    mpHeal: 110,
  },
  {
    id: 'cons_mana_valhalla',
    name: 'ヴァルハラの青霊薬',
    rarity: 'UR',
    desc: 'MPを170回復。ヴァルハラ高難度向け。常用は財布に響く。',
    source: 'ヴァルハラ店・探索・徽章交換',
    usage: 'MP回復',
    sellPrice: 525,
    buyPrice: 1750,
    mpHeal: 170,
  },
];

export const MANA_ITEM_IDS = MANA_CONSUMABLES.map((m) => m.id);

/** town loot pool weight overrides (dropBalanceMaster にマージ) */
export const MANA_TOWN_LOOT_OVERRIDES: Record<string, {
  base_weight?: number;
  min_area_rank?: number;
  max_area_rank?: number;
  value_tier?: number;
}> = {
  cons_mana_drop: { base_weight: 2, min_area_rank: 0, max_area_rank: 4, value_tier: 1 },
  cons_mana_vial: { base_weight: 1, min_area_rank: 2, max_area_rank: 6, value_tier: 2 },
  cons_mana_flask: { base_weight: 1, min_area_rank: 5, max_area_rank: 8, value_tier: 4 },
  cons_mana_valhalla: { base_weight: 1, min_area_rank: 7, max_area_rank: 9, value_tier: 5 },
};

/** 魔法/霊体系敵からの戦闘勝利ドロップ */
export const MANA_MAGIC_ENEMY_DROPS: Array<{
  itemId: string;
  rate: number;
  minMonsterLevel: number;
  maxMonsterLevel: number;
  valhallaOnly?: boolean;
}> = [
  { itemId: 'cons_mana_drop', rate: 0.03, minMonsterLevel: 1, maxMonsterLevel: 35 },
  { itemId: 'cons_mana_vial', rate: 0.015, minMonsterLevel: 18, maxMonsterLevel: 58 },
  { itemId: 'cons_mana_flask', rate: 0.004, minMonsterLevel: 45, maxMonsterLevel: 72 },
  { itemId: 'cons_mana_valhalla', rate: 0.002, minMonsterLevel: 58, maxMonsterLevel: 80, valhallaOnly: true },
];

const MAGIC_AREA_TAGS = new Set(['library', 'port']);

export function isMagicSpiritMonster(monster: {
  magic: number; attack: number; area_tag: string; spirit?: number;
}): boolean {
  if (MAGIC_AREA_TAGS.has(monster.area_tag)) return true;
  if (monster.magic >= Math.max(8, monster.attack * 0.75)) return true;
  if ((monster.spirit ?? 0) >= monster.attack) return true;
  return false;
}

export function rollManaConsumableDrop(monster: {
  id: string; level: number; magic: number; attack: number; area_tag: string;
  spirit: number; is_boss?: number;
}, isBoss: boolean): string | null {
  if (isBoss) return null;
  if (!isMagicSpiritMonster(monster)) return null;
  const lv = monster.level ?? 1;
  for (const drop of MANA_MAGIC_ENEMY_DROPS) {
    if (lv < drop.minMonsterLevel || lv > drop.maxMonsterLevel) continue;
    if (drop.valhallaOnly && monster.area_tag !== 'valhalla') continue;
    if (roll(drop.rate)) return drop.itemId;
  }
  return null;
}

export function ensureManaConsumablesSeed(db: Database.Database): void {
  const ts = nowIso();
  const ins = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable,
      battle_usable, battle_effect_json, base_value, shop_buy_price, shop_sell_price, created_at)
    VALUES (?, ?, 'consumable', ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      rarity = excluded.rarity,
      description = excluded.description,
      source_text = excluded.source_text,
      usage_text = excluded.usage_text,
      sell_price = excluded.sell_price,
      battle_usable = 1,
      battle_effect_json = excluded.battle_effect_json,
      base_value = excluded.base_value,
      shop_buy_price = excluded.shop_buy_price,
      shop_sell_price = excluded.shop_sell_price
  `);
  for (const m of MANA_CONSUMABLES) {
    const effect = JSON.stringify({ type: 'heal_mp', value: m.mpHeal });
    ins.run(
      m.id, m.name, m.rarity, m.desc, m.source, m.usage, m.sellPrice,
      effect, m.sellPrice * 3, m.buyPrice, Math.floor(m.sellPrice * 0.25), ts,
    );
  }
}
