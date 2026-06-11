import { getDb } from '../db/database';
import { getUnlockedTowns, requirePlayer } from './playerSystem';
import { finalizeExplorationLoot } from './inventorySystem';
import { nowIso } from '../types';

export function setPlayerTown(userId: string, townId: string): void {
  getDb().prepare('UPDATE players SET current_town_id = ?, updated_at = ? WHERE user_id = ?').run(townId, nowIso(), userId);
}

export function recordTownVisit(userId: string, townId: string): boolean {
  const ts = nowIso();
  const existing = getDb().prepare('SELECT visit_count FROM player_town_visits WHERE user_id = ? AND town_id = ?')
    .get(userId, townId) as { visit_count: number } | undefined;
  if (!existing) {
    getDb().prepare(`
      INSERT INTO player_town_visits (user_id, town_id, visit_count, first_visit_at, last_visit_at) VALUES (?, ?, 1, ?, ?)
    `).run(userId, townId, ts, ts);
    return true;
  }
  getDb().prepare(`
    UPDATE player_town_visits SET visit_count = visit_count + 1, last_visit_at = ? WHERE user_id = ? AND town_id = ?
  `).run(ts, userId, townId);
  return false;
}

export function getVisitCount(userId: string, townId: string): number {
  const row = getDb().prepare('SELECT visit_count FROM player_town_visits WHERE user_id = ? AND town_id = ?')
    .get(userId, townId) as { visit_count: number } | undefined;
  return row?.visit_count ?? 0;
}

export function getTown(townId: string) {
  return getDb().prepare('SELECT * FROM towns WHERE id = ?').get(townId);
}

export function getAllTowns() {
  return getDb().prepare('SELECT * FROM towns ORDER BY required_level').all();
}

export function getTownNpcs(townId: string) {
  return getDb().prepare('SELECT * FROM npcs WHERE town_id = ? ORDER BY name').all(townId);
}

export function travelToTown(userId: string, townId: string): string {
  const player = requirePlayer(userId);
  const town = getTown(townId) as { id: string; name: string; required_level: number } | undefined;
  if (!town) return 'その町は見つかりません。';
  const unlocked = getUnlockedTowns(userId);
  if (!unlocked.includes(townId)) return `${town.name}へは、まだ道が通っていない。`;
  if (player.level < town.required_level) return `${town.name}へ向かうには、もう少し旅の経験が必要だ。`;

  const loot = finalizeExplorationLoot(userId);
  setPlayerTown(userId, townId);
  getDb().prepare('UPDATE players SET last_safe_town_id = ?, updated_at = ? WHERE user_id = ?')
    .run(townId, nowIso(), userId);
  recordTownVisit(userId, townId);

  let msg = `${town.name}に着いた。`;
  if (loot.message) msg += `\n\n${loot.message}`;
  return msg;
}

export function returnToTownHub(userId: string): string {
  const loot = finalizeExplorationLoot(userId);
  return loot.message || '';
}

export function getCurrentTown(userId: string) {
  const player = requirePlayer(userId);
  return getTown(player.current_town_id);
}

export function unlockTownForPlayer(userId: string, townId: string): boolean {
  const town = getTown(townId);
  if (!town) return false;
  getDb().prepare('INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at) VALUES (?, ?, ?)')
    .run(userId, townId, new Date().toISOString());
  return true;
}
