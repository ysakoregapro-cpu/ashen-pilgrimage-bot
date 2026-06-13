import { getDb } from '../db/database';
import { requirePlayer, addGold } from './playerSystem';
import { createBattle, getActiveBattle } from './battleSystem';
import { pickEncounterMonsters } from './multiEncounter';
import { addItem } from './inventorySystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { underlevelWarning } from './difficultySystem';
import { incrementExploreAction } from './townSystem';
import { applyExplorationStatusTick } from './playerStatusSystem';
import { getMonsterThreatTier, getThreatLabel } from './combatMath';
import { weightedChoice, roll, randomInt } from '../utils/random';
import {
  filterExplorationMonsterPool,
  formatBossExploreIntro,
  shouldStartExploreAsBossBattle,
} from './bossEncounterSystem';
import {
  getAreaLootTier, rollChestLoot, resolveEquipSlot, pickEquipmentFromAreaPool, pickMaterialFromPool,
} from './equipmentDropSystem';
import { buildEffectiveRewardPool, pickTownLoot } from './townLootSystem';
import { rollValhallaExploreSeriesDrop } from './valhallaSeriesDropSystem';

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

export function exploreArea(userId: string, areaId: string): {
  type: 'battle' | 'material' | 'treasure' | 'npc_event' | 'nothing';
  message: string;
  battleId?: string;
  bossEncounter?: boolean;
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

  const statusTick = applyExplorationStatusTick(userId);
  const statusPrefix = statusTick.message ? `${statusTick.message}\n\n` : '';

  switch (event.type) {
    case 'battle': {
      const pool = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
      const filteredPool = filterExplorationMonsterPool(userId, pool);
      const monsterIds = pickEncounterMonsters(filteredPool, areaId);
      if (!monsterIds.length) {
        return { type: 'nothing', message: `${statusPrefix}${prefix}${area.name}を歩いたが、特に何もなかった。` };
      }
      const pick = monsterIds[0]!;
      const isBoss = shouldStartExploreAsBossBattle(userId, pick);
      const battleId = createBattle(userId, monsterIds, areaId, { isBoss });
      const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(pick) as { name: string };
      if (isBoss) {
        return {
          type: 'battle',
          message: formatBossExploreIntro(area.name, mon.name, `${area.name}の奥で、${mon.name}が立ちはだかった。`),
          battleId,
          bossEncounter: true,
        };
      }
      const threat = getMonsterThreatTier(pick);
      const names = monsterIds.map((id) => {
        const m = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(id) as { name: string };
        return m.name;
      });
      const threatLine = getThreatLabel(threat, names[0] ?? '');
      const lines = [`${statusPrefix}${prefix}${area.name}で${names.join('と')}に遭遇した。`];
      if (threatLine) lines.push(threatLine);
      if (levelDeficit >= 3) lines.push('⚠ 推奨Lvより低い — 敵の刃が鋭い。');
      return { type: 'battle', message: lines.join('\n'), battleId };
    }
    case 'material': {
      const loot = pickTownLoot(userId, area.town_id, areaId, { categories: ['material', 'consumable', 'gold'] });
      if (loot.kind === 'none') {
        return { type: 'nothing', message: `${statusPrefix}${prefix}${area.name}を調べたが、特に目ざわりなものは見つからなかった。` };
      }
      if (loot.kind === 'gold') {
        addGold(userId, loot.amount);
        return { type: 'material', message: `${statusPrefix}${prefix}${area.name}で${loot.amount}Gを拾った。` };
      }
      addItem(userId, loot.itemId, randomInt(1, 3), { pending: true });
      const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(loot.itemId) as { name: string };
      return { type: 'material', message: `${statusPrefix}${prefix}${area.name}で${item.name}を見つけた。` };
    }
    case 'treasure': {
      const pool = buildEffectiveRewardPool(area.town_id, areaId);
      if (levelDeficit >= 2 && roll(0.25 + levelDeficit * 0.05)) {
        const poolM = JSON.parse(area.monster_pool_json) as Array<{ monster_id: string; weight: number }>;
        const filteredPoolM = filterExplorationMonsterPool(userId, poolM);
        const monsterIds = pickEncounterMonsters(filteredPoolM, areaId, { forceSingle: true });
        if (!monsterIds.length) {
          return { type: 'nothing', message: `${statusPrefix}${prefix}箱の影に何もなかった。` };
        }
        const pick = monsterIds[0]!;
        const isBoss = shouldStartExploreAsBossBattle(userId, pick);
        const battleId = createBattle(userId, monsterIds, areaId, { isBoss });
        const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(pick) as { name: string };
        if (isBoss) {
          return {
            type: 'battle',
            message: formatBossExploreIntro(area.name, mon.name, `箱を開けようとしたが、${mon.name}が立ちはだかった！`),
            battleId,
            bossEncounter: true,
          };
        }
        return {
          type: 'battle',
          message: `${statusPrefix}${prefix}箱を開けようとしたが、${mon.name}が待ち構えていた！`,
          battleId,
        };
      }
      const lootTier = getAreaLootTier(area.recommended_min_level, area.town_id);
      const rareValhalla = rollValhallaExploreSeriesDrop(areaId, area.town_id);
      if (rareValhalla && canDropEquipment(userId, rareValhalla, area.recommended_min_level)) {
        addItem(userId, rareValhalla, 1, { pending: true, rollSource: 'valhalla_reward', valhallaOrRaid: true });
        const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(rareValhalla) as { name: string };
        return { type: 'treasure', message: `${statusPrefix}${prefix}古い箱の奥に${item.name}が眠っていた。` };
      }
      const chestRoll = rollChestLoot(lootTier);
      if (chestRoll.kind === 'material') {
        const itemId = pickMaterialFromPool(pool);
        if (itemId) {
          addItem(userId, itemId, randomInt(1, 2), { pending: true });
          const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string };
          return { type: 'treasure', message: `${statusPrefix}${prefix}古い箱を見つけた。${item.name}を手に入れた。` };
        }
      } else if (chestRoll.rarity) {
        const slot = resolveEquipSlot();
        const itemId = pickEquipmentFromAreaPool(pool, chestRoll.rarity, slot);
        if (itemId && canDropEquipment(userId, itemId, area.recommended_min_level)) {
          addItem(userId, itemId, 1, { pending: true, rollSource: 'chest' });
          const item = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string };
          return { type: 'treasure', message: `${statusPrefix}${prefix}古い箱を見つけた。${item.name}を手に入れた。` };
        }
      }
      const gold = randomInt(10, 40 + area.recommended_min_level);
      getDb().prepare('UPDATE players SET gold = gold + ? WHERE user_id = ?').run(gold, userId);
      return { type: 'treasure', message: `${statusPrefix}${prefix}古い箱を見つけた。${gold}Gを拾った。` };
    }
    case 'npc_event':
      return { type: 'npc_event', message: `${statusPrefix}${prefix}${area.name}で、誰かの気配がした…` };
    default:
      return { type: 'nothing', message: `${statusPrefix}${prefix}${area.name}を歩いたが、特に何もなかった。` };
  }
}
