import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { createBattle, getActiveBattle } from './battleSystem';
import { addItem } from './inventorySystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { underlevelWarning } from './difficultySystem';
import { incrementExploreAction } from './townSystem';
import { getMonsterThreatTier, getThreatLabel } from './combatMath';
import { weightedChoice, roll, randomInt } from '../utils/random';

export function getAreasForTown(townId: string) {
  return getDb().prepare('SELECT * FROM exploration_areas WHERE town_id = ? ORDER BY recommended_min_level').all(townId);
}

function canDropEquipment(userId: string, itemId: string, areaMinLv: number): boolean {
  const player = requirePlayer(userId);
  const item = getDb().prepare(`
    SELECT i.category, e.required_level FROM items i
    LEFT JOIN equipment e ON i.id = e.item_id
    WHERE i.id = ?
  `).get(itemId) as { category: string; required_level: number | null } | undefined;
  if (!item || item.category !== 'equipment') return true;
  const reqLv = item.required_level ?? 1;
  const deficit = areaMinLv - player.level;
  if (deficit <= 0) return true;
  if (deficit >= 4) return roll(0.12);
  if (deficit >= 2) return roll(0.35);
  return roll(0.55);
}

function pickRewardItem(userId: string, pool: Array<{ item_id: string; weight: number }>, areaMinLv: number): string | null {
  const eligible = pool.filter((p) => canDropEquipment(userId, p.item_id, areaMinLv));
  if (!eligible.length) return null;
  return weightedChoice(eligible).item_id;
}

export function exploreArea(userId: string, areaId: string): {
  type: 'battle' | 'material' | 'treasure' | 'npc_event' | 'nothing';
  message: string;
  battleId?: string;
} {
  const player = requirePlayer(userId);
  const area = getDb().prepare('SELECT * FROM exploration_areas WHERE id = ?').get(areaId) as {
    id: string; name: string; town_id: string; recommended_min_level: number; recommended_max_level: number;
    monster_pool_json: string; reward_pool_json: string; event_pool_json: string;
  } | undefined;
  if (!area) return { type: 'nothing', message: '探索先が見つかりません。' };
  if (player.current_town_id !== area.town_id) return { type: 'nothing', message: '現在地からは向かえません。' };

  const existing = getActiveBattle(userId);
  if (existing) return { type: 'battle', message: '既に戦いの最中です。', battleId: (existing as { id: string }).id };

  const warning = underlevelWarning(player.level, area.recommended_min_level);
  const prefix = warning ? `${warning}\n\n` : '';
  const levelDeficit = Math.max(0, area.recommended_min_level - player.level);

  const events = JSON.parse(area.event_pool_json) as Array<{ type: string; weight: number }>;
  let event = weightedChoice(events);
  if (levelDeficit >= 3 && event.type === 'treasure' && roll(0.35)) {
    event = { type: 'battle', weight: 1 };
  }

  incrementWeeklyProgress(userId, 'explore_count');
  incrementExploreAction(userId);

  switch (event.type) {
    case 'battle': {
      const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
      const pick = weightedChoice(pool);
      const threat = getMonsterThreatTier(pick.monster_id);
      const battleId = createBattle(userId, pick.monster_id, areaId, { isBoss: threat === 'boss' });
      const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(pick.monster_id) as { name: string };
      const threatLine = getThreatLabel(threat, mon.name);
      const lines = [`${prefix}${area.name}で${mon.name}に遭遇した。`];
      if (threatLine) lines.push(threatLine);
      if (levelDeficit >= 3) lines.push('⚠ 推奨Lvより低い — 敵の刃が鋭い。');
      return { type: 'battle', message: lines.join('\n'), battleId };
    }
    case 'material': {
      const pool = JSON.parse(area.reward_pool_json) as Array<{ item_id: string; weight: number }>;
      const itemId = pickRewardItem(userId, pool, area.recommended_min_level);
      if (!itemId) {
        return { type: 'nothing', message: `${prefix}${area.name}を調べたが、今の足取りでは手に入れられそうにない。` };
      }
      addItem(userId, itemId, randomInt(1, 3), { pending: true });
      const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string };
      return { type: 'material', message: `${prefix}${area.name}で${item.name}を見つけた。` };
    }
    case 'treasure': {
      const pool = JSON.parse(area.reward_pool_json) as Array<{ item_id: string; weight: number }>;
      if (levelDeficit >= 2 && roll(0.25 + levelDeficit * 0.05)) {
        const poolM = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
        const pick = weightedChoice(poolM);
        const battleId = createBattle(userId, pick.monster_id, areaId);
        const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(pick.monster_id) as { name: string };
        return {
          type: 'battle',
          message: `${prefix}箱を開けようとしたが、${mon.name}が待ち構えていた！`,
          battleId,
        };
      }
      if (roll(0.3)) {
        const itemId = pickRewardItem(userId, pool, area.recommended_min_level);
        if (itemId) {
          addItem(userId, itemId, 1, { pending: true });
          const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string };
          return { type: 'treasure', message: `${prefix}古い箱を見つけた。${item.name}を手に入れた。` };
        }
      }
      const gold = randomInt(10, 40 + area.recommended_min_level);
      getDb().prepare('UPDATE players SET gold = gold + ? WHERE user_id = ?').run(gold, userId);
      return { type: 'treasure', message: `${prefix}古い箱を見つけた。${gold}Gを拾った。` };
    }
    case 'npc_event':
      return { type: 'npc_event', message: `${prefix}${area.name}で、誰かの気配がした…` };
    default:
      return { type: 'nothing', message: `${prefix}${area.name}を歩いたが、特に何もなかった。` };
  }
}
