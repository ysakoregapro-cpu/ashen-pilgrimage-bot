import type Database from 'better-sqlite3';
import { getDb } from '../db/database';
import { ensureMonstersIsBossColumn, monstersHasIsBossColumn } from '../db/monsterSchema';
import { MONSTER_TO_STORY_BOSS } from '../db/seedData/storyData';

const STORY_BOSS_MONSTER_IDS = new Set(Object.keys(MONSTER_TO_STORY_BOSS));

export type MonsterBossRow = {
  name: string;
  is_boss?: number;
  ai_pattern_json?: string | null;
  level?: number;
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

export function isMidBossMonster(monsterId: string, row?: Pick<MonsterBossRow, 'is_boss' | 'level'>): boolean {
  if (STORY_BOSS_MONSTER_IDS.has(monsterId)) return false;
  return row?.is_boss === 1 || monsterId.includes('_boss') || monsterId.includes('_keeper');
}

export function getMonsterRow(db: Database.Database, monsterId: string): MonsterBossRow | undefined {
  ensureMonstersIsBossColumn(db);
  if (monstersHasIsBossColumn(db)) {
    try {
      return db.prepare('SELECT name, is_boss, ai_pattern_json, level FROM monsters WHERE id = ?').get(monsterId) as
        | MonsterBossRow
        | undefined;
    } catch {
      /* fall through to legacy columns */
    }
  }
  return db.prepare('SELECT name, ai_pattern_json, level FROM monsters WHERE id = ?').get(monsterId) as
    | MonsterBossRow
    | undefined;
}

export function isBossMonsterById(monsterId: string): boolean {
  if (STORY_BOSS_MONSTER_IDS.has(monsterId)) return true;
  const row = getMonsterRow(getDb(), monsterId);
  return row ? isBossMonster(monsterId, row) : false;
}

export type AreaThreatLabels = {
  storyBoss: boolean;
  midBoss: boolean;
  elite: boolean;
  rare: boolean;
};

export function classifyAreaThreats(
  pool: Array<{ monster_id: string; weight: number }>,
): AreaThreatLabels {
  const db = getDb();
  let storyBoss = false;
  let midBoss = false;
  let elite = false;
  let rare = false;
  const maxWeight = Math.max(...pool.map((p) => p.weight), 1);

  for (const entry of pool) {
    const row = getMonsterRow(db, entry.monster_id);
    if (!row) continue;
    if (STORY_BOSS_MONSTER_IDS.has(entry.monster_id)) storyBoss = true;
    else if (isMidBossMonster(entry.monster_id, row)) midBoss = true;
    else if (row.is_boss === 1) elite = true;
    if (entry.weight <= maxWeight * 0.35) rare = true;
  }
  return { storyBoss, midBoss, elite, rare };
}

export function formatAreaThreatLabels(threats: AreaThreatLabels): string[] {
  const lines: string[] = [];
  if (threats.storyBoss) lines.push('ボスあり');
  if (threats.midBoss) lines.push('中ボスあり');
  if (threats.elite) lines.push('強敵出現あり');
  if (threats.rare) lines.push('レア敵あり');
  return lines;
}
