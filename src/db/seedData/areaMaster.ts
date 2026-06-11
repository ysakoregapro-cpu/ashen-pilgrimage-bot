import type { GameElement } from './elementMaster';
import { getMonsterElementDef } from './monsterElementMaster';

export type AreaMasterEntry = {
  areaId: string;
  usefulElements: GameElement[];
  warningText?: string;
  unlockFlag?: string;
  nearbyBlacksmith?: boolean;
  nearbyShop?: boolean;
  nearbyRaid?: boolean;
};

const TOWN_ELEMENTS: Record<string, GameElement[]> = {
  start_starfield: ['neutral', 'light', 'beast'],
  old_road_village: ['neutral', 'beast'],
  twilight_port: ['ice', 'light', 'beast', 'undead'],
  rain_ruins: ['ice', 'wind', 'undead'],
  silver_mine: ['ice', 'machine', 'thunder'],
  mist_forest: ['wind', 'beast', 'dark'],
  moon_library: ['light', 'dark', 'undead'],
  forgotten_market: ['dark', 'machine', 'old_king'],
  hourglass_city: ['light', 'dark', 'old_king'],
  ash_capital: ['old_king', 'undead', 'light'],
  deep_furnace_outpost: ['fire', 'machine', 'old_king'],
  valhalla_fortress: ['valhalla', 'light', 'old_king', 'dark'],
};

export function getUsefulElementsForTown(townId: string): GameElement[] {
  return TOWN_ELEMENTS[townId] ?? ['neutral'];
}

/** Derive 2–3 recommended elements from monster weaknesses in an area pool */
export function getRecommendedElementsFromMonsters(
  entries: Array<{ monsterId: string; areaTag: string }>,
  townId: string,
): GameElement[] {
  const counts = new Map<GameElement, number>();
  for (const { monsterId, areaTag } of entries) {
    const def = getMonsterElementDef(monsterId, areaTag);
    for (const w of def.weaknesses) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([el]) => el);
  if (sorted.length >= 2) return sorted.slice(0, 3);
  const townFallback = getUsefulElementsForTown(townId);
  const merged = [...sorted];
  for (const el of townFallback) {
    if (!merged.includes(el) && merged.length < 3) merged.push(el);
  }
  return merged.slice(0, 3);
}

export function buildAreaMasterEntry(areaId: string, townId: string): AreaMasterEntry {
  const usefulElements = getUsefulElementsForTown(townId);
  return {
    areaId,
    usefulElements,
    nearbyShop: true,
    nearbyBlacksmith: townId === 'silver_mine' || townId === 'deep_furnace_outpost' || townId === 'valhalla_fortress',
    nearbyRaid: townId === 'valhalla_fortress',
    unlockFlag: townId === 'valhalla_fortress' ? 'chapter_completed:ch7_furnace' : undefined,
  };
}
