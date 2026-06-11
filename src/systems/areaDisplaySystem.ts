import { getDb } from '../db/database';
import { getDifficultyModifiers } from './difficultySystem';
import { requirePlayer } from './playerSystem';
import { getMonsterRow, isBossMonster } from './monsterBossSystem';

export function getAreaTier(areaId: string): 'early' | 'mid' | 'late' | 'valhalla' {
  const area = getDb().prepare('SELECT town_id, recommended_max_level FROM exploration_areas WHERE id = ?').get(areaId) as {
    town_id: string; recommended_max_level: number;
  } | undefined;
  if (!area) return 'early';
  if (area.town_id === 'valhalla_fortress') return 'valhalla';
  if (area.recommended_max_level >= 50) return 'late';
  if (area.recommended_max_level >= 25) return 'mid';
  return 'early';
}

export function getDangerStars(playerLevel: number, minLv: number, maxLv: number, hasBoss: boolean, tier: string): string {
  const diff = getDifficultyModifiers(playerLevel, minLv, maxLv);
  let stars = 1;
  if (diff.levelDeficit >= 2) stars = 3;
  else if (playerLevel < minLv) stars = 2;
  else if (playerLevel <= maxLv) stars = 2;
  if (hasBoss) stars = Math.min(3, stars + 1);
  if (tier === 'valhalla') stars = 3;
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function formatAreaDetail(userId: string, areaId: string): string {
  const area = getDb().prepare('SELECT * FROM exploration_areas WHERE id = ?').get(areaId) as {
    name: string; recommended_min_level: number; recommended_max_level: number;
    monster_pool_json: string; reward_pool_json: string; town_id: string;
  } | undefined;
  if (!area) return '探索先が見つかりません。';

  const player = requirePlayer(userId);
  const tier = getAreaTier(areaId);
  const monsters = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string }>;
  const rewards = JSON.parse(area.reward_pool_json) as Array<{ item_id: string }>;

  const db = getDb();
  const monNames: string[] = [];
  let hasBoss = false;
  for (const m of monsters.slice(0, 6)) {
    const mon = getMonsterRow(db, m.monster_id);
    if (mon) {
      monNames.push(mon.name);
      if (isBossMonster(m.monster_id, mon)) hasBoss = true;
    }
  }

  const matNames: string[] = [];
  const equipHints: string[] = [];
  let rareHint = false;
  for (const r of rewards.slice(0, 8)) {
    const item = getDb().prepare('SELECT name, category, rarity FROM items WHERE id = ?').get(r.item_id) as {
      name: string; category: string; rarity: string;
    } | undefined;
    if (!item) continue;
    if (item.category === 'equipment') equipHints.push(item.name);
    else if (item.rarity === 'UR' || item.rarity === 'Src' || item.category === 'src_core') rareHint = true;
    else if (['material', 'common_material', 'area_material', 'upgrade_stone'].includes(item.category)) {
      if (!matNames.includes(item.name)) matNames.push(item.name);
    }
  }

  const danger = getDangerStars(player.level, area.recommended_min_level, area.recommended_max_level, hasBoss, tier);

  const lines = [
    `**${area.name}**`,
    `推奨Lv: ${area.recommended_min_level}〜${area.recommended_max_level} | 危険度: ${danger}`,
    `主な敵: ${monNames.slice(0, 3).join('、') || '—'}`,
    `主な素材: ${matNames.slice(0, 4).join('、') || '—'}`,
  ];
  if (equipHints.length) lines.push(`主な装備: ${equipHints.slice(0, 3).join('、')}`);
  lines.push(`強敵: ${hasBoss ? 'あり' : 'なし'}`);
  if (rareHint) lines.push('希少素材の気配: あり');
  return lines.join('\n');
}

export function buildExploreAreaOptions(userId: string, areas: Array<{ id: string; name: string; recommended_min_level: number; recommended_max_level: number }>) {
  return areas.map((a) => {
    const tier = getAreaTier(a.id);
    const player = requirePlayer(userId);
    const danger = getDangerStars(player.level, a.recommended_min_level, a.recommended_max_level, false, tier);
    return {
      label: a.name,
      value: a.id,
      description: `推奨Lv${a.recommended_min_level}-${a.recommended_max_level} | ${danger}`.slice(0, 100),
    };
  });
}
