import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { nowIso } from '../types';
import { JOB_INITIAL_SKILL, JOB_SKILL_UNLOCKS } from '../db/seedData/jobSkillData';
import { getJobLevel, grantInitialJobSkill, initSubJobLevel, syncJobSkillsForLevel } from './jobLevelSystem';

export interface SkillRow {
  id: string;
  name: string;
  job_id: string;
  description: string;
  mp_cost: number;
  power: number;
  skill_type: string;
  element: string | null;
  break_power: number;
  scaling_stat: string;
  secondary_scaling_stat: string | null;
  hit_bonus: number;
  crit_bonus: number;
  priority: number;
  effect_type: string | null;
  status_effect: string | null;
  hits: number;
  effect_json: string | null;
}

export type UsableSkill = SkillRow & { source: string; sourceLabel: string };

export function getSkill(skillId: string): SkillRow | undefined {
  return getDb().prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as SkillRow | undefined;
}

export function learnSkill(userId: string, skillId: string, sourceType = 'job'): boolean {
  const r = getDb().prepare(`
    INSERT OR IGNORE INTO player_skills (user_id, skill_id, learned_at, source_type) VALUES (?, ?, ?, ?)
  `).run(userId, skillId, nowIso(), sourceType);
  return r.changes > 0;
}

/** 職能選択時: 初期スキル1つのみ */
export function grantJobStart(userId: string, jobName: string): void {
  grantInitialJobSkill(userId, jobName);
}

export function grantSubJobStart(userId: string, jobName: string): void {
  initSubJobLevel(userId, jobName);
  const skillId = JOB_INITIAL_SKILL[jobName];
  if (skillId) learnSkill(userId, skillId, 'job');
}

/** 既存プレイヤーの職能スキルを現在のJobLvに同期 */
export function ensureJobSkillsSynced(userId: string, jobName: string): void {
  const row = getJobLevel(userId, jobName);
  if (!row) return;
  syncJobSkillsForLevel(userId, jobName, row.job_level);
}

export function getLearnedSkills(userId: string): SkillRow[] {
  return getDb().prepare(`
    SELECT s.* FROM player_skills ps JOIN skills s ON s.id = ps.skill_id
    WHERE ps.user_id = ? ORDER BY s.name
  `).all(userId) as SkillRow[];
}

export function getLearnedSkillIds(userId: string): Set<string> {
  const rows = getDb().prepare('SELECT skill_id FROM player_skills WHERE user_id = ?').all(userId) as Array<{ skill_id: string }>;
  return new Set(rows.map((r) => r.skill_id));
}

/** 装備中の武器・防具セット・アクセサリー由来スキル（player_skillsに保存しない） */
export function getEquipmentBattleSkills(userId: string): UsableSkill[] {
  const db = getDb();
  const skills: UsableSkill[] = [];
  const seen = new Set<string>();

  const equipped = db.prepare(`
    SELECT e.skill_id, e.passive_skill_id, e.src_skill_id, e.series_id, i.name AS item_name, pe.slot
    FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pe.user_id = ?
  `).all(userId) as Array<{
    skill_id: string | null; passive_skill_id: string | null; src_skill_id: string | null;
    series_id: string | null; item_name: string; slot: string;
  }>;

  const addEqSkill = (skillId: string | null, label: string, source: string) => {
    if (!skillId || seen.has(skillId)) return;
    const row = getSkill(skillId);
    if (!row) return;
    seen.add(skillId);
    skills.push({ ...row, source, sourceLabel: label });
  };

  for (const eq of equipped) {
    addEqSkill(eq.skill_id, eq.item_name, 'equipment');
    addEqSkill(eq.src_skill_id, eq.item_name + '（Src）', 'src');
    if (eq.series_id) {
      const setRows = db.prepare(`
        SELECT effect_json FROM equipment_set_bonuses WHERE set_id = ? ORDER BY piece_count
      `).all(eq.series_id) as Array<{ effect_json: string }>;
      const setCount = equipped.filter((e) => e.series_id === eq.series_id).length;
      for (const b of setRows) {
        const effect = JSON.parse(b.effect_json) as { active_skill_id?: string; passive_skill_id?: string; piece_count?: number };
        const need = effect.piece_count ?? 2;
        if (setCount >= need) {
          addEqSkill(effect.active_skill_id ?? null, '装備シリーズ', 'set');
        }
      }
    }
  }

  return skills;
}

/** 戦闘で使える全スキル = 習得済み + 装備由来 */
export function getUsableBattleSkills(userId: string): UsableSkill[] {
  const player = requirePlayer(userId);
  if (player.main_job !== '未選択') ensureJobSkillsSynced(userId, player.main_job);
  if (player.sub_job) ensureJobSkillsSynced(userId, player.sub_job);

  const learned = getLearnedSkills(userId);
  const eqSkills = getEquipmentBattleSkills(userId);
  const seen = new Set<string>();
  const out: UsableSkill[] = [];

  for (const s of learned) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ ...s, source: 'learned', sourceLabel: '習得' });
  }
  for (const s of eqSkills) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function isUsableBattleSkill(userId: string, skillId: string): boolean {
  return getUsableBattleSkills(userId).some((s) => s.id === skillId);
}

export function skillTypeLabel(type: string): string {
  const map: Record<string, string> = {
    physical: '技', technique: '技', magic: '魔法', divine: '神術', guard: '守り',
    recovery: '回復', support: '支援', debuff: '妨害', break: '崩し', machine: '機工', special: '奥義',
  };
  return map[type] ?? type;
}

export function scalingLabel(stat: string): string {
  const map: Record<string, string> = {
    attack: '攻撃', magic: '魔力', spirit: '精神', defense: '防御', speed: '速度',
    attack_magic: '攻魔', hp_lost: '傷', enemy_break: '体勢',
  };
  return map[stat] ?? stat;
}

export function skillCategory(type: string): string {
  if (['magic'].includes(type)) return '魔法';
  if (['divine'].includes(type)) return '神術';
  if (['recovery'].includes(type)) return '回復';
  if (['guard'].includes(type)) return '守り';
  if (['special'].includes(type)) return '奥義';
  if (['machine'].includes(type)) return '機工';
  return '技';
}

/** @deprecated loadout廃止 — getUsableBattleSkills を使用 */
export function getBattleLoadout(userId: string): SkillRow[] {
  return getUsableBattleSkills(userId);
}

export function getSkillsDisplayData(userId: string) {
  const player = requirePlayer(userId);
  const learned = getLearnedSkills(userId);
  const eqSkills = getEquipmentBattleSkills(userId);
  const learnedIds = getLearnedSkillIds(userId);
  const mainJob = player.main_job;
  const mainLv = mainJob !== '未選択' ? getJobLevel(userId, mainJob) : undefined;
  const subLv = player.sub_job ? getJobLevel(userId, player.sub_job) : undefined;

  const upcoming = mainJob !== '未選択' && mainLv
    ? (JOB_SKILL_UNLOCKS[mainJob] ?? [])
      .filter((u) => u.level > mainLv.job_level && !learnedIds.has(u.skillId))
      .slice(0, 5)
      .map((u) => ({
        level: u.level,
        hint: u.level >= 50 ? 'まだ名を思い出していない技' : (getSkill(u.skillId)?.name ?? '？？？'),
      }))
    : [];

  return { learned, eqSkills, mainJob, mainLv, subJob: player.sub_job, subLv, upcoming };
}
