import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { hasStoryFlag } from './storySystem';
import { STORY_TOWN_UNLOCKS } from '../db/seedData/progressionMaster';

/** Town travel requires story unlock — level alone is never enough for new towns */
export function canTravelToTown(userId: string, townId: string): { ok: boolean; reason?: string } {
  const player = requirePlayer(userId);
  const town = getDb().prepare('SELECT name, required_level FROM towns WHERE id = ?').get(townId) as {
    name: string; required_level: number;
  } | undefined;
  if (!town) return { ok: false, reason: 'その町は見つかりません。' };

  const unlocked = getDb().prepare('SELECT 1 FROM player_town_unlocks WHERE user_id = ? AND town_id = ?')
    .get(userId, townId);
  if (!unlocked) {
    const flagEntry = Object.entries(STORY_TOWN_UNLOCKS).find(([, t]) => t === townId);
    const hint = flagEntry ? '物語を進めると道が開く。' : 'まだ道が通っていない。';
    return { ok: false, reason: `${town.name}へは、${hint}` };
  }

  if (player.level < town.required_level) {
    return { ok: false, reason: `${town.name}へ向かうには Lv${town.required_level} 以上が必要だ。（現在 Lv${player.level}）` };
  }

  if (townId === 'valhalla_fortress') {
    return canEnterValhalla(userId);
  }

  return { ok: true };
}

export function canEnterValhalla(userId: string): { ok: boolean; reason?: string } {
  const player = requirePlayer(userId);
  const checks: Array<[boolean, string]> = [
    [player.level >= 80, 'Lv80以上が必要だ。'],
    [hasStoryFlag(userId, 'chapter_completed:ch7_furnace'), '第七章（深層炉）をクリアする必要がある。'],
    [hasStoryFlag(userId, 'boss_defeated:boss_old_furnace_keeper'), '深層炉の番人を倒す必要がある。'],
    [hasSrcWeapon(userId), 'Src武器を1つ以上所持している必要がある。'],
    [hasStoryFlag(userId, 'valhalla_unlocked'), 'カイによるSrc昇華でヴァルハラへの道を開く必要がある。'],
  ];
  for (const [ok, msg] of checks) {
    if (!ok) return { ok: false, reason: `ヴァルハラへ向かうには、${msg}` };
  }
  return { ok: true };
}

export function hasSrcWeapon(userId: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND (i.rarity = 'Src' OR pi.src_level > 0) LIMIT 1
  `).get(userId);
  return !!row;
}

export function hasUniqueWeapon(userId: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND (e.is_unique = 1 OR pi.metadata_json LIKE '%kai_unique%')
    LIMIT 1
  `).get(userId);
  return !!row;
}
