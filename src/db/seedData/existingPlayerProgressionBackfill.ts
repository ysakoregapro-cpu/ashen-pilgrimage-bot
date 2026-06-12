/**
 * 既存プレイヤー向け進行フラグ整合性補完（冪等・INSERT OR IGNORE のみ）
 * 報酬（EXP/G/星片/アイテム）は付与しない。
 */
import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import { BOSS_CHAPTER_REWARDS } from './storyData';

export type ProgressionChainEntry = {
  bossKey: string;
  chapterFlag: string;
  unlockTown?: string;
};

/** 主軸: 序章〜第八章ボス（順序固定） */
export const PROGRESSION_CHAIN: ProgressionChainEntry[] = [
  'boss_starfield_anomaly',
  'boss_lamp_eater',
  'boss_furnace_remains',
  'boss_lost_guardian',
  'boss_page_shadow',
  'boss_forget_seller',
  'boss_unwinding_shadow',
  'boss_old_furnace_keeper',
  'boss_old_king_echo',
].map((bossKey) => ({
  bossKey,
  chapterFlag: BOSS_CHAPTER_REWARDS[bossKey].chapterFlag,
  unlockTown: BOSS_CHAPTER_REWARDS[bossKey].unlockTown,
}));

/** 町到達に必要なチェーン上の最大ボス index（unlockTown 基準 + ヴァルハラ） */
export const MAIN_SPINE_TOWN_BOSS_INDEX: Record<string, number> = {};
for (let i = 0; i < PROGRESSION_CHAIN.length; i++) {
  const town = PROGRESSION_CHAIN[i].unlockTown;
  if (town) MAIN_SPINE_TOWN_BOSS_INDEX[town] = i;
}
MAIN_SPINE_TOWN_BOSS_INDEX.valhalla_fortress = 7;

const CHAPTER_TO_BOSS_INDEX: Record<string, number> = Object.fromEntries(
  PROGRESSION_CHAIN.map((e, i) => [e.chapterFlag, i]),
);

const BOSS_KEY_TO_INDEX: Record<string, number> = Object.fromEntries(
  PROGRESSION_CHAIN.map((e, i) => [e.bossKey, i]),
);

function ensureStoryFlag(db: Database.Database, userId: string, flag: string, ts: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO story_flags (user_id, flag, value, created_at, updated_at)
    VALUES (?, ?, '1', ?, ?)
  `).run(userId, flag, ts, ts);
}

function ensureBossDefeatRow(db: Database.Database, userId: string, bossKey: string, ts: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO boss_defeat_flags (user_id, boss_id, defeated_at)
    VALUES (?, ?, ?)
  `).run(userId, bossKey, ts);
}

