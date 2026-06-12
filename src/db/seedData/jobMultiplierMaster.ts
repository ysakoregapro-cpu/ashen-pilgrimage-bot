import { baseMaxMpFromLevel } from '../../systems/combatMp';

export type JobStatMult = {
  max_hp: number;
  max_mp: number;
  attack: number;
  magic: number;
  defense: number;
  speed: number;
};

export type BaseStats = JobStatMult & {
  spirit: number;
  crit_rate: number;
  crit_damage: number;
  accuracy: number;
  evasion: number;
};

export const MAIN_JOB_MULTS: Record<string, JobStatMult> = {
  '剣士': { max_hp: 1.08, max_mp: 0.95, attack: 1.25, magic: 0.82, defense: 1.05, speed: 1.00 },
  '重騎士': { max_hp: 1.35, max_mp: 0.88, attack: 1.08, magic: 0.75, defense: 1.38, speed: 0.78 },
  '狩人': { max_hp: 0.98, max_mp: 0.98, attack: 1.18, magic: 0.82, defense: 0.92, speed: 1.25 },
  '魔術師': { max_hp: 0.78, max_mp: 1.35, attack: 0.65, magic: 1.45, defense: 0.78, speed: 0.98 },
  '祈祷師': { max_hp: 0.95, max_mp: 1.32, attack: 0.72, magic: 1.25, defense: 0.98, speed: 0.92 },
  '斥候': { max_hp: 0.88, max_mp: 0.95, attack: 1.05, magic: 0.78, defense: 0.75, speed: 1.45 },
  '機工師': { max_hp: 1.00, max_mp: 1.08, attack: 1.12, magic: 1.12, defense: 0.95, speed: 0.96 },
  '格闘士': { max_hp: 1.18, max_mp: 0.78, attack: 1.38, magic: 0.62, defense: 0.92, speed: 1.08 },
  '巡礼者': { max_hp: 1.00, max_mp: 1.00, attack: 1.00, magic: 1.00, defense: 1.00, speed: 1.00 },
};

export const SUB_JOB_MULTS: Record<string, JobStatMult> = {
  '刃走り': { max_hp: 0.98, max_mp: 0.98, attack: 1.12, magic: 0.96, defense: 0.96, speed: 1.16 },
  '城壁番': { max_hp: 1.12, max_mp: 0.96, attack: 0.98, magic: 0.95, defense: 1.18, speed: 0.90 },
  '矢痕読み': { max_hp: 0.98, max_mp: 1.00, attack: 1.10, magic: 0.96, defense: 0.95, speed: 1.10 },
  '灰術士': { max_hp: 0.90, max_mp: 1.14, attack: 0.90, magic: 1.20, defense: 0.90, speed: 0.98 },
  '灯守': { max_hp: 1.00, max_mp: 1.14, attack: 0.94, magic: 1.12, defense: 1.04, speed: 0.95 },
  '影足': { max_hp: 0.92, max_mp: 0.98, attack: 1.05, magic: 0.94, defense: 0.88, speed: 1.22 },
  '歯車工': { max_hp: 1.00, max_mp: 1.08, attack: 1.10, magic: 1.10, defense: 0.98, speed: 0.94 },
  '勁打者': { max_hp: 1.05, max_mp: 0.88, attack: 1.18, magic: 0.88, defense: 0.96, speed: 1.06 },
  '繋ぎ手': { max_hp: 1.00, max_mp: 1.00, attack: 1.00, magic: 1.00, defense: 1.00, speed: 1.00 },
};

export const ADVANCED_MAIN_JOB_MULTS: Record<string, JobStatMult & { base: string }> = {
  '黄昏剣聖': { base: '剣士', max_hp: 1.26, max_mp: 1.02, attack: 1.58, magic: 0.90, defense: 1.18, speed: 1.12 },
  '白銀城塞騎士': { base: '重騎士', max_hp: 1.70, max_mp: 0.95, attack: 1.22, magic: 0.82, defense: 1.75, speed: 0.82 },
  '残響弓王': { base: '狩人', max_hp: 1.12, max_mp: 1.02, attack: 1.48, magic: 0.90, defense: 1.02, speed: 1.55 },
  '星灰大魔導': { base: '魔術師', max_hp: 0.88, max_mp: 1.75, attack: 0.72, magic: 1.85, defense: 0.88, speed: 1.02 },
  '巡礼聖祈師': { base: '祈祷師', max_hp: 1.05, max_mp: 1.68, attack: 0.82, magic: 1.58, defense: 1.10, speed: 0.98 },
  '影渡りの夜王': { base: '斥候', max_hp: 0.98, max_mp: 1.02, attack: 1.30, magic: 0.88, defense: 0.92, speed: 1.85 },
  '深層機工卿': { base: '機工師', max_hp: 1.18, max_mp: 1.30, attack: 1.38, magic: 1.38, defense: 1.08, speed: 1.04 },
  '灰拳闘王': { base: '格闘士', max_hp: 1.45, max_mp: 0.88, attack: 1.78, magic: 0.70, defense: 1.05, speed: 1.18 },
  '星巡の導き手': { base: '巡礼者', max_hp: 1.32, max_mp: 1.32, attack: 1.32, magic: 1.32, defense: 1.32, speed: 1.32 },
};

