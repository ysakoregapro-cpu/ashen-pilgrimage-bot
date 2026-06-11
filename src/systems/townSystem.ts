import { getDb } from '../db/database';
import { getUnlockedTowns, requirePlayer, addExp } from './playerSystem';
import { finalizeExplorationLoot } from './inventorySystem';
import { calcExploreReturnBonus, formatExpProgressBlock } from './expSystem';
import { canTravelToTown } from './progressionGates';
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

export function incrementExploreAction(userId: string): void {
  getDb().prepare('UPDATE players SET explore_actions_since_town = COALESCE(explore_actions_since_town, 0) + 1, updated_at = ? WHERE user_id = ?')
    .run(nowIso(), userId);
}

function grantExploreReturnBonus(userId: string, townId: string): string {
  const row = getDb().prepare(`
    SELECT explore_actions_since_town, level FROM players WHERE user_id = ?
  `).get(userId) as { explore_actions_since_town: number | null; level: number } | undefined;
  const actions = row?.explore_actions_since_town ?? 0;
  getDb().prepare('UPDATE players SET explore_actions_since_town = 0, updated_at = ? WHERE user_id = ?').run(nowIso(), userId);
  if (actions < 2) return '';

  const avgRow = getDb().prepare(`
    SELECT AVG(m.exp_reward) AS avgExp, AVG(a.recommended_min_level) AS minLv, AVG(a.recommended_max_level) AS maxLv
    FROM exploration_areas a
    JOIN json_each(a.monster_pool_json) je
    JOIN monsters m ON m.id = json_extract(je.value, '$.monster_id')
    WHERE a.town_id = ?
  `).get(townId) as { avgExp: number; minLv: number; maxLv: number } | undefined;

  const avgExp = Math.floor(avgRow?.avgExp ?? 15);
  const inBand = row!.level >= (avgRow?.minLv ?? 1) && row!.level <= (avgRow?.maxLv ?? 99);
  const bonus = calcExploreReturnBonus(avgExp, actions, inBand);
  if (bonus <= 0) return '';
  const result = addExp(userId, bonus);
  let msg = `探索から無事帰還。探索完了ボーナス: 経験値 +${bonus}`;
  msg += `\n${formatExpProgressBlock(bonus, result)}`;
  return msg;
}

export function travelToTown(userId: string, townId: string): string {
  const gate = canTravelToTown(userId, townId);
  if (!gate.ok) return gate.reason ?? 'その町へは、まだ道が通っていない。';

  const player = requirePlayer(userId);
  const town = getTown(townId) as { id: string; name: string; required_level: number } | undefined;
  if (!town) return 'その町は見つかりません。';

  const loot = finalizeExplorationLoot(userId);
  setPlayerTown(userId, townId);
  getDb().prepare('UPDATE players SET last_safe_town_id = ?, updated_at = ? WHERE user_id = ?')
    .run(townId, nowIso(), userId);
  recordTownVisit(userId, townId);

  let msg = `${town.name}に着いた。`;
  const exploreBonus = grantExploreReturnBonus(userId, player.current_town_id);
  if (exploreBonus) msg += `\n\n${exploreBonus}`;
  if (loot.message) msg += `\n\n${loot.message}`;
  return msg;
}

export function returnToTownHub(userId: string): string {
  const player = requirePlayer(userId);
  const loot = finalizeExplorationLoot(userId);
  const exploreBonus = grantExploreReturnBonus(userId, player.current_town_id);
  const parts = [exploreBonus, loot.message].filter(Boolean);
  return parts.join('\n\n');
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
