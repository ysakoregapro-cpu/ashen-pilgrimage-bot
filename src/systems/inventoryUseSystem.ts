import { getDb } from '../db/database';
import { nowIso } from '../types';
import { requirePlayer, recalculatePlayerStats } from './playerSystem';
import { getPlayerStatusEffects, setPlayerStatusEffect, clearPlayerStatusEffects } from './playerStatusSystem';

type ConsumableEffect = {
  type: string;
  value?: number;
  status?: string;
};

function parseEffect(json: string | null): ConsumableEffect | null {
  if (!json) return null;
  try { return JSON.parse(json) as ConsumableEffect; } catch { return null; }
}

export function canUseConsumableOutOfBattle(
  userId: string,
  inventoryId: number,
): { ok: boolean; reason?: string } {
  const row = getDb().prepare(`
    SELECT pi.quantity, i.category, i.battle_usable, i.battle_effect_json, i.name
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    quantity: number; category: string; battle_usable: number;
    battle_effect_json: string | null; name: string;
  } | undefined;

  if (!row) return { ok: false, reason: 'アイテムが見つかりません。' };
  if (row.category !== 'consumable') return { ok: false, reason: '消耗品のみ使用できます。' };
  if (row.quantity < 1) return { ok: false, reason: '数量が足りません。' };
  const effect = parseEffect(row.battle_effect_json);
  if (!effect) return { ok: false, reason: 'このアイテムは使用できません。' };

  const player = requirePlayer(userId);
  if (effect.type === 'heal_hp') {
    if (player.hp >= player.max_hp) return { ok: false, reason: 'HPは既に最大です。' };
  } else if (effect.type === 'heal_mp' || effect.type === 'restore_mp') {
    if (player.mp >= player.max_mp) return { ok: false, reason: 'MPは既に最大です。' };
  } else if (effect.type === 'cure_poison' || effect.type === 'cure_status') {
    const effects = getPlayerStatusEffects(userId);
    const hasPoison = effects.some((e) => e.effect_key === 'poison');
    if (!hasPoison && effect.type === 'cure_poison') {
      return { ok: false, reason: '毒状態ではありません。' };
    }
    if (effect.type === 'cure_status' && !effects.length) {
      return { ok: false, reason: '状態異常がありません。' };
    }
  } else {
    return { ok: false, reason: '町・探索中には使えないアイテムです。' };
  }
  return { ok: true };
}

export function useConsumableOutOfBattle(userId: string, inventoryId: number): { ok: boolean; message: string } {
  const check = canUseConsumableOutOfBattle(userId, inventoryId);
  if (!check.ok) return { ok: false, message: check.reason ?? '使用できません。' };

  const row = getDb().prepare(`
    SELECT pi.*, i.name, i.battle_effect_json
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as {
    name: string; battle_effect_json: string | null;
  };
  const effect = parseEffect(row.battle_effect_json)!;
  const player = requirePlayer(userId);
  let detail = '';

  if (effect.type === 'heal_hp') {
    const heal = effect.value ?? 50;
    const newHp = Math.min(player.max_hp, player.hp + heal);
    const gained = newHp - player.hp;
    getDb().prepare('UPDATE players SET hp = ?, updated_at = ? WHERE user_id = ?').run(newHp, nowIso(), userId);
    detail = `HPが${gained}回復した。（${newHp}/${player.max_hp}）`;
  } else if (effect.type === 'heal_mp' || effect.type === 'restore_mp') {
    const heal = effect.value ?? 30;
    const newMp = Math.min(player.max_mp, player.mp + heal);
    const gained = newMp - player.mp;
    getDb().prepare('UPDATE players SET mp = ?, updated_at = ? WHERE user_id = ?').run(newMp, nowIso(), userId);
    detail = `MPが${gained}回復した。（${newMp}/${player.max_mp}）`;
  } else if (effect.type === 'cure_poison') {
    setPlayerStatusEffect(userId, 'poison', 0);
    detail = '毒が治った。';
  } else if (effect.type === 'cure_status') {
    clearPlayerStatusEffects(userId);
    detail = '状態異常が治った。';
  }

  const consumed = getDb().prepare(`
    UPDATE player_inventory SET quantity = quantity - 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND quantity >= 1
  `).run(nowIso(), inventoryId, userId);
  if (consumed.changes === 0) {
    return { ok: false, message: 'アイテムの消費に失敗しました。' };
  }
  getDb().prepare('DELETE FROM player_inventory WHERE id = ? AND quantity <= 0').run(inventoryId);
  recalculatePlayerStats(userId);
  return { ok: true, message: `**${row.name}**を使った。\n${detail}` };
}

export function isInventoryItemUsableOutOfBattle(userId: string, inventoryId: number): boolean {
  return canUseConsumableOutOfBattle(userId, inventoryId).ok;
}
