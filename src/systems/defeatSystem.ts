import { getDb } from '../db/database';
import { requirePlayer, addExp, healPlayer, setPlayerTown } from './playerSystem';
import { losePendingRewards } from './inventorySystem';
import { DURABILITY_ORDER, type DurabilityState } from '../types';
import { nowIso } from '../types';
import { randomInt } from '../utils/random';

export function applyDefeat(userId: string, isBoss: boolean, _areaId: string | null): string {
  const player = requirePlayer(userId);
  const goldLossPct = isBoss ? 0.05 : 0.03 + Math.random() * 0.02;
  const goldLoss = Math.floor(player.gold * goldLossPct);

  const hasCharm = getDb().prepare(`
    SELECT pi.id AS inventory_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.id = 'cons_pilgrim_charm' AND pi.quantity > 0
    LIMIT 1
  `).get(userId) as { inventory_id: number } | undefined;

  let goldMsg = '';
  if (hasCharm) {
    getDb().prepare('UPDATE player_inventory SET quantity = quantity - 1 WHERE id = ?').run(hasCharm.inventory_id);
    goldMsg = '巡礼者の護符が所持金を守った。';
  } else {
    getDb().prepare('UPDATE players SET gold = MAX(0, gold - ?) WHERE user_id = ?').run(goldLoss, userId);
    goldMsg = `${goldLoss}Gを失った。`;
  }

  const lostItems = losePendingRewards(userId, isBoss ? 0.6 : 0.4);
  worsenEquipment(userId, isBoss ? 2 : 1);

  const returnTown = player.last_safe_town_id || player.current_town_id;
  setPlayerTown(userId, returnTown);
  const healRatio = isBoss ? 0.35 : 0.4;
  healPlayer(userId, healRatio);
  const defeatExp = randomInt(3, 8);
  addExp(userId, defeatExp);

  const town = getDb().prepare('SELECT name FROM towns WHERE id = ?').get(returnTown) as { name: string } | undefined;

  let msg = `灯火に導かれ、${town?.name ?? '安全な町'}へ帰還した。\n`;
  if (isBoss) msg = `強敵に屈し、${town?.name ?? '安全な町'}へ引き返した。\n`;
  msg += `${goldMsg}\n`;  if (lostItems.length) msg += `道中で得たものの一部を失った：${lostItems.join('、')}\n`;
  msg += `装備が劣化した可能性がある。\n+${defeatExp}EXP`;
  return msg;
}

function worsenEquipment(userId: string, steps: number): void {
  const equipped = getDb().prepare(`
    SELECT pi.id AS inventory_id, pi.durability_state FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id WHERE pe.user_id = ?
  `).all(userId) as Array<{ inventory_id: number; durability_state: DurabilityState }>;

  for (const eq of equipped) {
    if (Math.random() > 0.5) continue;
    const idx = DURABILITY_ORDER.indexOf(eq.durability_state);
    const newIdx = Math.min(DURABILITY_ORDER.length - 1, idx + steps);
    const newState = DURABILITY_ORDER[newIdx]!;
    if (newState !== eq.durability_state) {
      getDb().prepare('UPDATE player_inventory SET durability_state = ?, updated_at = ? WHERE id = ?').run(newState, nowIso(), eq.inventory_id);
      getDb().prepare('INSERT INTO durability_logs (user_id, inventory_id, old_state, new_state, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, eq.inventory_id, eq.durability_state, newState, 'defeat', nowIso());
    }
  }
}

export function createRescueWindow(userId: string, battleId: string): boolean {
  const session = getDb().prepare('SELECT id FROM battle_sessions WHERE id = ? AND user_id = ? AND status = ?').get(battleId, userId, 'defeat');
  return !!session;
}

