import { getDb } from '../db/database';
import { getGenericDialogue } from '../db/seedData/dialogues';
import { nowIso } from '../types';
import { formatSpeech, formatSpeechOnly } from '../utils/formatters';

export type DialogueType = 'greeting' | 'smalltalk' | 'explain' | 'hint' | 'action';

export interface NpcRow {
  id: string;
  town_id: string;
  name: string;
  role: string;
  description: string;
  services_json: string | null;
}

export function getNpc(npcId: string): NpcRow | undefined {
  return getDb().prepare('SELECT * FROM npcs WHERE id = ?').get(npcId) as NpcRow | undefined;
}

export function getTownNpcs(townId: string): NpcRow[] {
  return getDb().prepare('SELECT * FROM npcs WHERE town_id = ? ORDER BY name').all(townId) as NpcRow[];
}

export function getDialogue(npcId: string, type: DialogueType, visitHint = false): string {
  const rows = getDb().prepare(`
    SELECT text FROM npc_dialogues WHERE npc_id = ? AND dialogue_type = ? ORDER BY variant
  `).all(npcId, type) as Array<{ text: string }>;

  if (rows.length) {
    const idx = visitHint ? 0 : Math.floor(Math.random() * rows.length);
    return rows[idx]!.text;
  }
  return getGenericDialogue(type);
}

export function getNpcGreeting(npcId: string, isFirstMeeting: boolean): string {
  if (isFirstMeeting) {
    const first = getDb().prepare(`
      SELECT text FROM npc_dialogues WHERE npc_id = ? AND dialogue_type = 'greeting' ORDER BY variant LIMIT 1
    `).get(npcId) as { text: string } | undefined;
    if (first) return first.text;
  }
  return getDialogue(npcId, 'greeting');
}

export function buildNpcBody(npc: NpcRow, speech: string): string {
  return formatSpeech(npc.name, speech);
}

export function formatNpcSpeechOnly(speech: string): string {
  return formatSpeechOnly(speech);
}

export function getNpcFacilityLink(npcId: string): string | null {
  const fac = getDb().prepare('SELECT id, name FROM facilities WHERE npc_id = ? LIMIT 1').get(npcId) as { id: string; name: string } | undefined;
  return fac?.id ?? null;
}

export function recordNpcTalk(userId: string, npcId: string): void {
  const ts = nowIso();
  getDb().prepare(`
    INSERT INTO player_town_visits (user_id, town_id, visit_count, first_visit_at, last_visit_at)
    SELECT ?, town_id, 1, ?, ? FROM npcs WHERE id = ?
    ON CONFLICT(user_id, town_id) DO UPDATE SET last_visit_at = ?
  `).run(userId, ts, ts, npcId, ts);
}
