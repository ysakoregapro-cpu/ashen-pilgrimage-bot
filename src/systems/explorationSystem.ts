import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { createBattle, getActiveBattle } from './battleSystem';
import { addItem } from './inventorySystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { underlevelWarning } from './difficultySystem';
import { weightedChoice, roll, randomInt } from '../utils/random';

export function getAreasForTown(townId: string) {
  return getDb().prepare('SELECT * FROM exploration_areas WHERE town_id = ? ORDER BY recommended_min_level').all(townId);
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

  const events = JSON.parse(area.event_pool_json) as Array<{ type: string; weight: number }>;
  const event = weightedChoice(events);

  incrementWeeklyProgress(userId, 'explore_count');

  switch (event.type) {
    case 'battle': {
      const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
      const pick = weightedChoice(pool);
      const battleId = createBattle(userId, pick.monster_id, areaId);
      const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(pick.monster_id) as { name: string };
      return { type: 'battle', message: `${prefix}${area.name}で${mon.name}に遭遇した。`, battleId };
    }
    case 'material': {
      const pool = JSON.parse(area.reward_pool_json) as Array<{ item_id: string; weight: number }>;
      const pick = pool[randomInt(0, pool.length - 1)]!;
      addItem(userId, pick.item_id, randomInt(1, 3), { pending: true });
      const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(pick.item_id) as { name: string };
      return { type: 'material', message: `${prefix}${area.name}で${item.name}を見つけた。` };
    }
    case 'treasure': {
      const pool = JSON.parse(area.reward_pool_json) as Array<{ item_id: string; weight: number }>;
      const pick = pool[randomInt(0, pool.length - 1)]!;
      if (roll(0.3)) {
        addItem(userId, pick.item_id, 1, { pending: true });
        const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(pick.item_id) as { name: string };
        return { type: 'treasure', message: `${prefix}古い箱を見つけた。${item.name}を手に入れた。` };
      }
      const gold = randomInt(10, 50);
      getDb().prepare('UPDATE players SET gold = gold + ? WHERE user_id = ?').run(gold, userId);
      return { type: 'treasure', message: `${prefix}古い箱を見つけた。${gold}Gを拾った。` };
    }
    case 'npc_event':
      return { type: 'npc_event', message: `${prefix}${area.name}で、誰かの気配がした…` };
    default:
      return { type: 'nothing', message: `${prefix}${area.name}を歩いたが、特に何もなかった。` };
  }
}
