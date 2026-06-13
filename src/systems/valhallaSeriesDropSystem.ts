import { randomInt, roll } from '../utils/random';
import {
  OLD_KING_DEEP_SERIES_DROP,
  OLD_KING_SERIES_ACCESSORY_IDS,
  OLD_KING_SERIES_ARMOR_IDS,
  VALHALLA_DEEP_AREA_IDS,
  VALHALLA_EXPLORE_SERIES_DROP,
  VALHALLA_SERIES_ACCESSORY_IDS,
  VALHALLA_SERIES_ARMOR_IDS,
} from '../db/seedData/valhallaSeriesDropMaster';

function rollRate(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickArmorOrAccessory(
  armorIds: readonly string[],
  accessoryIds: readonly string[],
): string {
  if (roll(0.62)) {
    return armorIds[randomInt(0, armorIds.length - 1)]!;
  }
  return accessoryIds[randomInt(0, accessoryIds.length - 1)]!;
}

/** ヴァルハラ探索道中の超低確率シリーズドロップ（おまけ） */
export function rollValhallaExploreSeriesDrop(areaId: string, townId: string): string | null {
  if (townId !== 'valhalla_fortress') return null;

  const isDeep = (VALHALLA_DEEP_AREA_IDS as readonly string[]).includes(areaId);
  if (isDeep && roll(rollRate(OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMin, OLD_KING_DEEP_SERIES_DROP.armorOrAccessoryRateMax))) {
    return pickArmorOrAccessory(OLD_KING_SERIES_ARMOR_IDS, OLD_KING_SERIES_ACCESSORY_IDS);
  }
  if (roll(rollRate(VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMin, VALHALLA_EXPLORE_SERIES_DROP.armorOrAccessoryRateMax))) {
    return pickArmorOrAccessory(VALHALLA_SERIES_ARMOR_IDS, VALHALLA_SERIES_ACCESSORY_IDS);
  }
  return null;
}
