import { getDb } from '../db/database';
import { randomInt, roll, weightedChoice } from '../utils/random';
import { addItem } from './inventorySystem';
import { setStoryFlag } from './storySystem';
import type { AffixRollSource } from '../db/seedData/equipmentAffixMaster';
import {
  AFFIX_REROLL_ASSIST_ID,
  SILENT_PAGE_ID,
  UR_LOTTERY_SHARD_ID,
  VALHALLA_ACCESSORY_DROP_IDS,
  VALHALLA_ARMOR_DROP_IDS,
  VALHALLA_EMBLEM_ID,
  VALHALLA_FIRST_CLEAR_REWARDS,
  VALHALLA_REPEAT_MATERIAL_POOL,
  VALHALLA_REPEAT_REWARDS,
  isValhallaBossMonster,
  type ValhallaBossId,
} from '../db/seedData/valhallaRewardMaster';

export { isValhallaBossMonster };

export type ValhallaBossRewardResult = {
  exp: number;
  gold: number;
  jobExp: number;
  dropLabels: string[];
};

type SessionLike = { monster_id: string; is_boss: number; area_id: string | null };
type StateLike = { isRematch?: boolean };

function itemName(itemId: string): string {
  const row = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string } | undefined;
  return row?.name ?? itemId;
}

function pickValhallaGear(kind: 'armor' | 'accessory' | 'either'): string {
  if (kind === 'either') kind = roll(0.55) ? 'armor' : 'accessory';
  const pool = kind === 'armor' ? [...VALHALLA_ARMOR_DROP_IDS] : [...VALHALLA_ACCESSORY_DROP_IDS];
  return pool[randomInt(0, pool.length - 1)]!;
}

function grantValhallaEquipment(
  userId: string,
  itemId: string,
  rollSource: AffixRollSource = 'valhalla_reward',
): string {
  addItem(userId, itemId, 1, { pending: true, rollSource, valhallaOrRaid: true });
  return itemName(itemId);
}

function rollRate(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function grantValhallaBossRewards(
  userId: string,
  session: SessionLike,
  state: StateLike,
  opts: { firstClear: boolean },
): ValhallaBossRewardResult {
  if (!isValhallaBossMonster(session.monster_id)) {
    throw new Error(`Not a valhalla boss: ${session.monster_id}`);
  }
  const monsterId = session.monster_id as ValhallaBossId;
  const dropLabels: string[] = [];
  const fc = VALHALLA_FIRST_CLEAR_REWARDS;
  const rp = VALHALLA_REPEAT_REWARDS;

  if (opts.firstClear) {
    const exp = randomInt(fc.expMin, fc.expMax);
    const gold = randomInt(fc.goldMin, fc.goldMax);
    const jobExp = randomInt(fc.jobExpMin, fc.jobExpMax);

    addItem(userId, VALHALLA_EMBLEM_ID, fc.emblem, { pending: true });
    dropLabels.push(`${itemName(VALHALLA_EMBLEM_ID)}×${fc.emblem}`);
    addItem(userId, SILENT_PAGE_ID, fc.silentPage, { pending: true });
    dropLabels.push(`${itemName(SILENT_PAGE_ID)}×${fc.silentPage}`);
    const gearId = pickValhallaGear('either');
    dropLabels.push(grantValhallaEquipment(userId, gearId));

    setStoryFlag(userId, `${fc.storyFlagPrefix}:${monsterId}`);
    setStoryFlag(userId, `${fc.achievementFlagPrefix}:${monsterId}`);

    return { exp, gold, jobExp, dropLabels };
  }

  const exp = randomInt(rp.expMin, rp.expMax);
  const gold = randomInt(rp.goldMin, rp.goldMax);
  const jobExp = randomInt(rp.jobExpMin, rp.jobExpMax);
  const emblemQty = randomInt(rp.emblemMin, rp.emblemMax);
  addItem(userId, VALHALLA_EMBLEM_ID, emblemQty, { pending: true });
  dropLabels.push(`${itemName(VALHALLA_EMBLEM_ID)}×${emblemQty}`);

  const matCount = randomInt(rp.materialCountMin, rp.materialCountMax);
  for (let i = 0; i < matCount; i++) {
    const pick = weightedChoice(VALHALLA_REPEAT_MATERIAL_POOL.map((m) => ({ item_id: m.itemId, weight: m.weight })));
    addItem(userId, pick.item_id, 1, { pending: true });
    dropLabels.push(itemName(pick.item_id));
  }

  if (roll(rollRate(rp.armorRateMin, rp.armorRateMax))) {
    dropLabels.push(grantValhallaEquipment(userId, pickValhallaGear('armor')));
  } else if (roll(rollRate(rp.accessoryRateMin, rp.accessoryRateMax))) {
    dropLabels.push(grantValhallaEquipment(userId, pickValhallaGear('accessory')));
  }

  if (roll(rp.silentPageRate)) {
    addItem(userId, SILENT_PAGE_ID, 1, { pending: true });
    dropLabels.push(itemName(SILENT_PAGE_ID));
  }
  if (roll(rollRate(rp.urLotteryRateMin, rp.urLotteryRateMax))) {
    addItem(userId, UR_LOTTERY_SHARD_ID, 1, { pending: true });
    dropLabels.push(itemName(UR_LOTTERY_SHARD_ID));
  }
  if (roll(rollRate(rp.affixRerollAssistRateMin, rp.affixRerollAssistRateMax))) {
    addItem(userId, AFFIX_REROLL_ASSIST_ID, 1, { pending: true });
    dropLabels.push(itemName(AFFIX_REROLL_ASSIST_ID));
  }

  return { exp, gold, jobExp, dropLabels };
}
