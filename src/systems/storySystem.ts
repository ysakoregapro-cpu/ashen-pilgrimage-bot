import type Database from 'better-sqlite3';
import { getDb } from '../db/database';
import { nowIso } from '../types';
import { unlockTownForPlayer } from './townSystem';
import { requirePlayer } from './playerSystem';
import {
  CHAPTERS,
  STORY_EVENTS,
  NPC_STORY_DIALOGUES,
  JOURNAL_LOCKED_PAGES,
  MONSTER_TO_STORY_BOSS,
  BOSS_CHAPTER_REWARDS,
  JOB_QUEST_TITLES,
  JOBS,
  TOWN_ARRIVAL_TEXT,
  type StoryEventDef,
  type NpcStoryLine,
} from '../db/seedData/storyData';
import { baseEmbed } from '../utils/embeds';
import { nextActionButtons } from '../utils/nextActionButtons';
import type { UiPayload } from '../utils/townUi';
import { formatFieldTitle, formatBulletList } from '../utils/formatters';
import { getRoadmapHints } from './progressionSystem';

export type StoryEventPayload = UiPayload;

function eventSeenKey(eventId: string): string {
  return `story_event:${eventId}`;
}

export function getStoryFlag(userId: string, flag: string): string | null {
  const row = getDb().prepare('SELECT value FROM story_flags WHERE user_id = ? AND flag = ?').get(userId, flag) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setStoryFlag(userId: string, flag: string, value = '1'): void {
  const ts = nowIso();
  getDb().prepare(`
    INSERT INTO story_flags (user_id, flag, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, flag) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(userId, flag, value, ts, ts);
}

export function hasStoryFlag(userId: string, flag: string): boolean {
  return getStoryFlag(userId, flag) === '1';
}

export function getPlayerStory(userId: string) {
  return getDb().prepare('SELECT * FROM player_story WHERE user_id = ?').get(userId) as {
    user_id: string; current_chapter_id: string; current_objective: string; updated_at: string;
  } | undefined;
}

export function setCurrentChapter(userId: string, chapterId: string, objective: string): void {
  const ts = nowIso();
  getDb().prepare(`
    INSERT INTO player_story (user_id, current_chapter_id, current_objective, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET current_chapter_id = excluded.current_chapter_id, current_objective = excluded.current_objective, updated_at = excluded.updated_at
  `).run(userId, chapterId, objective, ts);
}

export function getCurrentObjective(userId: string): string {
  return getPlayerStory(userId)?.current_objective ?? 'アオイと話し、はじまりの星原を探索する';
}

function ensurePlayerStory(userId: string): void {
  if (!getPlayerStory(userId)) {
    setCurrentChapter(userId, 'prologue', 'アオイと話し、はじまりの星原を探索する');
  }
}

export function buildStoryEventPayload(title: string, body: string): StoryEventPayload {
  const fullTitle = title.startsWith('灰星巡礼録') ? title : `灰星巡礼録 | ${title}`;
  const footer = '\n\n*旅の記録に、新しい頁が刻まれた。*';
  return {
    embeds: [baseEmbed(fullTitle, body + footer).setColor(0x8b9dc3)],
    components: nextActionButtons('story_event'),
  };
}

function findEvents(triggerType: string, triggerKey: string): StoryEventDef[] {
  return STORY_EVENTS.filter((e) => e.triggerType === triggerType && e.triggerKey === triggerKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function applyEventSideEffects(userId: string, event: StoryEventDef): void {
  if (event.setFlag) setStoryFlag(userId, event.setFlag);
  if (event.setChapter && event.objective) setCurrentChapter(userId, event.setChapter, event.objective);
  if (event.unlockTown) unlockTownForPlayer(userId, event.unlockTown);
}

function runEvents(userId: string, triggerType: string, triggerKey: string): StoryEventPayload[] {
  ensurePlayerStory(userId);
  const results: StoryEventPayload[] = [];
  for (const event of findEvents(triggerType, triggerKey)) {
    if (hasStoryFlag(userId, eventSeenKey(event.id))) continue;
    if (event.requiredFlag && !hasStoryFlag(userId, event.requiredFlag)) continue;
    applyEventSideEffects(userId, event);
    setStoryFlag(userId, eventSeenKey(event.id));
    results.push(buildStoryEventPayload(event.title, event.body));
  }
  return results;
}

export function triggerStoryEvent(userId: string, triggerType: string, triggerKey: string): StoryEventPayload[] {
  return runEvents(userId, triggerType, triggerKey);
}

export function triggerStartComplete(userId: string): StoryEventPayload[] {
  ensurePlayerStory(userId);
  return runEvents(userId, 'start_complete', 'start_complete');
}

export function triggerTownFirstArrival(userId: string, townId: string): StoryEventPayload[] {
  if (townId === 'start_starfield' && hasStoryFlag(userId, 'valhalla_first_clear') && !hasStoryFlag(userId, 'ending_connectors_revealed')) {
    return runEvents(userId, 'epilogue_return', 'start_starfield_return');
  }

  const key = `town_first_arrival:${townId}`;
  if (hasStoryFlag(userId, key)) return [];
  return runEvents(userId, 'town_first_arrival', key);
}

export function triggerFirstExplore(userId: string): StoryEventPayload[] {
  if (hasStoryFlag(userId, 'first_explore')) return [];
  setStoryFlag(userId, 'first_explore');
  return [];
}

export function triggerFirstBattle(userId: string): StoryEventPayload[] {
  if (hasStoryFlag(userId, 'first_battle')) return [];
  setStoryFlag(userId, 'first_battle');
  return [];
}

export function triggerFirstVictory(userId: string): StoryEventPayload[] {
  if (hasStoryFlag(userId, 'first_victory')) return [];
  return runEvents(userId, 'first_victory', 'first_victory');
}

export function triggerFirstDefeat(userId: string): StoryEventPayload[] {
  if (hasStoryFlag(userId, 'first_defeat')) return [];
  return runEvents(userId, 'first_defeat', 'first_defeat');
}

export function triggerFirstJobLevelUp(userId: string, jobName: string): StoryEventPayload[] {
  checkJobQuests(userId, jobName);
  if (hasStoryFlag(userId, 'first_job_level_up')) return [];
  return runEvents(userId, 'first_job_level_up', 'first_job_level_up');
}

export function triggerBossDefeated(userId: string, monsterId: string): StoryEventPayload[] {
  const bossKey = MONSTER_TO_STORY_BOSS[monsterId];
  if (!bossKey) return [];

  const existing = getDb().prepare('SELECT 1 FROM boss_defeat_flags WHERE user_id = ? AND boss_id = ?').get(userId, bossKey);
  if (existing) return [];

  const payloads = runEvents(userId, 'boss_defeated', `boss_defeated:${bossKey}`);

  getDb().prepare('INSERT INTO boss_defeat_flags (user_id, boss_id, defeated_at) VALUES (?, ?, ?)').run(userId, bossKey, nowIso());
  setStoryFlag(userId, `boss_defeated:${bossKey}`);

  const rewards = BOSS_CHAPTER_REWARDS[bossKey];
  if (rewards) {
    setStoryFlag(userId, rewards.chapterFlag);
    if (rewards.unlockTown) unlockTownForPlayer(userId, rewards.unlockTown);
    if (rewards.starShard) setStoryFlag(userId, `star_shard:${rewards.starShard}`);
    const ch = CHAPTERS.find((c) => c.completeFlag === rewards.chapterFlag);
    if (ch) {
      const next = CHAPTERS.find((c) => c.sort === ch.sort + 1);
      if (next) setCurrentChapter(userId, next.id, next.summary);
    }
  }

  if (bossKey === 'boss_old_king_echo') {
    setStoryFlag(userId, 'valhalla_first_clear');
    setCurrentChapter(userId, 'epilogue_connectors', 'はじまりの星原へ戻る');
  }

  return payloads;
}

export function checkJobQuests(userId: string, jobName: string): void {
  const row = getDb().prepare('SELECT job_level FROM player_job_levels WHERE user_id = ? AND job_name = ?').get(userId, jobName) as { job_level: number } | undefined;
  if (!row) return;
  for (const lv of [10, 30, 50, 70]) {
    if (row.job_level < lv) continue;
    const questId = `jq_${jobName}_${lv}`;
    if (!JOB_QUEST_TITLES[jobName]?.[lv]) continue;
    getDb().prepare(`
      INSERT OR IGNORE INTO player_job_quests (user_id, quest_id, status, progress, updated_at)
      VALUES (?, ?, 'available', 0, ?)
    `).run(userId, questId, nowIso());
    getDb().prepare(`
      UPDATE player_job_quests SET status = 'available', updated_at = ? WHERE user_id = ? AND quest_id = ? AND status = 'not_started'
    `).run(nowIso(), userId, questId);
  }
}

export function getNpcDialogueStage(userId: string, npcId: string): number {
  const row = getDb().prepare('SELECT dialogue_stage FROM npc_dialogue_states WHERE user_id = ? AND npc_id = ?').get(userId, npcId) as { dialogue_stage: number } | undefined;
  return row?.dialogue_stage ?? 0;
}

export function advanceNpcDialogue(userId: string, npcId: string): number {
  const stage = getNpcDialogueStage(userId, npcId);
  const next = stage + 1;
  const ts = nowIso();
  getDb().prepare(`
    INSERT INTO npc_dialogue_states (user_id, npc_id, dialogue_stage, last_seen_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, npc_id) DO UPDATE SET dialogue_stage = excluded.dialogue_stage, last_seen_at = excluded.last_seen_at
  `).run(userId, npcId, next, ts);
  return next;
}

function pickNpcLine(userId: string, npcId: string): NpcStoryLine | null {
  const stage = getNpcDialogueStage(userId, npcId);
  const exact = NPC_STORY_DIALOGUES.find((l) => l.npcId === npcId && l.stage === stage);
  if (exact && (!exact.requiredFlag || hasStoryFlag(userId, exact.requiredFlag))) return exact;
  const fallback = NPC_STORY_DIALOGUES.filter((l) => l.npcId === npcId && l.stage <= stage)
    .filter((l) => !l.requiredFlag || hasStoryFlag(userId, l.requiredFlag));
  return fallback[fallback.length - 1] ?? null;
}

export function getNpcDialogueForPlayer(userId: string, npcId: string): { title: string; body: string } | null {
  const line = pickNpcLine(userId, npcId);
  if (!line) return null;
  return { title: line.title, body: line.body };
}

export function getTownStoryState(userId: string, townId: string): 'before' | 'after' | 'normal' {
  const bossMap: Record<string, string> = {
    start_starfield: 'boss_starfield_anomaly',
    twilight_port: 'boss_lamp_eater',
    silver_mine: 'boss_furnace_remains',
    mist_forest: 'boss_lost_guardian',
    moon_library: 'boss_page_shadow',
    forgotten_market: 'boss_forget_seller',
    hourglass_city: 'boss_unwinding_shadow',
    deep_furnace_outpost: 'boss_old_furnace_keeper',
  };
  const boss = bossMap[townId];
  if (!boss) return 'normal';
  return hasStoryFlag(userId, `boss_defeated:${boss}`) ? 'after' : 'before';
}

export function getPostBossTownDescription(userId: string, townId: string, defaultDesc: string): string {
  const texts = TOWN_ARRIVAL_TEXT[townId];
  if (!texts) return defaultDesc;
  const state = getTownStoryState(userId, townId);
  if (state === 'before') return texts.before;
  if (state === 'after') return texts.after;
  return defaultDesc;
}

export function getPilgrimageJournal(userId: string): UiPayload {
  ensurePlayerStory(userId);
  const ps = getPlayerStory(userId)!;
  const chapter = CHAPTERS.find((c) => c.id === ps.current_chapter_id);
  const chapterTitle = chapter?.title ?? '序章: 灰の下の星';

  const recorded: string[] = [];
  if (hasStoryFlag(userId, 'start_complete')) recorded.push('アオイと出会った');
  const player = requirePlayer(userId);
  if (player.main_job !== '未選択') recorded.push(`最初の職能「${player.main_job}」を選んだ`);
  if (hasStoryFlag(userId, 'first_victory')) recorded.push('星原スライムを倒した');
  if (hasStoryFlag(userId, 'boss_defeated:boss_starfield_anomaly')) recorded.push('星原の異変を鎮めた');
  if (hasStoryFlag(userId, 'town_first_arrival:twilight_port')) recorded.push('薄明の港町に着いた');
  if (hasStoryFlag(userId, 'valhalla_first_clear')) recorded.push('ヴァルハラを踏破した');
  if (hasStoryFlag(userId, 'ending_connectors_revealed')) recorded.push('繋ぎ手として迎えられた');

  const objectives = ps.current_objective.split(/[。、]/).filter(Boolean).map((s) => s.trim());
  const roadmap = getRoadmapHints(userId);
  const locked = JOURNAL_LOCKED_PAGES.filter((p) => !hasStoryFlag(userId, p.flag)).map((p) => p.label);

  const jobLines: string[] = [];
  if (player.main_job !== '未選択') {
    const jl = getDb().prepare('SELECT job_level FROM player_job_levels WHERE user_id = ? AND job_name = ?').get(userId, player.main_job) as { job_level: number } | undefined;
    if (jl) jobLines.push(`${player.main_job} Lv${jl.job_level}`);
  }

  const questRows = getDb().prepare(`
    SELECT jq.title FROM player_job_quests pq JOIN job_quests jq ON pq.quest_id = jq.id
    WHERE pq.user_id = ? AND pq.status = 'available' LIMIT 3
  `).all(userId) as Array<{ title: string }>;

  const body = [
    formatFieldTitle('現在の章'),
    chapterTitle,
    '',
    formatFieldTitle('いまの道しるべ'),
    formatBulletList(objectives.length ? objectives : [ps.current_objective]),
    '',
    formatFieldTitle('今できること'),
    formatBulletList(roadmap.now),
    '',
    formatFieldTitle('次に目指すこと'),
    formatBulletList(roadmap.next.length ? roadmap.next : ['—']),
    '',
    formatFieldTitle('今後解放される要素'),
    formatBulletList(roadmap.future.length ? roadmap.future : ['—']),
    '',
    formatFieldTitle('記されたこと'),
    formatBulletList(recorded.length ? recorded : ['—']),
    '',
    formatFieldTitle('職能の歩み'),
    formatBulletList(jobLines.length ? jobLines : ['—']),
  ].join('\n');

  const embed = baseEmbed('灰星巡礼録 | 巡礼手帳', body);
  if (questRows.length) {
    embed.addFields({ name: formatFieldTitle('職能の試練'), value: formatBulletList(questRows.map((q) => q.title)), inline: false });
  }
  if (locked.length) {
    embed.addFields({
      name: formatFieldTitle('まだ読めない頁'),
      value: locked.map((l) => `・■■${l}`).join('\n'),
      inline: false,
    });
  }

  return {
    embeds: [embed],
    components: nextActionButtons('guide'),
  };
}

export function seedStoryTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_chapters (
      id TEXT PRIMARY KEY, chapter_no INTEGER, title TEXT, summary TEXT,
      start_town_id TEXT, required_flag TEXT, completion_flag TEXT,
      reward_text TEXT, is_main INTEGER DEFAULT 1, sort_order INTEGER
    );
    CREATE TABLE IF NOT EXISTS player_story (
      user_id TEXT PRIMARY KEY, current_chapter_id TEXT, current_objective TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS story_flags (
      user_id TEXT, flag TEXT, value TEXT DEFAULT '1', created_at TEXT, updated_at TEXT,
      PRIMARY KEY(user_id, flag)
    );
    CREATE TABLE IF NOT EXISTS story_events (
      id TEXT PRIMARY KEY, chapter_id TEXT, event_type TEXT, trigger_type TEXT, trigger_key TEXT,
      required_flag TEXT, set_flag TEXT, title TEXT, body TEXT, npc_id TEXT, town_id TEXT, sort_order INTEGER
    );
    CREATE TABLE IF NOT EXISTS npc_dialogue_states (
      user_id TEXT, npc_id TEXT, dialogue_stage INTEGER DEFAULT 0, last_seen_at TEXT,
      PRIMARY KEY(user_id, npc_id)
    );
    CREATE TABLE IF NOT EXISTS npc_story_dialogues (
      npc_id TEXT, stage INTEGER, required_flag TEXT, title TEXT, body TEXT, set_flag TEXT,
      PRIMARY KEY(npc_id, stage)
    );
    CREATE TABLE IF NOT EXISTS job_quests (
      id TEXT PRIMARY KEY, job_name TEXT, quest_level INTEGER, title TEXT, description TEXT,
      required_flag TEXT, completion_flag TEXT, reward_skill_id TEXT, reward_text TEXT
    );
    CREATE TABLE IF NOT EXISTS player_job_quests (
      user_id TEXT, quest_id TEXT, status TEXT DEFAULT 'not_started', progress INTEGER DEFAULT 0, updated_at TEXT,
      PRIMARY KEY(user_id, quest_id)
    );
    CREATE TABLE IF NOT EXISTS boss_defeat_flags (
      user_id TEXT, boss_id TEXT, defeated_at TEXT, PRIMARY KEY(user_id, boss_id)
    );
  `);

  const insCh = db.prepare(`
    INSERT INTO story_chapters (id, chapter_no, title, summary, start_town_id, required_flag, completion_flag, reward_text, is_main, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, summary=excluded.summary, completion_flag=excluded.completion_flag
  `);
  for (const c of CHAPTERS) {
    insCh.run(c.id, c.no, c.title, c.summary, c.startTown, c.reqFlag || null, c.completeFlag, c.reward, c.sort);
  }

  const insEv = db.prepare(`
    INSERT INTO story_events (id, chapter_id, event_type, trigger_type, trigger_key, required_flag, set_flag, title, body, npc_id, town_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET body=excluded.body, title=excluded.title, trigger_type=excluded.trigger_type, trigger_key=excluded.trigger_key
  `);
  for (const e of STORY_EVENTS) {
    insEv.run(e.id, e.chapterId, e.eventType, e.triggerType, e.triggerKey, e.requiredFlag ?? null, e.setFlag ?? null, e.title, e.body, e.npcId ?? null, e.townId ?? null, e.sortOrder);
  }

  const insNpc = db.prepare(`
    INSERT INTO npc_story_dialogues (npc_id, stage, required_flag, title, body, set_flag)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(npc_id, stage) DO UPDATE SET body=excluded.body, title=excluded.title
  `);
  for (const l of NPC_STORY_DIALOGUES) {
    insNpc.run(l.npcId, l.stage, l.requiredFlag ?? null, l.title, l.body, l.setFlag ?? null);
  }

  const insJq = db.prepare(`
    INSERT INTO job_quests (id, job_name, quest_level, title, description, required_flag, completion_flag, reward_skill_id, reward_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description
  `);
  for (const job of JOBS) {
    for (const lv of [10, 30, 50, 70]) {
      const t = JOB_QUEST_TITLES[job]?.[lv];
      if (!t) continue;
      const id = `jq_${job}_${lv}`;
      insJq.run(id, job, lv, t.title, t.desc, `job_level:${job}:${lv}`, `job_quest:${id}`, null, `${t.title}を達成`);
    }
  }
}