export const LEGACY_ADVANCED_JOBS = new Set([
  '剣豪', '魔剣士', '城塞騎士', '聖盾士', '追跡者', '弓聖', '灰術師', '星術師',
  '司祭', '癒し手', '暗部', '探索者', '錬機師', '砲術師', '拳闘王', '破戒僧',
]);

export const LEGACY_HIDDEN_JOBS = new Set([
  '星剣士', '黄昏騎士', '創造砲士', '解析者', '執行者', 'アーク技師', '調律師',
]);

export const BASIC_MAIN_JOBS = Object.keys(MAIN_JOB_MULTS);
export const PHASE2_SUB_JOBS = Object.keys(SUB_JOB_MULTS);
export const PHASE2_ADVANCED_MAIN_JOBS = Object.keys(ADVANCED_MAIN_JOB_MULTS);

const NEUTRAL_MULT: JobStatMult = {
  max_hp: 1, max_mp: 1, attack: 1, magic: 1, defense: 1, speed: 1,
};

export function isLegacyJob(jobName: string): boolean {
  return LEGACY_ADVANCED_JOBS.has(jobName) || LEGACY_HIDDEN_JOBS.has(jobName);
}

export function isPhase2AdvancedMain(jobName: string): boolean {
  return jobName in ADVANCED_MAIN_JOB_MULTS;
}

export function isPhase2SubJob(jobName: string): boolean {
  return jobName in SUB_JOB_MULTS;
}

export function isBasicMainJob(jobName: string): boolean {
  return jobName in MAIN_JOB_MULTS;
}

export function computeBaseStatsFromLevel(level: number): BaseStats {
  return {
    max_hp: 100 + (level - 1) * 15,
    max_mp: baseMaxMpFromLevel(level),
    attack: 10 + (level - 1) * 2,
    magic: 10 + (level - 1) * 2,
    defense: 8 + (level - 1) * 1,
    spirit: 8 + (level - 1) * 1,
    speed: 10 + (level - 1) * 1,
    crit_rate: 0.05,
    crit_damage: 1.5,
    accuracy: 0.95,
    evasion: 0.05,
  };
}

function resolveMainMult(mainJob: string): JobStatMult {
  if (mainJob === '未選択') return NEUTRAL_MULT;
  if (isLegacyJob(mainJob)) return NEUTRAL_MULT;
  if (isPhase2AdvancedMain(mainJob)) {
    const adv = ADVANCED_MAIN_JOB_MULTS[mainJob]!;
    return adv;
  }
  return MAIN_JOB_MULTS[mainJob] ?? NEUTRAL_MULT;
}

function resolveSubMult(subJob: string | null): JobStatMult {
  if (!subJob || isLegacyJob(subJob)) return NEUTRAL_MULT;
  return SUB_JOB_MULTS[subJob] ?? NEUTRAL_MULT;
}

/** Apply job multipliers to base stats only (equipment added separately). */
export function applyJobStatMultipliers(base: BaseStats, mainJob: string, subJob: string | null): void {
  const main = resolveMainMult(mainJob);
  const sub = resolveSubMult(subJob);
  base.max_hp = Math.floor(base.max_hp * main.max_hp * sub.max_hp);
  base.max_mp = Math.floor(base.max_mp * main.max_mp * sub.max_mp);
  base.attack = Math.floor(base.attack * main.attack * sub.attack);
  base.magic = Math.floor(base.magic * main.magic * sub.magic);
  base.defense = Math.floor(base.defense * main.defense * sub.defense);
  base.speed = Math.floor(base.speed * main.speed * sub.speed);
  base.max_mp = Math.max(25, base.max_mp);
}
