import { getDb } from '../db/database';
import { getDifficultyModifiers } from './difficultySystem';
import { requirePlayer } from './playerSystem';
import { getRecommendedElementsFromMonsters } from '../db/seedData/areaMaster';
import { formatElementHint } from './progressionSystem';
import { classifyAreaThreats, formatAreaThreatLabels, getMonsterRow } from './monsterBossSystem';
import { ELITE_MONSTER_IDS, TOUGH_MONSTER_IDS } from './combatMath';
import { ELEMENT_LABELS } from '../db/seedData/elementMaster';

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
  const monsters = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
  const rewards = JSON.parse(area.reward_pool_json) as Array<{ item_id: string }>;

  const db = getDb();
  const monNames: string[] = [];
  const monWeakHints: string[] = [];
  for (const m of monsters) {
    const mon = getMonsterRow(db, m.monster_id);
    if (mon) {
      if (monNames.length < 3) monNames.push(mon.name);
      const def = db.prepare('SELECT weaknesses_json FROM monsters WHERE id = ?').get(m.monster_id) as { weaknesses_json: string | null } | undefined;
      if (def?.weaknesses_json && monWeakHints.length < 3) {
        try {
          const wk = JSON.parse(def.weaknesses_json) as string[];
          if (wk[0]) monWeakHints.push(`${mon.name}: ${wk.slice(0, 2).map((w) => ELEMENT_LABELS[w as keyof typeof ELEMENT_LABELS] ?? w).join('・')}弱点`);
        } catch { /* ignore */ }
      }
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

  const threats = classifyAreaThreats(monsters);
  const threatLabels = formatAreaThreatLabels(threats);
  const danger = getDangerStars(player.level, area.recommended_min_level, area.recommended_max_level, threats.storyBoss || threats.midBoss, tier);
  const monsterEntries = monsters.map((m) => {
    const tagRow = db.prepare('SELECT area_tag FROM monsters WHERE id = ?').get(m.monster_id) as { area_tag: string } | undefined;
    return { monsterId: m.monster_id, areaTag: tagRow?.area_tag ?? 'starfield' };
  });
  const recommendedEl = formatElementHint(getRecommendedElementsFromMonsters(monsterEntries, area.town_id));

  const lines = [
    `**${area.name}**`,
    `推奨Lv: ${area.recommended_min_level}〜${area.recommended_max_level} | 危険度: ${danger}`,
    `おすすめ属性: ${recommendedEl}`,
    `主な敵: ${monNames.join('、') || '—'}`,
    `主な素材: ${matNames.slice(0, 4).join('、') || '—'}`,
  ];
  if (equipHints.length) lines.push(`主な装備: ${equipHints.slice(0, 3).join('、')}`);
  if (threatLabels.length) lines.push(`出現: ${threatLabels.join(' / ')}`);
  else lines.push('出現: 通常敵のみ');
  const eliteNames = monsters
    .filter((m) => ELITE_MONSTER_IDS.has(m.monster_id))
    .map((m) => getMonsterRow(db, m.monster_id)?.name)
    .filter(Boolean) as string[];
  const toughNames = monsters
    .filter((m) => TOUGH_MONSTER_IDS.has(m.monster_id) && !ELITE_MONSTER_IDS.has(m.monster_id))
    .map((m) => getMonsterRow(db, m.monster_id)?.name)
    .filter(Boolean) as string[];
  if (eliteNames.length) lines.push(`危険個体: ${[...new Set(eliteNames)].join('、')}`);
  if (toughNames.length) lines.push(`手強い敵: ${[...new Set(toughNames)].join('、')}`);
  if (threats.storyBoss) lines.push('ボス: 初回撃破で大きな経験値');
  if (monWeakHints.length) lines.push(`敵ごとの弱点: ${monWeakHints.join(' / ')}`);
  if (rareHint) lines.push('希少素材の気配: あり');
  if (player.level < area.recommended_min_level) lines.push('⚠ 推奨Lvより低い — 苦戦しやすい');
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
