import { getDb } from '../db/database';
import { nowIso } from '../types';
import {
  AWAKENING_ELIGIBLE_RARITIES, MAX_AWAKENING_LEVEL,
  awakeningLabel, getAwakeningDupCost, totalDuplicatesForMaxAwakening,
} from '../db/seedData/awakeningMaster';
import { getPrimaryStatKey } from './enhanceSystem';

export type AwakenableRow = {
  id: number; item_id: string; name: string; rarity: string;
  awakening_level: number; upgrade_level: number; quantity: number;
  slot: string; weapon_type: string | null;
  attack_bonus: number; magic_bonus: number; defense_bonus: number; spirit_bonus: number;
};

export function getAwakeningStatFlatBonus(awakeningLevel: number, primary: 'attack' | 'magic' | 'defense' | 'spirit'): number {
  if (awakeningLevel <= 0) return 0;
  return awakeningLevel;
}

export function getAwakeningInfo(userId: string, inventoryId: number): string {
  const row = loadAwakenable(userId, inventoryId);
  if (!row) return '覚醒できない装備です。';
  const cur = row.awakening_level;
  if (cur >= MAX_AWAKENING_LEVEL) {
    return `**${row.name}** — ${awakeningLabel(cur)}（最大）\n職業初期武器なら、カイに見せて伝承できる。`;
  }
  const need = getAwakeningDupCost(row.rarity, cur);
  const have = countDuplicates(userId, row.item_id, inventoryId);
  const primary = getPrimaryStatKey({
    attack_bonus: row.attack_bonus, magic_bonus: row.magic_bonus,
    defense_bonus: row.defense_bonus, spirit_bonus: row.spirit_bonus,
    speed_bonus: 0, hp_bonus: 0, weapon_type: row.weapon_type, slot: row.slot,
  });
  const primaryLabel = { attack: '攻撃', magic: '魔力', defense: '防御', spirit: '精神' }[primary];
  const totalNeed = totalDuplicatesForMaxAwakening(row.rarity);
  return [
    `**${row.name}** — ${awakeningLabel(cur)} → ${awakeningLabel(cur + 1)}`,
    `同名武器: ${have}/${need} 本必要`,
    `効果: ${primaryLabel}+1 / 耐久上限微増`,
    `最大まで: 合計${totalNeed}本（${row.rarity}）`,
  ].join('\n');
}

function loadAwakenable(userId: string, inventoryId: number): AwakenableRow | undefined {
  return getDb().prepare(`
    SELECT pi.id, pi.item_id, pi.awakening_level, pi.upgrade_level, pi.quantity,
      i.name, i.rarity, e.slot, e.weapon_type,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.id = ? AND pi.user_id = ? AND e.is_unique = 0 AND i.rarity != 'Src'
  `).get(inventoryId, userId) as AwakenableRow | undefined;
}

export function isAwakeningEligible(row: { rarity: string; awakening_level: number }): boolean {
  return AWAKENING_ELIGIBLE_RARITIES.has(row.rarity) && row.awakening_level < MAX_AWAKENING_LEVEL;
}

export function getAwakeningCandidates(userId: string): AwakenableRow[] {
  return getDb().prepare(`
    SELECT pi.id, pi.item_id, pi.awakening_level, pi.upgrade_level, pi.quantity,
      i.name, i.rarity, e.slot, e.weapon_type,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.spirit_bonus
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.is_pending_reward = 0 AND pi.is_listed = 0
      AND e.is_unique = 0 AND i.rarity IN ('N','R','SR','UR','SSR') AND pi.awakening_level < ?
    ORDER BY i.name
    LIMIT 25
  `).all(userId, MAX_AWAKENING_LEVEL) as AwakenableRow[];
}

function countDuplicates(userId: string, itemId: string, excludeId: number): number {
  const rows = getDb().prepare(`
    SELECT id, quantity FROM player_inventory
    WHERE user_id = ? AND item_id = ? AND id != ? AND is_equipped = 0
      AND is_pending_reward = 0 AND COALESCE(is_listed, 0) = 0
  `).all(userId, itemId, excludeId) as Array<{ id: number; quantity: number }>;
  return rows.reduce((sum, r) => sum + r.quantity, 0);
}

function consumeDuplicates(userId: string, itemId: string, excludeId: number, count: number): boolean {
  let remaining = count;
  const rows = getDb().prepare(`
    SELECT id, quantity FROM player_inventory
    WHERE user_id = ? AND item_id = ? AND id != ? AND is_equipped = 0
      AND is_pending_reward = 0 AND COALESCE(is_listed, 0) = 0
    ORDER BY upgrade_level ASC, awakening_level ASC, id ASC
  `).all(userId, itemId, excludeId) as Array<{ id: number; quantity: number }>;

  const db = getDb();
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, row.quantity);
      remaining -= take;
      if (row.quantity <= take) {
        db.prepare('DELETE FROM player_inventory WHERE id = ?').run(row.id);
      } else {
        db.prepare('UPDATE player_inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?')
          .run(take, nowIso(), row.id);
      }
    }
    if (remaining > 0) throw new Error('not enough');
  });
  try {
    tx();
    return true;
  } catch {
    return false;
  }
}

export function awakenEquipment(userId: string, inventoryId: number): { success: boolean; message: string } {
  const row0 = getDb().prepare('SELECT is_equipped FROM player_inventory WHERE id = ? AND user_id = ?')
    .get(inventoryId, userId) as { is_equipped: number } | undefined;
  if (row0?.is_equipped) {
    return { success: false, message: '装備中の武器は覚醒できない。一度外してから試してほしい。' };
  }

  const row = loadAwakenable(userId, inventoryId);
  if (!row) return { success: false, message: '覚醒できない装備です。' };
  if (!AWAKENING_ELIGIBLE_RARITIES.has(row.rarity)) {
    return { success: false, message: 'Src武器は覚醒できません。N/R/SR/URのみ覚醒可能です。' };
  }
  const cur = row.awakening_level;
  if (cur >= MAX_AWAKENING_LEVEL) return { success: false, message: 'すでに最大覚醒です。' };

  const need = getAwakeningDupCost(row.rarity, cur);
  if (need <= 0) return { success: false, message: 'これ以上覚醒できません。' };
  const have = countDuplicates(userId, row.item_id, inventoryId);
  if (have < need) {
    return { success: false, message: `同名武器が足りません。（${have}/${need}）` };
  }
  if (!consumeDuplicates(userId, row.item_id, inventoryId, need)) {
    return { success: false, message: '同名武器の消費に失敗しました。' };
  }

  getDb().prepare('UPDATE player_inventory SET awakening_level = ?, updated_at = ? WHERE id = ?')
    .run(cur + 1, nowIso(), inventoryId);

  return {
    success: true,
    message: `✨ **${row.name}** が ${awakeningLabel(cur + 1)} になった。\n同名${need}本を宿し、刃が深く応えた。`,
  };
}

export { awakeningLabel, MAX_AWAKENING_LEVEL };
