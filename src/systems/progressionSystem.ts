import { getDb } from '../db/database';
import { requirePlayer, getUnlockedTowns } from './playerSystem';
import { hasStoryFlag } from './storySystem';
import {
  FEATURE_UNLOCKS, CHAPTER_LEVEL_BANDS, type FeatureKey,
} from '../db/seedData/progressionMaster';
import { getFacilitiesForTown } from './facilitySystem';
import { CHAPTERS } from '../db/seedData/storyData';
import { ELEMENT_LABELS } from '../db/seedData/elementMaster';
import type { GameElement } from '../db/seedData/elementMaster';

export function isFeatureUnlocked(userId: string, feature: FeatureKey): boolean {
  const def = FEATURE_UNLOCKS.find((f) => f.feature === feature);
  if (!def) return false;
  if (!hasStoryFlag(userId, def.requiredFlag)) return false;
  if (def.requiredTown) {
    const unlocked = getUnlockedTowns(userId);
    if (!unlocked.includes(def.requiredTown)) return false;
    const facilities = getFacilitiesForTown(def.requiredTown);
    const types: Record<FeatureKey, string[]> = {
      blacksmith: ['blacksmith', 'repair_shop'],
      src_forge: ['src_forge'],
      exchange: ['exchange', 'exchange_under', 'exchange_fort'],
      raid: ['raid_terminal'],
      valhalla: [],
      prep_room: ['prep_room'],
      market: ['item_shop', 'market'],
    };
    const need = types[feature];
    if (need.length && !facilities.some((f) => need.includes(f.type))) return false;
  }
  return true;
}

export function townHasFacilityType(townId: string, types: string[]): boolean {
  return getFacilitiesForTown(townId).some((f) => types.includes(f.type));
}

export function getRoadmapHints(userId: string): {
  now: string[]; next: string[]; future: string[];
} {
  const player = requirePlayer(userId);
  const ps = getDb().prepare('SELECT current_chapter_id FROM player_story WHERE user_id = ?').get(userId) as {
    current_chapter_id: string;
  } | undefined;
  const chapterId = ps?.current_chapter_id ?? 'prologue';
  const band = CHAPTER_LEVEL_BANDS[chapterId] ?? CHAPTER_LEVEL_BANDS.prologue!;

  const now: string[] = [];
  const next: string[] = [];
  const future: string[] = [];

  if (player.main_job === '未選択') now.push('冒険者受付で職能を決める');
  if (player.hp < player.max_hp * 0.5) now.push('宿で休む');
  now.push('探索で経験値と素材を集める');
  now.push(band.exploreHint);

  if (townHasFacilityType(player.current_town_id, ['item_shop', 'market'])) {
    now.push('売店で回復薬を補充する');
  } else {
    future.push('売店（現在地の町）');
  }

  if (isFeatureUnlocked(userId, 'blacksmith') && townHasFacilityType(player.current_town_id, ['blacksmith'])) {
    now.push('鍛冶場で粗い強化石を使い+1〜+3強化');
  } else if (isFeatureUnlocked(userId, 'blacksmith')) {
    next.push('白銀鉱山街の鍛冶場で装備強化');
  } else {
    future.push(FEATURE_UNLOCKS.find((f) => f.feature === 'blacksmith')!.hintWhenLocked);
  }

  if (isFeatureUnlocked(userId, 'src_forge')) {
    next.push('伝承の炉でSrc武器を育てる');
  } else {
    future.push(FEATURE_UNLOCKS.find((f) => f.feature === 'src_forge')!.hintWhenLocked);
  }

  if (isFeatureUnlocked(userId, 'raid')) {
    next.push('ヴァルハラでレイド準備');
  } else {
    future.push(FEATURE_UNLOCKS.find((f) => f.feature === 'raid')!.hintWhenLocked);
  }

  if (isFeatureUnlocked(userId, 'valhalla')) {
    next.push('空中要塞ヴァルハラへ向かう');
  } else {
    future.push(FEATURE_UNLOCKS.find((f) => f.feature === 'valhalla')!.hintWhenLocked);
  }

  const chapter = CHAPTERS.find((c) => c.id === chapterId);
  if (chapter && !hasStoryFlag(userId, chapter.completeFlag)) {
    next.push(`次の目標: ${chapter.summary}`);
  }

  return { now: [...new Set(now)], next: [...new Set(next)], future: [...new Set(future)] };
}

export function formatElementHint(elements: GameElement[]): string {
  return elements.map((e) => ELEMENT_LABELS[e]).join('・');
}
