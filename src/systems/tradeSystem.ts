import { getDb } from '../db/database';
import { nowIso } from '../types';
import { uuid } from '../utils/random';
import { incrementWeeklyProgress } from './weeklySystem';

export function createTrade(guildId: string, initiatorId: string, partnerId: string): string {
  if (initiatorId === partnerId) throw new Error('自分自身とは取引できません。');
  const id = uuid();
  getDb().prepare(`
    INSERT INTO trades (id, guild_id, initiator_id, partner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, guildId, initiatorId, partnerId, nowIso(), nowIso());
  return id;
}

export function getTrade(tradeId: string) {
  return getDb().prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
}

import { canPerformItemAction } from './itemProtectionSystem';

export function addTradeItem(tradeId: string, userId: string, inventoryId: number, quantity = 1): string {
  const prot = canPerformItemAction(inventoryId, userId, 'trade');
  if (!prot.ok) return prot.reason ?? '取引できません。';

  const trade = getTrade(tradeId) as { initiator_id: string; partner_id: string; status: string; initiator_items_json: string; partner_items_json: string } | undefined;
  if (!trade || trade.status !== 'pending') return '取引が見つかりません。';

  const inv = getDb().prepare(`
    SELECT pi.*, i.name, i.tradeable, i.category, i.rarity FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id WHERE pi.id = ? AND pi.user_id = ?
  `).get(inventoryId, userId) as { name: string; tradeable: number; is_equipped: number; category: string; rarity: string; item_id: string; quantity: number } | undefined;
  if (!inv) return 'アイテムが見つかりません。';
  if (inv.is_equipped) return '装備中のアイテムは取引できません。';
  if ((inv as { is_pending_reward?: number }).is_pending_reward) return '道中で得た品は、町へ戻るまで取引できない。';
  if ((inv as { is_listed?: number }).is_listed) return '出品中のアイテムは取引できません。';
  if (!inv.tradeable) return 'それは、この旅に深く結びついた品だ。手放すことはできない。';
  if (inv.rarity === 'Src' && inv.category === 'equipment') return 'Src本体は取引できません。';

  const item = { inventory_id: inventoryId, item_id: inv.item_id, name: inv.name, quantity };
  const isInitiator = trade.initiator_id === userId;
  const key = isInitiator ? 'initiator_items_json' : 'partner_items_json';
  const items = JSON.parse(trade[key]) as typeof item[];
  items.push(item);
  getDb().prepare(`UPDATE trades SET ${key} = ?, initiator_confirmed = 0, partner_confirmed = 0, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(items), nowIso(), tradeId);
  return `「${inv.name}」x${quantity}を取引に追加しました。`;
}

export function confirmTrade(tradeId: string, userId: string): string {
  const trade = getTrade(tradeId) as {
    initiator_id: string; partner_id: string; status: string;
    initiator_items_json: string; partner_items_json: string;
    initiator_confirmed: number; partner_confirmed: number;
  } | undefined;
  if (!trade || trade.status !== 'pending') return '取引が見つかりません。';

  const isInitiator = trade.initiator_id === userId;
  if (isInitiator) getDb().prepare('UPDATE trades SET initiator_confirmed = 1, updated_at = ? WHERE id = ?').run(nowIso(), tradeId);
  else if (trade.partner_id === userId) getDb().prepare('UPDATE trades SET partner_confirmed = 1, updated_at = ? WHERE id = ?').run(nowIso(), tradeId);
  else return 'この取引の当事者ではありません。';

  const updated = getTrade(tradeId) as { initiator_confirmed: number; partner_confirmed: number };
  if (updated.initiator_confirmed && updated.partner_confirmed) {
    return executeTrade(tradeId);
  }
  return '確認しました。相手の確認を待っています。';
}

function executeTrade(tradeId: string): string {
  const trade = getTrade(tradeId) as {
    initiator_id: string; partner_id: string;
    initiator_items_json: string; partner_items_json: string;
  };
  const db = getDb();
  const transfer = (from: string, to: string, items: Array<{ inventory_id: number; quantity: number; name: string }>) => {
    for (const item of items) {
      db.prepare('UPDATE player_inventory SET user_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(to, nowIso(), item.inventory_id, from);
    }
  };

  const initItems = JSON.parse(trade.initiator_items_json) as Array<{ inventory_id: number; quantity: number; name: string }>;
  const partItems = JSON.parse(trade.partner_items_json) as Array<{ inventory_id: number; quantity: number; name: string }>;
  transfer(trade.initiator_id, trade.partner_id, initItems);
  transfer(trade.partner_id, trade.initiator_id, partItems);

  db.prepare("UPDATE trades SET status = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), tradeId);
  incrementWeeklyProgress(trade.initiator_id, 'trade_count');
  incrementWeeklyProgress(trade.partner_id, 'trade_count');
  return '取引が成立しました！';
}

export function cancelTrade(tradeId: string, userId: string): string {
  const trade = getTrade(tradeId) as { initiator_id: string; partner_id: string; status: string } | undefined;
  if (!trade || trade.status !== 'pending') return '取引が見つかりません。';
  if (trade.initiator_id !== userId && trade.partner_id !== userId) return 'この取引の当事者ではありません。';
  getDb().prepare("UPDATE trades SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), tradeId);
  return '取引をキャンセルしました。';
}

export function getActiveTradeForUser(userId: string) {
  return getDb().prepare(`
    SELECT * FROM trades WHERE (initiator_id = ? OR partner_id = ?) AND status = 'pending' ORDER BY created_at DESC LIMIT 1
  `).get(userId, userId);
}
