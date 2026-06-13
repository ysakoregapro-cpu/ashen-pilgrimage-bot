import { getDb } from '../db/database';
import { randomInt } from '../utils/random';
import { addItem, consumeMaterial } from './inventorySystem';
import {
  getExchangeById,
  getUiAvailableExchanges,
} from '../db/seedData/valhallaExchangeMaster';
import {
  SILENT_PAGE_ID,
  VALHALLA_EMBLEM_ID,
  VALHALLA_SERIES_ACCESSORY_DROP_IDS,
  VALHALLA_SERIES_ARMOR_DROP_IDS,
} from '../db/seedData/valhallaRewardMaster';

export type ExchangeAffordability = {
  ok: boolean;
  emblemHave: number;
  emblemNeed: number;
  pageHave: number;
  pageNeed: number;
  reason?: string;
};

function itemQty(userId: string, itemId: string): number {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS q FROM player_inventory WHERE user_id = ? AND item_id = ?
  `).get(userId, itemId) as { q: number };
  return row.q;
}

function itemName(itemId: string): string {
  const row = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string } | undefined;
  return row?.name ?? itemId;
}

export function getEmblemBalance(userId: string): number {
  return itemQty(userId, VALHALLA_EMBLEM_ID);
}

export function getSilentPageBalance(userId: string): number {
  return itemQty(userId, SILENT_PAGE_ID);
}

export function checkExchangeAffordability(userId: string, exchangeId: string): ExchangeAffordability {
  const entry = getExchangeById(exchangeId);
  if (!entry || !entry.ui_implemented || !entry.currently_available) {
    return { ok: false, emblemHave: 0, emblemNeed: 0, pageHave: 0, pageNeed: 0, reason: 'この交換はまだ利用できません。' };
  }
  const emblemHave = getEmblemBalance(userId);
  const pageHave = getSilentPageBalance(userId);
  if (emblemHave < entry.cost_valhalla_emblem) {
    return {
      ok: false,
      emblemHave,
      emblemNeed: entry.cost_valhalla_emblem,
      pageHave,
      pageNeed: entry.cost_silent_page,
      reason: `徽章が足りません。（${emblemHave}/${entry.cost_valhalla_emblem}）`,
    };
  }
  if (pageHave < entry.cost_silent_page) {
    return {
      ok: false,
      emblemHave,
      emblemNeed: entry.cost_valhalla_emblem,
      pageHave,
      pageNeed: entry.cost_silent_page,
      reason: `無答の守護者の頁が足りません。（${pageHave}/${entry.cost_silent_page}）`,
    };
  }
  return {
    ok: true,
    emblemHave,
    emblemNeed: entry.cost_valhalla_emblem,
    pageHave,
    pageNeed: entry.cost_silent_page,
  };
}

function pickRandom(pool: readonly string[]): string {
  return pool[randomInt(0, pool.length - 1)]!;
}

function grantExchangeEquipment(userId: string, itemId: string): string {
  addItem(userId, itemId, 1, { pending: true, rollSource: 'valhalla_reward', valhallaOrRaid: true });
  return itemName(itemId);
}

export function executeValhallaExchange(
  userId: string,
  exchangeId: string,
  selectedItemId?: string,
): { ok: boolean; message: string } {
  const entry = getExchangeById(exchangeId);
  if (!entry || !entry.ui_implemented || !entry.currently_available) {
    return { ok: false, message: 'この交換はまだ利用できません。' };
  }
  const afford = checkExchangeAffordability(userId, exchangeId);
  if (!afford.ok) return { ok: false, message: afford.reason ?? '交換できません。' };

  let receiveLabel = '';
  let receiveItemId = entry.receive_item_id;

  if (entry.receive_type === 'material') {
    receiveItemId = entry.receive_item_id;
    receiveLabel = itemName(receiveItemId);
  } else if (entry.exchange_id === 'vex_armor_random') {
    receiveItemId = pickRandom(VALHALLA_SERIES_ARMOR_DROP_IDS);
    receiveLabel = grantExchangeEquipment(userId, receiveItemId);
  } else if (entry.exchange_id === 'vex_accessory_random') {
    receiveItemId = pickRandom(VALHALLA_SERIES_ACCESSORY_DROP_IDS);
    receiveLabel = grantExchangeEquipment(userId, receiveItemId);
  } else if (entry.exchange_id === 'vex_armor_select' || entry.exchange_id === 'vex_accessory_select') {
    if (!selectedItemId) return { ok: false, message: '交換する装備を選んでください。' };
    const pool = entry.exchange_id === 'vex_armor_select'
      ? VALHALLA_SERIES_ARMOR_DROP_IDS
      : VALHALLA_SERIES_ACCESSORY_DROP_IDS;
    if (!(pool as readonly string[]).includes(selectedItemId)) {
      return { ok: false, message: '選択できない装備です。' };
    }
    receiveItemId = selectedItemId;
    receiveLabel = grantExchangeEquipment(userId, receiveItemId);
  } else {
    return { ok: false, message: '未実装の交換です。' };
  }

  const db = getDb();
  const result = db.transaction(() => {
    if (!consumeMaterial(userId, VALHALLA_EMBLEM_ID, entry.cost_valhalla_emblem)) return false;
    if (entry.cost_silent_page > 0 && !consumeMaterial(userId, SILENT_PAGE_ID, entry.cost_silent_page)) return false;
    if (entry.receive_type === 'material') {
      addItem(userId, receiveItemId, entry.receive_amount);
    }
    return true;
  })();

  if (!result) return { ok: false, message: '交換処理に失敗しました。' };

  const costParts = [`徽章×${entry.cost_valhalla_emblem}`];
  if (entry.cost_silent_page > 0) costParts.push(`無答の頁×${entry.cost_silent_page}`);

  if (entry.receive_type === 'material') {
    return {
      ok: true,
      message: `${costParts.join(' + ')} を支払い、**${receiveLabel}×${entry.receive_amount}** を受け取った。`,
    };
  }
  return {
    ok: true,
    message: `${costParts.join(' + ')} を支払い、**${receiveLabel}** を受け取った。`,
  };
}

export function formatExchangeListText(userId: string): string {
  const emblem = getEmblemBalance(userId);
  const pages = getSilentPageBalance(userId);
  const lines = getUiAvailableExchanges().map((e) => {
    const afford = checkExchangeAffordability(userId, e.exchange_id);
    const mark = afford.ok ? '✅' : '❌';
    const pageCost = e.cost_silent_page > 0 ? ` + 頁${e.cost_silent_page}` : '';
    return `${mark} **${e.receive_item_name}** — 徽章${e.cost_valhalla_emblem}${pageCost}`;
  });
  return [
    '**ヴァルハラ徽章交換所**',
    `所持: 徽章 **${emblem}** / 無答の頁 **${pages}**`,
    '',
    ...lines,
    '',
    '※150徽章+頁3（UR抽選）/ 200徽章（特性再抽選）/ 300徽章+頁1（特性保護）は将来Phase',
  ].join('\n');
}

export { getUiAvailableExchanges };
