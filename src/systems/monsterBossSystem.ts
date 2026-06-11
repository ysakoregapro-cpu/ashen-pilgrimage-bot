import type Database from 'better-sqlite3';
import { getDb } from '../db/database';
import { ensureMonstersIsBossColumn, monstersHasIsBossColumn } from '../db/monsterSchema';
import { MONSTER_TO_STORY_BOSS } from '../db/seedData/storyData';

const STORY_BOSS_MONSTER_IDS = new Set(Object.keys(MONSTER_TO_STORY_BOSS));

export type MonsterBossRow = {
  name: string;
  is_boss?: number;
  ai_pattern_json?: string | null;
};

function parseAiPatternBoss(aiPatternJson: string | null | undefined): boolean {
  if (!aiPatternJson) return false;
  try {
    const parsed = JSON.parse(aiPatternJson) as { pattern?: string };
    return parsed.pattern === 'boss';
  } catch {
    return aiPatternJson.includes('"boss"');
  }
}

export function isBossMonster(
  monsterId: string,
  row?: Pick<MonsterBossRow, 'is_boss' | 'ai_pattern_json'>,
): boolean {
  if (STORY_BOSS_MONSTER_IDS.has(monsterId)) return true;
  if (row?.is_boss === 1) return true;
  if (parseAiPatternBoss(row?.ai_pattern_json)) return true;
  return false;
}

export function getMonsterRow(db: Database.Database, monsterId: string): MonsterBossRow | undefined {
  ensureMonstersIsBossColumn(db);
  if (monstersHasIsBossColumn(db)) {
    try {
      return db.prepare('SELECT name, is_boss, ai_pattern_json FROM monsters WHERE id = ?').get(monsterId) as
        | MonsterBossRow
        | undefined;
    } catch {
      /* fall through to legacy columns */
    }
  }
  return db.prepare('SELECT name, ai_pattern_json FROM monsters WHERE id = ?').get(monsterId) as
    | MonsterBossRow
    | undefined;
}

export function isBossMonsterById(monsterId: string): boolean {
  if (STORY_BOSS_MONSTER_IDS.has(monsterId)) return true;
  const row = getMonsterRow(getDb(), monsterId);
  return row ? isBossMonster(monsterId, row) : false;
}