function ensureTownUnlock(db: Database.Database, userId: string, townId: string, ts: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO player_town_unlocks (user_id, town_id, unlocked_at)
    VALUES (?, ?, ?)
  `).run(userId, townId, ts);
}

function applyChainUpTo(db: Database.Database, userId: string, maxIdx: number, ts: string): void {
  const limit = Math.min(maxIdx, PROGRESSION_CHAIN.length - 1);
  for (let i = 0; i <= limit; i++) {
    const entry = PROGRESSION_CHAIN[i];
    ensureStoryFlag(db, userId, `boss_defeated:${entry.bossKey}`, ts);
    ensureStoryFlag(db, userId, entry.chapterFlag, ts);
    ensureBossDefeatRow(db, userId, entry.bossKey, ts);
    if (entry.unlockTown) ensureTownUnlock(db, userId, entry.unlockTown, ts);
  }
}

function syncMutualBossFlags(db: Database.Database, userId: string, ts: string): void {
  const fromStory = db.prepare(`
    SELECT REPLACE(flag, 'boss_defeated:', '') AS boss_key
    FROM story_flags WHERE user_id = ? AND flag LIKE 'boss_defeated:%'
  `).all(userId) as Array<{ boss_key: string }>;
  const fromTable = db.prepare(`
    SELECT boss_id AS boss_key FROM boss_defeat_flags WHERE user_id = ?
  `).all(userId) as Array<{ boss_key: string }>;
  const keys = new Set<string>();
  for (const r of fromStory) keys.add(r.boss_key);
  for (const r of fromTable) keys.add(r.boss_key);
  for (const bossKey of keys) {
    if (!BOSS_KEY_TO_INDEX[bossKey]) continue;
    ensureStoryFlag(db, userId, `boss_defeated:${bossKey}`, ts);
    ensureBossDefeatRow(db, userId, bossKey, ts);
  }
}

function computeMaxBossIndex(db: Database.Database, userId: string): number {
  let maxIdx = -1;

  const bump = (idx: number | undefined) => {
    if (idx !== undefined && idx >= 0) maxIdx = Math.max(maxIdx, idx);
  };

  const unlockedTowns = db.prepare(`
    SELECT town_id FROM player_town_unlocks WHERE user_id = ?
  `).all(userId) as Array<{ town_id: string }>;
  for (const t of unlockedTowns) bump(MAIN_SPINE_TOWN_BOSS_INDEX[t.town_id]);

  const player = db.prepare(`
    SELECT current_town_id FROM players WHERE user_id = ?
  `).get(userId) as { current_town_id: string } | undefined;
  if (player?.current_town_id) bump(MAIN_SPINE_TOWN_BOSS_INDEX[player.current_town_id]);

  const chapterFlags = db.prepare(`
    SELECT flag FROM story_flags WHERE user_id = ? AND flag LIKE 'chapter_completed:%'
  `).all(userId) as Array<{ flag: string }>;
  for (const c of chapterFlags) bump(CHAPTER_TO_BOSS_INDEX[c.flag]);

  const bossStoryFlags = db.prepare(`
    SELECT flag FROM story_flags WHERE user_id = ? AND flag LIKE 'boss_defeated:%'
  `).all(userId) as Array<{ flag: string }>;
  for (const b of bossStoryFlags) {
    bump(BOSS_KEY_TO_INDEX[b.flag.replace('boss_defeated:', '')]);
  }

  const bossRows = db.prepare(`
    SELECT boss_id FROM boss_defeat_flags WHERE user_id = ?
  `).all(userId) as Array<{ boss_id: string }>;
  for (const b of bossRows) bump(BOSS_KEY_TO_INDEX[b.boss_id]);

  const valhallaFlag = db.prepare(`
    SELECT 1 FROM story_flags WHERE user_id = ? AND flag IN ('valhalla_unlocked', 'valhalla_first_clear', 'chapter_completed:ch8_valhalla') AND value = '1'
  `).get(userId);
  if (valhallaFlag) maxIdx = Math.max(maxIdx, 7);

  return maxIdx;
}

function backfillPlayer(db: Database.Database, userId: string, ts: string): void {
  syncMutualBossFlags(db, userId, ts);
  const maxIdx = computeMaxBossIndex(db, userId);
  if (maxIdx >= 0) applyChainUpTo(db, userId, maxIdx, ts);

  const valhallaUnlocked = db.prepare(`
    SELECT 1 FROM story_flags WHERE user_id = ? AND flag = 'valhalla_unlocked' AND value = '1'
  `).get(userId);
  if (valhallaUnlocked) {
    ensureTownUnlock(db, userId, 'valhalla_fortress', ts);
  }
}

/** 全既存プレイヤーに進行フラグ整合性補完（seed/migration から呼ぶ） */
export function ensureExistingPlayerProgressionBackfill(db: Database.Database): void {
  const ts = nowIso();
  const users = db.prepare('SELECT user_id FROM players').all() as Array<{ user_id: string }>;
  for (const { user_id } of users) {
    backfillPlayer(db, user_id, ts);
  }
}

/** 検証スクリプト用 — 単一ユーザーを補完 */
export function backfillSinglePlayerProgression(db: Database.Database, userId: string): void {
  backfillPlayer(db, userId, nowIso());
}
